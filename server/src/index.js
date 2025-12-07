const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { MatchManager } = require('./matchManager');
const { MAP, PLAYER_LATENCY_MS, DIFFICULTIES, GAME_MODES, AVATARS } = require('./config');
const { shortId, sendWithLatency } = require('./utils');

const PORT = process.env.PORT || 8080;
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH || path.resolve(__dirname, '../../client/dist');
const INDEX_FILE = path.join(CLIENT_DIST_PATH, 'index.html');
const matchManager = new MatchManager({ logger: console });
const avatarKeys = new Set(AVATARS.map((avatar) => avatar.key));
const httpServer = http.createServer(handleHttpRequest);
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
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

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

function handleHttpRequest(req, res) {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
      })
    );
    return;
  }

  if (!['GET', 'HEAD'].includes(method)) {
    res.writeHead(405);
    res.end();
    return;
  }

  serveStaticAsset(url.pathname, method === 'HEAD', res);
}

function serveStaticAsset(requestPathname, isHead, res) {
  if (!fs.existsSync(CLIENT_DIST_PATH)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Client build not found. Please run npm run build in the client project.');
    return;
  }

  const decodedPath = decodeURIComponent(requestPathname || '/');
  const relativePath = decodedPath.replace(/^\/+/, '');
  const normalizedRelative = path.normalize(relativePath).replace(/^(\.\.(?:[\/]|$))+/, '');
  let targetPath = path.join(CLIENT_DIST_PATH, normalizedRelative);
  if (!targetPath.startsWith(CLIENT_DIST_PATH)) {
    res.writeHead(403);
    res.end();
    return;
  }

  let targetExists = fs.existsSync(targetPath);
  let isFile = targetExists && fs.statSync(targetPath).isFile();
  const wantsAsset = path.extname(normalizedRelative) !== '';

  if (!targetExists || !isFile) {
    if (!wantsAsset) {
      targetPath = INDEX_FILE;
      targetExists = fs.existsSync(targetPath);
      isFile = targetExists && fs.statSync(targetPath).isFile();
    } else {
      res.writeHead(404);
      res.end();
      return;
    }
  }

  if (!targetExists || !isFile) {
    res.writeHead(404);
    res.end();
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
  res.writeHead(200, headers);

  if (isHead) {
    res.end();
    return;
  }

  fs.createReadStream(targetPath)
    .on('error', () => {
      res.writeHead(500);
      res.end();
    })
    .pipe(res);
}

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

console.log(`WebSocket server ready on ws://localhost:${PORT}`);
