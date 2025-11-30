const path = require('path');
const { Worker } = require('worker_threads');
const {
  DIFFICULTIES,
  GAME_MODES,
  MAP,
  PLAYER_SIZE,
  COIN_RADIUS,
  HAZARD_RADIUS,
  REQUIRED_PLAYERS,
  TICK_RATE,
} = require('./config');
const { shortId } = require('./utils');

class MatchManager {
  constructor(options = {}) {
    this.rooms = new Map();
    this.queues = new Map();
    this.playerRoomMap = new Map();
    this.players = new Map();
    this.logger = options.logger || console;
  }

  registerPlayer(player) {
    this.players.set(player.id, player);
  }

  removePlayer(player) {
    this.leaveQueue(player);
    const roomId = this.playerRoomMap.get(player.id);
    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.detachPlayer(player.id, 'disconnect');
      }
      this.playerRoomMap.delete(player.id);
    }
    this.players.delete(player.id);
  }

  renamePlayer(player, name) {
    player.name = name;
    const room = this.getRoomForPlayer(player.id);
    if (room) {
      room.broadcastRoster();
    }
  }

  enqueue(player, selection) {
    const validated = this.validateSelection(selection);
    player.selection = validated;
    const key = this.queueKey(validated);
    if (!this.queues.has(key)) {
      this.queues.set(key, []);
    }
    const queue = this.queues.get(key);
    if (!queue.find((p) => p.id === player.id)) {
      queue.push(player);
    }
    this.broadcastQueueState(queue, validated);
    if (queue.length >= REQUIRED_PLAYERS) {
      const roster = queue.splice(0, REQUIRED_PLAYERS);
      this.broadcastQueueState(queue, validated);
      this.createRoom(validated, roster);
    } else {
      player.send({
        type: 'queue',
        status: 'waiting',
        selection: validated,
        position: queue.findIndex((p) => p.id === player.id) + 1,
        needed: REQUIRED_PLAYERS,
      });
    }
  }

  leaveQueue(player) {
    if (!player.selection) return;
    const key = this.queueKey(player.selection);
    const queue = this.queues.get(key);
    if (!queue) return;
    const idx = queue.findIndex((p) => p.id === player.id);
    if (idx >= 0) {
      queue.splice(idx, 1);
      this.broadcastQueueState(queue, player.selection);
    }
    player.selection = null;
  }

  handleInput(playerId, keys) {
    const room = this.getRoomForPlayer(playerId);
    if (room) {
      room.forwardInput(playerId, keys);
    }
  }

  getRoomForPlayer(playerId) {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  closeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.destroy();
  }

  queueKey(selection) {
    return `${selection.modeKey}:${selection.difficultyKey}`;
  }

  broadcastQueueState(queue, selection) {
    queue.forEach((player, idx) => {
      player.send({
        type: 'queue',
        status: 'waiting',
        selection,
        position: idx + 1,
        needed: REQUIRED_PLAYERS,
      });
    });
  }

  validateSelection(selection = {}) {
    const modeKey = GAME_MODES[selection.modeKey] ? selection.modeKey : 'countdown';
    const difficultyKey = DIFFICULTIES[selection.difficultyKey] ? selection.difficultyKey : 'striker';
    return {
      modeKey,
      difficultyKey,
    };
  }

  createRoom(selection, players) {
    const room = new MatchRoom(selection, players, this.logger, (finishedRoomId) =>
      this.handleRoomFinished(finishedRoomId)
    );
    this.rooms.set(room.id, room);
    players.forEach((player) => {
      this.playerRoomMap.set(player.id, room.id);
      player.currentRoomId = room.id;
    });
    this.logger.info?.(`Room ${room.id} launched (${selection.modeKey}/${selection.difficultyKey}).`);
  }

  handleRoomFinished(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players.forEach((player) => {
      if (this.playerRoomMap.get(player.id) === roomId) {
        this.playerRoomMap.delete(player.id);
        player.currentRoomId = null;
        player.selection = null;
      }
    });
    this.rooms.delete(roomId);
  }
}

class MatchRoom {
  constructor(selection, players, logger, onFinish) {
    this.id = shortId();
    this.modeKey = selection.modeKey;
    this.difficultyKey = selection.difficultyKey;
    this.modeConfig = GAME_MODES[this.modeKey];
    this.difficultyConfig = DIFFICULTIES[this.difficultyKey];
    this.players = new Map();
    this.logger = logger;
    this.onFinish = onFinish;
    this.closed = false;

    const workerPath = path.resolve(__dirname, 'worker.js');
    this.worker = new Worker(workerPath, {
      workerData: {
        roomId: this.id,
        requiredPlayers: REQUIRED_PLAYERS,
        tickRate: TICK_RATE,
        map: MAP,
        playerSize: PLAYER_SIZE,
        coinRadius: COIN_RADIUS,
        hazardRadius: HAZARD_RADIUS,
        modeKey: this.modeKey,
        difficultyKey: this.difficultyKey,
        modeConfig: this.modeConfig,
        difficultyConfig: this.difficultyConfig,
      },
    });

    this.worker.on('message', (msg) => this.handleWorkerMessage(msg));
    this.worker.on('error', (err) => {
      this.logger.error?.('Worker error', err);
      this.broadcast({ type: 'matchEvent', roomId: this.id, event: 'error', message: 'Match crashed' });
      this.destroy();
    });
    this.worker.on('exit', () => {
      this.invokeFinish();
    });

    players.forEach((player, idx) => this.attachPlayer(player, idx + 1));
    this.bootstrapWorker();
  }

  attachPlayer(player, slot) {
    player.slot = slot;
    this.players.set(player.id, player);
    this.sendAssignment(player);
    this.broadcastRoster();
  }

  sendAssignment(player) {
    player.send({
      type: 'matchAssignment',
      roomId: this.id,
      slot: player.slot,
      mode: this.modeConfig,
      difficulty: this.difficultyConfig,
      opponents: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
      })),
    });
  }

  bootstrapWorker() {
    const roster = Array.from(this.players.values()).map((player) => ({
      id: player.id,
      slot: player.slot,
    }));
    this.worker.postMessage({ type: 'bootstrap', players: roster });
  }

  forwardInput(playerId, keys) {
    this.worker.postMessage({ type: 'playerInput', playerId, keys });
  }

  detachPlayer(playerId, reason = 'left') {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.worker.postMessage({ type: 'playerLeft', playerId });
    this.broadcast({
      type: 'matchEvent',
      roomId: this.id,
      event: 'playerLeft',
      playerId,
      reason,
    });
    player.currentRoomId = null;
  }

  broadcastRoster() {
    this.broadcast({
      type: 'matchEvent',
      roomId: this.id,
      event: 'roster',
      roster: Array.from(this.players.values()).map((player) => ({
        id: player.id,
        name: player.name,
        slot: player.slot,
      })),
    });
  }

  handleWorkerMessage(message) {
    switch (message.type) {
      case 'state':
        this.handleState(message.payload);
        break;
      case 'matchStarted':
        this.broadcast({
          type: 'matchEvent',
          roomId: this.id,
          event: 'started',
          countdownEndsAt: message.payload.countdownEndsAt,
          matchEndsAt: message.payload.matchEndsAt,
        });
        break;
      case 'matchEnded':
        this.broadcast({
          type: 'matchEvent',
          roomId: this.id,
          event: 'ended',
          winnerId: message.payload.winnerId,
          scores: this.enrichScores(message.payload.scores),
          reason: message.payload.reason,
        });
        this.destroy();
        break;
      case 'roomTerminated':
        this.destroy();
        break;
      default:
        break;
    }
  }

  enrichScores(rawScores = []) {
    return rawScores.map((score) => ({
      ...score,
      name: this.players.get(score.id)?.name || score.id,
      slot: this.players.get(score.id)?.slot || 1,
    }));
  }

  handleState(payload) {
    const enrichedPlayers = payload.players.map((p) => ({
      ...p,
      name: this.players.get(p.id)?.name || p.id,
      slot: this.players.get(p.id)?.slot || p.slot,
    }));
    this.broadcast({
      type: 'state',
      roomId: this.id,
      timestamp: payload.timestamp,
      match: payload.match,
      players: enrichedPlayers,
      coins: payload.coins,
      hazards: payload.hazards,
    });
  }

  broadcast(message) {
    this.players.forEach((player) => {
      player.send(message);
    });
  }

  destroy() {
    if (this.worker) {
      this.worker.postMessage({ type: 'shutdown' });
      this.worker.terminate().catch(() => {});
      this.worker = null;
    }
    this.invokeFinish();
  }

  invokeFinish() {
    if (this.closed) return;
    this.closed = true;
    this.onFinish?.(this.id);
  }
}

module.exports = {
  MatchManager,
};
