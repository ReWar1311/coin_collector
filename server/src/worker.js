const { parentPort, workerData } = require('worker_threads');

const {
  roomId,
  requiredPlayers,
  tickRate,
  map,
  playerSize,
  coinRadius,
  hazardRadius,
  modeKey,
  difficultyKey,
  modeConfig,
  difficultyConfig,
} = workerData;

const tickMs = 1000 / tickRate;
const players = new Map();
let coins = [];
let hazards = [];
let phase = 'waiting';
let countdownEndsAt = null;
let matchEndsAt = null;
let coinTimer = null;
let hazardTimer = null;
let tickHandle = null;

parentPort.on('message', (message) => {
  switch (message.type) {
    case 'bootstrap':
      message.players.forEach((player) => addPlayer(player));
      maybeStart();
      break;
    case 'playerInput':
      updateInputs(message.playerId, message.keys);
      break;
    case 'playerLeft':
      removePlayer(message.playerId);
      break;
    case 'shutdown':
      shutdown();
      break;
    default:
      break;
  }
});

function addPlayer(player) {
  const spawn = getSpawn(player.slot);
  players.set(player.id, {
    id: player.id,
    slot: player.slot,
    position: { x: spawn.x, y: spawn.y },
    velocity: { x: 0, y: 0 },
    inputs: { up: false, down: false, left: false, right: false },
    score: 0,
  });
}

function removePlayer(playerId) {
  players.delete(playerId);
  if (players.size < requiredPlayers) {
    endMatch({ reason: 'disconnected' });
  }
}

function maybeStart() {
  if (players.size < requiredPlayers || tickHandle) return;
  phase = 'countdown';
  const now = Date.now();
  countdownEndsAt = now + 3000;
  matchEndsAt = countdownEndsAt + difficultyConfig.matchDuration;
  coins = [];
  hazards = [];
  coinTimer = null;
  hazardTimer = null;
  players.forEach((player, idx) => {
    const spawn = getSpawn(player.slot || idx + 1);
    player.position = { x: spawn.x, y: spawn.y };
    player.velocity = { x: 0, y: 0 };
    player.inputs = { up: false, down: false, left: false, right: false };
    player.score = 0;
  });
  tickHandle = setInterval(tick, tickMs);
  parentPort.postMessage({
    type: 'matchStarted',
    payload: {
      countdownEndsAt,
      matchEndsAt,
    },
  });
}

function tick() {
  const now = Date.now();
  if (phase === 'countdown' && now >= countdownEndsAt) {
    phase = 'playing';
  }
  const dt = tickMs / 1000;
  if (phase === 'playing') {
    players.forEach((player) => integrate(player, dt));
    resolveCoinCollection();
    resolveHazardCollision();
    maybeSpawnCoin(now);
    maybeSpawnHazard(now);
    const winner = evaluateInstantWin();
    if (winner) {
      endMatch({ reason: 'target', winnerId: winner.id });
      return;
    }
    if (modeConfig.winCondition === 'timer' && now >= matchEndsAt) {
      endMatch(determineTimerResult());
      return;
    }
  }

  broadcastState(now);
}

function integrate(player, dt) {
  let dirX = 0;
  let dirY = 0;
  if (player.inputs.left) dirX -= 1;
  if (player.inputs.right) dirX += 1;
  if (player.inputs.up) dirY -= 1;
  if (player.inputs.down) dirY += 1;
  if (dirX !== 0 || dirY !== 0) {
    const length = Math.hypot(dirX, dirY);
    player.velocity.x = (dirX / length) * difficultyConfig.playerSpeed;
    player.velocity.y = (dirY / length) * difficultyConfig.playerSpeed;
  } else {
    player.velocity.x = 0;
    player.velocity.y = 0;
  }
  player.position.x += player.velocity.x * dt;
  player.position.y += player.velocity.y * dt;
  clamp(player.position);
}

function clamp(pos) {
  const half = playerSize / 2;
  pos.x = Math.max(half, Math.min(map.width - half, pos.x));
  pos.y = Math.max(half, Math.min(map.height - half, pos.y));
}

function updateInputs(playerId, keys = {}) {
  const player = players.get(playerId);
  if (!player) return;
  player.inputs = {
    ...player.inputs,
    ...keys,
  };
}

function resolveCoinCollection() {
  if (coins.length === 0) return;
  players.forEach((player) => {
    coins = coins.filter((coin) => {
      const dist = Math.hypot(player.position.x - coin.x, player.position.y - coin.y);
      if (dist <= coinRadius + playerSize / 2) {
        player.score += coin.value;
        return false;
      }
      return true;
    });
  });
}

function resolveHazardCollision() {
  if (!modeConfig.allowHazards || hazards.length === 0) {
    pruneExpiredHazards();
    return;
  }
  players.forEach((player) => {
    hazards = hazards.filter((hazard) => {
      const dist = Math.hypot(player.position.x - hazard.x, player.position.y - hazard.y);
      if (dist <= hazardRadius + playerSize / 2) {
        player.score = Math.max(0, player.score - hazard.penalty);
        return false;
      }
      if (hazard.expiresAt && Date.now() >= hazard.expiresAt) {
        return false;
      }
      return true;
    });
  });
}

function maybeSpawnCoin(now) {
  if (!coinTimer) {
    coinTimer = now;
  }
  const cap = modeConfig.allowHazards ? 2 : 3;
  if (coins.length >= cap) return;
  if (now >= coinTimer) {
    coins.push(newCoin());
    coinTimer = now + difficultyConfig.coinInterval;
  }
}

function maybeSpawnHazard(now) {
  if (!modeConfig.allowHazards) return;
  if (!hazardTimer) {
    hazardTimer = now;
  }
  const cap = 2;
  if (hazards.length >= cap) return;
  if (now >= hazardTimer) {
    hazards.push(newHazard());
    hazardTimer = now + difficultyConfig.hazardInterval;
  }
}

function newCoin() {
  return {
    id: `coin-${Math.random().toString(16).slice(2, 7)}`,
    x: randomInRange(50, map.width - 50),
    y: randomInRange(50, map.height - 50),
    value: modeKey === 'blitz' ? 1 : 1,
  };
}

function newHazard() {
  return {
    id: `haz-${Math.random().toString(16).slice(2, 7)}`,
    x: randomInRange(70, map.width - 70),
    y: randomInRange(70, map.height - 70),
    penalty: 1,
    expiresAt: Date.now() + 7000,
    tint: '#7c3aed',
  };
}

function evaluateInstantWin() {
  if (modeConfig.winCondition !== 'target' || !modeConfig.targetScore) return null;
  return (
    Array.from(players.values()).find((player) => player.score >= modeConfig.targetScore) || null
  );
}

function determineTimerResult() {
  const sorted = Array.from(players.values()).sort((a, b) => b.score - a.score);
  if (!sorted.length) {
    return { reason: 'timer', winnerId: null, scores: [] };
  }
  if (sorted.length > 1 && sorted[0].score === sorted[1].score) {
    return { reason: 'timer', winnerId: null, scores: serializeScores() };
  }
  return { reason: 'timer', winnerId: sorted[0].id, scores: serializeScores() };
}

function serializeScores() {
  return Array.from(players.values()).map((player) => ({ id: player.id, score: player.score }));
}

function broadcastState(timestamp) {
  parentPort.postMessage({
    type: 'state',
    payload: {
      roomId,
      timestamp,
      players: serializePlayers(),
      coins,
      hazards,
      match: {
        phase,
        countdownEndsAt,
        matchEndsAt,
        modeKey,
        difficultyKey,
      },
    },
  });
}

function serializePlayers() {
  return Array.from(players.values()).map((player) => ({
    id: player.id,
    slot: player.slot,
    position: player.position,
    velocity: player.velocity,
    score: player.score,
  }));
}

function getSpawn(slot) {
  const margin = 120;
  if (slot === 1) {
    return { x: margin, y: map.height / 2 };
  }
  return { x: map.width - margin, y: map.height / 2 };
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function pruneExpiredHazards() {
  const now = Date.now();
  hazards = hazards.filter((hazard) => !hazard.expiresAt || now < hazard.expiresAt);
}

function shutdown() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function endMatch(payload = {}) {
  if (phase === 'finished') return;
  phase = 'finished';
  shutdown();
  if (!payload.scores) {
    payload.scores = serializeScores();
  }
  parentPort.postMessage({
    type: 'matchEnded',
    payload,
  });
}
