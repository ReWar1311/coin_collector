import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameClient } from './hooks/useGameClient';
import { useSoundBoard } from './hooks/useSoundBoard';
import IdentityPanel from './components/IdentityPanel';
import VolumeControls from './components/VolumeControls';
import MatchQueuePanel from './components/MatchQueuePanel';
import PlayerList from './components/PlayerList';
import ChallengeCenter from './components/ChallengeCenter';
import RoomsPanel from './components/RoomsPanel';
import LatencyBadge from './components/LatencyBadge';
import GameCanvas from './components/GameCanvas';
import Scoreboard from './components/Scoreboard';
import MatchClock from './components/MatchClock';
import GameOverlay from './components/GameOverlay';

const App = () => {
  const game = useGameClient();
  const {
    bgmVolume,
    sfxVolume,
    isBgmActive,
    setBgmVolume,
    setSfxVolume,
    toggleBgm,
    playCountdown3,
    playGo,
    playCoin,
    playTenSeconds,
    playGameOver,
  } = useSoundBoard();
  const [modeKey, setModeKey] = useState(null);
  const [difficultyKey, setDifficultyKey] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const inputStateRef = useRef({ up: false, down: false, left: false, right: false });
  const inputFrameRef = useRef(null);
  const snapshotsRef = useRef(game.matchState.snapshots);
  const [timers, setTimers] = useState({ countdown: null, match: null });
  const countdownPlayedRef = useRef(false);
  const goPlayedRef = useRef(false);
  const tenSecondPlayedRef = useRef(false);
  const gameOverPlayedRef = useRef(false);

  const avatarLookup = useMemo(() => {
    const map = { default: '/Avatars/black.svg' };
    (game.config.avatars || []).forEach((avatar) => {
      map[avatar.key] = avatar.asset;
    });
    return map;
  }, [game.config.avatars]);

  useEffect(() => {
    snapshotsRef.current = game.matchState.snapshots;
  }, [game.matchState.snapshots]);

  const modeLookup = useMemo(() => {
    const lookup = {};
    (game.config.modes || []).forEach((mode) => {
      lookup[mode.key] = mode.label;
    });
    return lookup;
  }, [game.config.modes]);

  const difficultyLookup = useMemo(() => {
    const lookup = {};
    (game.config.difficulties || []).forEach((difficulty) => {
      lookup[difficulty.key] = difficulty.label;
    });
    return lookup;
  }, [game.config.difficulties]);

  useEffect(() => {
    if (!modeKey && game.config.modes?.length) {
      setModeKey(game.config.modes[0].key);
    }
  }, [game.config.modes, modeKey]);

  useEffect(() => {
    if (!difficultyKey && game.config.difficulties?.length) {
      setDifficultyKey(game.config.difficulties[1]?.key || game.config.difficulties[0].key);
    }
  }, [game.config.difficulties, difficultyKey]);

  useEffect(() => {
    setNameDraft(game.playerMeta.name || '');
  }, [game.playerMeta.name]);

  useEffect(() => {
    const updateTimers = () => {
      const snapshot = snapshotsRef.current?.[snapshotsRef.current.length - 1];
      const matchMeta = snapshot?.match;
      if (!matchMeta) {
        setTimers({ countdown: null, match: null });
        return;
      }
      const now = Date.now();
      const countdown = matchMeta.countdownEndsAt
        ? Math.max(0, Math.ceil((matchMeta.countdownEndsAt - now) / 1000))
        : null;
      const matchSeconds = matchMeta.matchEndsAt
        ? Math.max(0, Math.ceil((matchMeta.matchEndsAt - now) / 1000))
        : null;
      setTimers({ countdown, match: matchSeconds });
    };
    const id = setInterval(updateTimers, 250);
    updateTimers();
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!game.localScoreEvent) return;
    if (game.localScoreEvent.delta > 0) {
      playCoin();
    }
  }, [playCoin, game.localScoreEvent]);

  useEffect(() => {
    countdownPlayedRef.current = false;
    goPlayedRef.current = false;
    tenSecondPlayedRef.current = false;
    gameOverPlayedRef.current = false;
  }, [game.matchState.assignment?.roomId]);

  useEffect(() => {
    if (timers.countdown && timers.countdown > 0 && !countdownPlayedRef.current) {
      playCountdown3();
      countdownPlayedRef.current = true;
    }
    if (
      (timers.countdown == null || timers.countdown === 0) &&
      game.matchState.phase === 'playing' &&
      !goPlayedRef.current
    ) {
      playGo();
      goPlayedRef.current = true;
    }
  }, [timers.countdown, game.matchState.phase, playCountdown3, playGo]);

  useEffect(() => {
    if (tenSecondPlayedRef.current) return;
    if (typeof timers.match === 'number' && timers.match > 0 && timers.match <= 10) {
      playTenSeconds();
      tenSecondPlayedRef.current = true;
    }
  }, [timers.match, playTenSeconds]);

  useEffect(() => {
    if (game.matchState.phase === 'results' && !gameOverPlayedRef.current) {
      playGameOver();
      gameOverPlayedRef.current = true;
    }
  }, [game.matchState.phase, playGameOver]);

  useEffect(() => {
    const scheduleInputPush = (nextState) => {
      inputStateRef.current = nextState;
      if (inputFrameRef.current) return;
      inputFrameRef.current = requestAnimationFrame(() => {
        game.actions.sendInput({ ...inputStateRef.current });
        inputFrameRef.current = null;
      });
    };

    const handleKeyDown = (event) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
      }
      const next = { ...inputStateRef.current };
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          next.up = true;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          next.down = true;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          next.left = true;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          next.right = true;
          break;
        default:
          return;
      }
      scheduleInputPush(next);
    };

    const handleKeyUp = (event) => {
      const next = { ...inputStateRef.current };
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          next.up = false;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          next.down = false;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          next.left = false;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          next.right = false;
          break;
        default:
          return;
      }
      scheduleInputPush(next);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (inputFrameRef.current) {
        cancelAnimationFrame(inputFrameRef.current);
        inputFrameRef.current = null;
      }
    };
  }, [game.actions.sendInput]);

  const commitName = (value) => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== game.playerMeta.name) {
      game.actions.setDisplayName(trimmed);
    }
  };

  const handleAvatarSelect = (avatarKey) => {
    if (avatarKey && avatarKey !== game.playerMeta.avatarKey) {
      game.actions.setAvatar(avatarKey);
    }
  };

  const handleJoinQueue = () => {
    if (modeKey && difficultyKey) {
      game.actions.joinQueue(modeKey, difficultyKey);
    }
  };

  const handleChallenge = (player) => {
    if (!player?.id || !modeKey || !difficultyKey) return;
    game.actions.sendChallenge(player.id, { modeKey, difficultyKey });
  };

  const handleRespondChallenge = (challengeId, accept) => {
    game.actions.respondChallenge(challengeId, accept);
  };

  const handleCancelChallenge = (challengeId) => {
    game.actions.cancelChallenge(challengeId);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Krafton Arena</p>
          <h1>Zero gravity control room</h1>
        </div>
        <div className="header-status">
          <MatchClock countdownSeconds={timers.countdown} matchSeconds={timers.match} phase={game.matchState.phase} />
          <LatencyBadge latency={game.latency} connectionState={game.connectionState} />
        </div>
      </header>
      <main className="app-grid" aria-live="polite">
        <section className="sidebar">
          <IdentityPanel
            name={game.playerMeta.name}
            nameDraft={nameDraft}
            onNameChange={setNameDraft}
            onNameCommit={commitName}
            avatars={game.config.avatars}
            selectedAvatar={game.playerMeta.avatarKey}
            onAvatarSelect={handleAvatarSelect}
          />
          <VolumeControls
            bgmVolume={bgmVolume}
            sfxVolume={sfxVolume}
            isBgmActive={isBgmActive}
            onBgmVolume={setBgmVolume}
            onSfxVolume={setSfxVolume}
            onToggleBgm={toggleBgm}
          />
          <MatchQueuePanel
            modes={game.config.modes}
            difficulties={game.config.difficulties}
            selectedMode={modeKey}
            selectedDifficulty={difficultyKey}
            onModeChange={setModeKey}
            onDifficultyChange={setDifficultyKey}
            queueState={game.queueState}
            onJoinQueue={handleJoinQueue}
            onLeaveQueue={game.actions.leaveQueue}
          />
        </section>
        <section className="center-stage">
          <div className="stage-wrapper">
            <GameCanvas map={game.config.map} snapshots={game.matchState.snapshots} avatarLookup={avatarLookup} />
            <GameOverlay
              countdownSeconds={timers.countdown}
              phase={game.matchState.phase}
              results={game.matchState.results}
            />
          </div>
          <Scoreboard
            matchState={game.matchState}
            playerId={game.playerId}
            avatarLookup={avatarLookup}
            modeLookup={modeLookup}
            difficultyLookup={difficultyLookup}
            matchSeconds={timers.match}
          />
        </section>
        <section className="sidebar">
          <PlayerList
            players={game.lobby.players}
            selfId={game.playerId}
            onChallenge={handleChallenge}
            challengeStatus={game.challengeStatus}
            avatarLookup={avatarLookup}
          />
          <ChallengeCenter
            inbox={game.challengeInbox}
            onRespond={handleRespondChallenge}
            challengeStatus={game.challengeStatus}
            onCancelPending={handleCancelChallenge}
            modeLookup={modeLookup}
            difficultyLookup={difficultyLookup}
          />
          <RoomsPanel rooms={game.lobby.rooms} modeLookup={modeLookup} difficultyLookup={difficultyLookup} />
        </section>
      </main>
    </div>
  );
};

export default App;
