import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_LOBBY = {
  onlinePlayers: 0,
  waitingPlayers: 0,
  rooms: [],
  players: [],
};

const SNAPSHOT_LIMIT = 60;

export function useGameClient() {
  const [connectionState, setConnectionState] = useState('connecting');
  const [config, setConfig] = useState({ map: null, difficulties: [], modes: [], avatars: [] });
  const [playerId, setPlayerId] = useState(null);
  const [playerMeta, setPlayerMeta] = useState({ name: '', avatarKey: '', status: 'idle' });
  const [lobby, setLobby] = useState(EMPTY_LOBBY);
  const [queueState, setQueueState] = useState({ status: 'idle', position: null, needed: null });
  const [latency, setLatency] = useState({ budget: 0, live: null });
  const [challengeInbox, setChallengeInbox] = useState([]);
  const [challengeStatus, setChallengeStatus] = useState(null);
  const [matchState, setMatchState] = useState({
    assignment: null,
    snapshots: [],
    phase: 'idle',
    lastEvent: null,
    roster: [],
    results: null,
  });
  const [localScoreEvent, setLocalScoreEvent] = useState(null);

  const wsRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const playerIdRef = useRef(null);
  const previousScoresRef = useRef(new Map());

  const serverUrl = useMemo(() => {
    if (import.meta.env.VITE_SERVER_URL) {
      return import.meta.env.VITE_SERVER_URL;
    }
    if (import.meta.env.DEV) {
      return 'ws://localhost:8080';
    }
    const { protocol, host } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${host}`;
  }, []);

  const sendMessage = useCallback((payload) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket(serverUrl);
    wsRef.current = ws;

    const handleOpen = () => {
      setConnectionState('connected');
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      pingIntervalRef.current = setInterval(() => {
        const sentAt = performance.now();
        sendMessage({ type: 'latencyPing', sentAt });
      }, 2000);
    };

    const handleClose = () => {
      setConnectionState('disconnected');
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    const handleMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      switch (message.type) {
        case 'welcome': {
          setPlayerId(message.playerId);
          playerIdRef.current = message.playerId;
          setPlayerMeta({
            name: message.player?.name || `Pilot-${message.playerId.slice(0, 3)}`,
            avatarKey: message.player?.avatarKey || message.avatars?.[0]?.key || 'onyx',
            status: message.player?.status || 'idle',
          });
          setConfig({
            map: message.map,
            difficulties: message.difficulties || [],
            modes: message.modes || [],
            avatars: message.avatars || [],
          });
          setLatency((prev) => ({ ...prev, budget: message.latencyMs || prev.budget }));
          if (message.lobby) {
            setLobby(message.lobby);
          }
          break;
        }
        case 'lobbySnapshot': {
          setLobby(message);
          if (playerIdRef.current) {
            const self = message.players?.find((p) => p.id === playerIdRef.current);
            if (self) {
              setPlayerMeta((prev) => ({ ...prev, ...self }));
            }
          }
          break;
        }
        case 'queue': {
          setQueueState({
            status: message.status,
            position: message.position ?? null,
            needed: message.needed ?? null,
            selection: message.selection ?? null,
            reason: message.reason,
          });
          break;
        }
        case 'challengeRequest': {
          const expiresAt = Date.now() + (message.expiresInMs || 15000);
          setChallengeInbox((prev) => {
            const filtered = prev.filter((entry) => entry.challengeId !== message.challengeId);
            return [
              ...filtered,
              {
                challengeId: message.challengeId,
                from: message.from,
                selection: message.selection,
                expiresAt,
              },
            ];
          });
          break;
        }
        case 'challengeUpdate': {
          if (message.challengeId) {
            setChallengeInbox((prev) => prev.filter((entry) => entry.challengeId !== message.challengeId));
          }
          setChallengeStatus({
            challengeId: message.challengeId || null,
            state: message.state,
            opponent: message.opponent || null,
            selection: message.selection || null,
            reason: message.reason,
            timestamp: Date.now(),
          });
          break;
        }
        case 'matchAssignment': {
          previousScoresRef.current = new Map();
          setMatchState({
            assignment: message,
            snapshots: [],
            phase: 'staging',
            lastEvent: { type: 'assignment', at: Date.now() },
            roster: message.opponents || [],
            results: null,
          });
          break;
        }
        case 'matchEvent': {
          setMatchState((prev) => {
            if (message.event === 'roster') {
              return { ...prev, roster: message.roster || prev.roster };
            }
            if (message.event === 'ended') {
              return {
                ...prev,
                phase: 'results',
                lastEvent: { type: 'ended', at: Date.now(), payload: message },
                results: message,
              };
            }
            if (message.event === 'started') {
              return {
                ...prev,
                phase: 'playing',
                lastEvent: { type: 'started', at: Date.now(), payload: message },
              };
            }
            return { ...prev, lastEvent: { type: message.event, at: Date.now(), payload: message } };
          });
          break;
        }
        case 'state': {
          setMatchState((prev) => {
            const nextSnapshots = [...prev.snapshots, message];
            if (nextSnapshots.length > SNAPSHOT_LIMIT) {
              nextSnapshots.shift();
            }
            return {
              ...prev,
              snapshots: nextSnapshots,
              phase: message.match?.phase || prev.phase,
            };
          });

          const prevScores = previousScoresRef.current;
          const nextScores = new Map();
          message.players?.forEach((player) => {
            nextScores.set(player.id, player.score);
            if (prevScores.has(player.id) && player.id === playerIdRef.current) {
              const delta = player.score - prevScores.get(player.id);
              if (delta !== 0) {
                setLocalScoreEvent({ delta, score: player.score, at: Date.now() });
              }
            }
          });
          previousScoresRef.current = nextScores;
          break;
        }
        case 'latencyPong': {
          if (typeof message.sentAt === 'number') {
            const live = performance.now() - message.sentAt;
            setLatency((prev) => ({ ...prev, live }));
          }
          break;
        }
        default:
          break;
      }
    };

    ws.addEventListener('open', handleOpen);
    ws.addEventListener('close', handleClose);
    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('close', handleClose);
      ws.removeEventListener('message', handleMessage);
      ws.close();
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [sendMessage, serverUrl]);

  useEffect(() => {
    const cleaner = setInterval(() => {
      const now = Date.now();
      setChallengeInbox((prev) => prev.filter((entry) => !entry.expiresAt || entry.expiresAt > now));
    }, 1000);
    return () => clearInterval(cleaner);
  }, []);

  const setDisplayName = useCallback((name) => {
    sendMessage({ type: 'setName', name });
  }, [sendMessage]);

  const setAvatar = useCallback((avatarKey) => {
    sendMessage({ type: 'setAvatar', avatarKey });
  }, [sendMessage]);

  const joinQueue = useCallback((modeKey, difficultyKey) => {
    sendMessage({ type: 'joinQueue', modeKey, difficultyKey });
  }, [sendMessage]);

  const leaveQueue = useCallback(() => {
    sendMessage({ type: 'leaveQueue' });
  }, [sendMessage]);

  const sendChallenge = useCallback((targetId, selection) => {
    sendMessage({ type: 'challengePlayer', targetId, ...selection });
  }, [sendMessage]);

  const respondChallenge = useCallback((challengeId, accept) => {
    sendMessage({ type: 'respondChallenge', challengeId, accept });
  }, [sendMessage]);

  const cancelChallenge = useCallback((challengeId) => {
    sendMessage({ type: 'cancelChallenge', challengeId });
  }, [sendMessage]);

  const sendInput = useCallback((keys) => {
    sendMessage({ type: 'input', keys });
  }, [sendMessage]);

  return {
    connectionState,
    config,
    playerId,
    playerMeta,
    lobby,
    queueState,
    latency,
    matchState,
    challengeInbox,
    challengeStatus,
    localScoreEvent,
    actions: {
      setDisplayName,
      setAvatar,
      joinQueue,
      leaveQueue,
      sendChallenge,
      respondChallenge,
      cancelChallenge,
      sendInput,
    },
  };
}
