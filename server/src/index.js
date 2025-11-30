const WebSocket = require('ws');
const { MatchManager } = require('./matchManager');
const { MAP, NETWORK_LATENCY_MS, PLAYER_LATENCY_MS, DIFFICULTIES, GAME_MODES, AVATARS } = require('./config');
const { shortId, sendWithLatency } = require('./utils');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });
const matchManager = new MatchManager({ logger: console });
const avatarKeys = new Set(AVATARS.map((avatar) => avatar.key));

server.on('connection', (ws) => {
  const player = createSession(ws);
  matchManager.registerPlayer(player);
  sendWelcome(player);

  ws.on('message', (raw) => {
    setTimeout(() => handleMessage(player, raw), player.latencyBudgetMs || PLAYER_LATENCY_MS);
  });

  ws.on('close', () => {
    matchManager.removePlayer(player);
  });
});

function createSession(ws) {
  const id = shortId();
  return {
    id,
    ws,
    name: `Pilot-${id.slice(0, 3)}`,
    avatarKey: AVATARS[0]?.key || 'onyx',
    currentRoomId: null,
    selection: null,
    latencyBudgetMs: PLAYER_LATENCY_MS,
    status: 'idle',
    send(payload) {
      sendWithLatency(ws, payload, this.latencyBudgetMs);
    },
  };
}

function sendWelcome(player) {
  player.send({
    type: 'welcome',
    playerId: player.id,
    latencyMs: player.latencyBudgetMs,
    map: MAP,
    difficulties: Object.values(DIFFICULTIES),
    modes: Object.values(GAME_MODES),
    avatars: AVATARS,
    lobby: matchManager.getLobbySummary(),
    player: {
      id: player.id,
      name: player.name,
      avatarKey: player.avatarKey,
      status: player.status,
    },
  });
}

function handleMessage(player, raw) {
  let data;
  try {
    data = JSON.parse(raw.toString());
  } catch (err) {
    return;
  }

  switch (data.type) {
    case 'setName':
      if (typeof data.name === 'string') {
        const trimmed = data.name.trim().slice(0, 18);
        if (trimmed.length) {
          matchManager.renamePlayer(player, trimmed);
        }
      }
      break;
    case 'joinQueue':
      matchManager.leaveQueue(player);
      matchManager.enqueue(player, {
        modeKey: data.modeKey,
        difficultyKey: data.difficultyKey,
      });
      break;
    case 'leaveQueue':
      matchManager.leaveQueue(player);
      player.send({ type: 'queue', status: 'idle' });
      break;
    case 'setAvatar':
      if (typeof data.avatarKey === 'string' && avatarKeys.has(data.avatarKey)) {
        matchManager.setAvatar(player, data.avatarKey);
      }
      break;
    case 'challengePlayer':
      if (typeof data.targetId === 'string') {
        matchManager.challengePlayer(player, data.targetId, {
          modeKey: data.modeKey,
          difficultyKey: data.difficultyKey,
        });
      }
      break;
    case 'respondChallenge':
      if (typeof data.challengeId === 'string') {
        matchManager.respondToChallenge(player, data.challengeId, Boolean(data.accept));
      }
      break;
    case 'cancelChallenge':
      if (typeof data.challengeId === 'string') {
        matchManager.cancelChallenge(player, data.challengeId);
      }
      break;
    case 'input':
      if (player.currentRoomId) {
        matchManager.handleInput(player.id, data.keys || {});
      }
      break;
    case 'latencyPing':
      player.send({
        type: 'latencyPong',
        sentAt: typeof data.sentAt === 'number' ? data.sentAt : Date.now(),
      });
      break;
    default:
      break;
  }
}

console.log(`Multiplayer server ready on ws://localhost:${PORT}`);
