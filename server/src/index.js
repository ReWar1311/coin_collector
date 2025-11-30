const WebSocket = require('ws');
const { MatchManager } = require('./matchManager');
const { MAP, NETWORK_LATENCY_MS, DIFFICULTIES, GAME_MODES } = require('./config');
const { shortId, sendWithLatency } = require('./utils');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });
const matchManager = new MatchManager({ logger: console });

server.on('connection', (ws) => {
  const player = createSession(ws);
  matchManager.registerPlayer(player);
  sendWelcome(player);

  ws.on('message', (raw) => {
    setTimeout(() => handleMessage(player, raw), NETWORK_LATENCY_MS);
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
    currentRoomId: null,
    selection: null,
    send(payload) {
      sendWithLatency(ws, payload);
    },
  };
}

function sendWelcome(player) {
  player.send({
    type: 'welcome',
    playerId: player.id,
    latencyMs: NETWORK_LATENCY_MS,
    map: MAP,
    difficulties: Object.values(DIFFICULTIES),
    modes: Object.values(GAME_MODES),
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
    case 'input':
      if (player.currentRoomId) {
        matchManager.handleInput(player.id, data.keys || {});
      }
      break;
    default:
      break;
  }
}

console.log(`Multiplayer server ready on ws://localhost:${PORT}`);
