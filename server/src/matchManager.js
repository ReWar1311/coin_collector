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
  PLAYER_LATENCY_MS,
} = require('./config');
const { shortId } = require('./utils');

const CHALLENGE_TTL_MS = 15_000;

class MatchManager {
  constructor(options = {}) {
    this.rooms = new Map();
    this.queues = new Map();
    this.playerRoomMap = new Map();
    this.players = new Map();
    this.challenges = new Map();
    this.logger = options.logger || console;
  }

  registerPlayer(player) {
    player.status = 'idle';
    this.players.set(player.id, player);
    this.broadcastLobbySummary();
  }

  removePlayer(player) {
    this.leaveQueue(player);
    this.cancelChallengeByPlayer(player.id, 'disconnect');
    const roomId = this.playerRoomMap.get(player.id);
    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.detachPlayer(player.id, 'disconnect');
      }
      this.playerRoomMap.delete(player.id);
    }
    this.players.delete(player.id);
    this.broadcastLobbySummary();
  }

  renamePlayer(player, name) {
    player.name = name;
    const room = this.getRoomForPlayer(player.id);
    if (room) {
      room.broadcastRoster();
      return;
    }
    this.broadcastLobbySummary();
  }

  setAvatar(player, avatarKey) {
    if (!avatarKey) return;
    player.avatarKey = avatarKey;
    const room = this.getRoomForPlayer(player.id);
    if (room) {
      room.broadcastRoster();
      return;
    }
    this.broadcastLobbySummary();
  }

  enqueue(player, selection) {
    if (this.hasActiveChallenge(player.id)) {
      player.send({ type: 'queue', status: 'blocked', reason: 'challengePending' });
      return;
    }
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
    player.status = 'queue';
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
    this.broadcastLobbySummary();
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
    if (!player.currentRoomId && !this.hasActiveChallenge(player.id)) {
      player.status = 'idle';
    }
    this.broadcastLobbySummary();
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
      this.handleRoomFinished(finishedRoomId),
      () => this.broadcastLobbySummary()
    );
    this.rooms.set(room.id, room);
    players.forEach((player) => {
      this.playerRoomMap.set(player.id, room.id);
      player.currentRoomId = room.id;
      player.status = 'match';
      player.selection = null;
    });
    this.logger.info?.(`Room ${room.id} launched (${selection.modeKey}/${selection.difficultyKey}).`);
    this.broadcastLobbySummary();
  }

  handleRoomFinished(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players.forEach((player) => {
      if (this.playerRoomMap.get(player.id) === roomId) {
        this.playerRoomMap.delete(player.id);
        player.currentRoomId = null;
        player.selection = null;
        if (!this.hasActiveChallenge(player.id)) {
          player.status = 'idle';
        }
      }
    });
    this.rooms.delete(roomId);
    this.broadcastLobbySummary();
  }

  broadcastLobbySummary() {
    const snapshot = this.getLobbySummary();
    this.players.forEach((player) => {
      player.send({
        type: 'lobbySnapshot',
        ...snapshot,
      });
    });
  }

  getLobbySummary() {
    const onlinePlayers = this.players.size;
    const waitingPlayers = Array.from(this.queues.values()).reduce((sum, queue) => sum + queue.length, 0);
    const rooms = Array.from(this.rooms.values()).map((room) => room.getPublicSnapshot());
    const players = Array.from(this.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      avatarKey: player.avatarKey,
      status: player.status || 'idle',
      currentRoomId: player.currentRoomId,
      selection: player.selection,
    }));
    return {
      onlinePlayers,
      waitingPlayers,
      rooms,
      players,
    };
  }

  challengePlayer(challenger, targetId, selection) {
    if (!targetId || challenger.id === targetId) {
      return challenger.send({ type: 'challengeUpdate', state: 'error', reason: 'invalidTarget' });
    }
    const target = this.players.get(targetId);
    if (!target) {
      return challenger.send({ type: 'challengeUpdate', state: 'error', reason: 'notFound' });
    }
    if (
      !this.isIdle(challenger) ||
      !this.isIdle(target) ||
      this.hasActiveChallenge(target.id) ||
      this.hasActiveChallenge(challenger.id)
    ) {
      return challenger.send({ type: 'challengeUpdate', state: 'error', reason: 'unavailable' });
    }
    this.leaveQueue(challenger);
    this.leaveQueue(target);
    const validated = this.validateSelection(selection);
    const challengeId = shortId(10);
    const timeout = setTimeout(() => this.expireChallenge(challengeId, 'timeout'), CHALLENGE_TTL_MS);
    this.challenges.set(challengeId, {
      id: challengeId,
      fromId: challenger.id,
      toId: target.id,
      selection: validated,
      timeout,
    });
    challenger.status = 'challenging';
    target.status = 'challengeIncoming';
    this.broadcastLobbySummary();
    challenger.send({
      type: 'challengeUpdate',
      challengeId,
      state: 'pending',
      opponent: this.publicPlayer(target),
      selection: validated,
    });
    target.send({
      type: 'challengeRequest',
      challengeId,
      from: this.publicPlayer(challenger),
      selection: validated,
      expiresInMs: CHALLENGE_TTL_MS,
    });
  }

  respondToChallenge(player, challengeId, accepted) {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.toId !== player.id) {
      return;
    }
    if (!accepted) {
      this.cancelChallengeById(challengeId, 'declined');
      return;
    }
    const challenger = this.players.get(challenge.fromId);
    const target = this.players.get(challenge.toId);
    if (!challenger || !target) {
      return this.cancelChallengeById(challengeId, 'disconnect');
    }
    if (challenger.currentRoomId || target.currentRoomId) {
      this.cancelChallengeById(challengeId, 'unavailable');
      return;
    }
    this.challenges.delete(challengeId);
    clearTimeout(challenge.timeout);
    challenger.send({
      type: 'challengeUpdate',
      challengeId,
      state: 'accepted',
      opponent: this.publicPlayer(target),
    });
    target.send({
      type: 'challengeUpdate',
      challengeId,
      state: 'accepted',
      opponent: this.publicPlayer(challenger),
    });
    this.createRoom(challenge.selection, [challenger, target]);
  }

  cancelChallenge(player, challengeId) {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return;
    if (challenge.fromId !== player.id && challenge.toId !== player.id) return;
    this.cancelChallengeById(challengeId, 'cancelled');
  }

  cancelChallengeByPlayer(playerId, reason) {
    const targetEntry = Array.from(this.challenges.values()).find(
      (challenge) => challenge.fromId === playerId || challenge.toId === playerId
    );
    if (targetEntry) {
      this.cancelChallengeById(targetEntry.id, reason);
    }
  }

  cancelChallengeById(challengeId, reason = 'cancelled') {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return;
    clearTimeout(challenge.timeout);
    this.challenges.delete(challengeId);
    const challenger = this.players.get(challenge.fromId);
    const target = this.players.get(challenge.toId);
    if (challenger && this.isChallenging(challenger)) {
      challenger.status = 'idle';
      challenger.send({
        type: 'challengeUpdate',
        challengeId,
        state: reason,
        reason,
        opponent: this.publicPlayer(target),
      });
    }
    if (target && this.isChallenged(target)) {
      target.status = 'idle';
      target.send({
        type: 'challengeUpdate',
        challengeId,
        state: reason,
        reason,
        opponent: this.publicPlayer(challenger),
      });
    }
    this.broadcastLobbySummary();
  }

  expireChallenge(challengeId, reason) {
    this.cancelChallengeById(challengeId, reason);
  }

  hasActiveChallenge(playerId) {
    return Array.from(this.challenges.values()).some(
      (challenge) => challenge.fromId === playerId || challenge.toId === playerId
    );
  }

  isChallenging(player) {
    return player.status === 'challenging';
  }

  isChallenged(player) {
    return player.status === 'challengeIncoming';
  }

  isIdle(player) {
    return ['idle', undefined, null].includes(player.status);
  }

  publicPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      avatarKey: player.avatarKey,
      status: player.status,
    };
  }
}

class MatchRoom {
  constructor(selection, players, logger, onFinish, onMetaUpdate) {
    this.id = shortId();
    this.modeKey = selection.modeKey;
    this.difficultyKey = selection.difficultyKey;
    this.modeConfig = GAME_MODES[this.modeKey];
    this.difficultyConfig = DIFFICULTIES[this.difficultyKey];
    this.players = new Map();
    this.logger = logger;
    this.onFinish = onFinish;
    this.closed = false;
    this.phase = 'staging';
    this.onMetaUpdate = onMetaUpdate;
    this.stateHistory = [];
    this.stateHistoryWindowMs = 3_000;

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
    this.onMetaUpdate?.();
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
        avatarKey: p.avatarKey,
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
    player.status = 'idle';
    this.onMetaUpdate?.();
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
        avatarKey: player.avatarKey,
      })),
    });
    this.onMetaUpdate?.();
  }

  handleWorkerMessage(message) {
    switch (message.type) {
      case 'state':
        this.handleState(message.payload);
        break;
      case 'matchStarted':
        this.phase = 'countdown';
        this.broadcast({
          type: 'matchEvent',
          roomId: this.id,
          event: 'started',
          countdownEndsAt: message.payload.countdownEndsAt,
          matchEndsAt: message.payload.matchEndsAt,
        });
        this.onMetaUpdate?.();
        break;
      case 'matchEnded':
        this.phase = 'results';
        this.broadcast({
          type: 'matchEvent',
          roomId: this.id,
          event: 'ended',
          winnerId: message.payload.winnerId,
          scores: this.enrichScores(message.payload.scores),
          reason: message.payload.reason,
        });
        this.destroy();
        this.onMetaUpdate?.();
        break;
      case 'roomTerminated':
        this.destroy();
        this.onMetaUpdate?.();
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
      avatarKey: this.players.get(score.id)?.avatarKey || null,
    }));
  }

  handleState(payload) {
    if (payload.match?.phase && payload.match.phase !== this.phase) {
      this.phase = payload.match.phase;
      this.onMetaUpdate?.();
    }
    const enrichedSnapshot = {
      ...payload,
      players: payload.players.map((player) => this.enrichPlayerSnapshot(player)),
    };
    this.recordStateHistory(enrichedSnapshot);
    this.players.forEach((player) => {
      const personalizedPlayers = this.resolvePersonalizedPlayers(player.id, enrichedSnapshot);
      player.send({
        type: 'state',
        roomId: this.id,
        timestamp: enrichedSnapshot.timestamp,
        match: enrichedSnapshot.match,
        players: personalizedPlayers,
        coins: enrichedSnapshot.coins,
        hazards: enrichedSnapshot.hazards,
      });
    });
  }

  enrichPlayerSnapshot(snapshot) {
    const reference = this.players.get(snapshot.id);
    return {
      ...snapshot,
      name: reference?.name || snapshot.id,
      slot: reference?.slot || snapshot.slot,
      avatarKey: reference?.avatarKey || null,
    };
  }

  recordStateHistory(snapshot) {
    this.stateHistory.push(snapshot);
    const cutoff = (snapshot.timestamp || Date.now()) - this.stateHistoryWindowMs;
    this.stateHistory = this.stateHistory.filter((entry) => entry.timestamp >= cutoff);
  }

  findSnapshotBefore(timestamp) {
    for (let idx = this.stateHistory.length - 1; idx >= 0; idx -= 1) {
      const candidate = this.stateHistory[idx];
      if (candidate.timestamp <= timestamp) {
        return candidate;
      }
    }
    return this.stateHistory[0] || null;
  }

  resolvePersonalizedPlayers(requestingPlayerId, latestSnapshot) {
    const lagTarget = (latestSnapshot.timestamp || Date.now()) - PLAYER_LATENCY_MS;
    const laggedSnapshot = this.findSnapshotBefore(lagTarget) || latestSnapshot;
    const laggedMap = new Map((laggedSnapshot.players || []).map((player) => [player.id, player]));
    return (latestSnapshot.players || []).map((player) => {
      if (player.id === requestingPlayerId) {
        return player;
      }
      return laggedMap.get(player.id) || player;
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

  getPublicSnapshot() {
    return {
      id: this.id,
      modeKey: this.modeKey,
      difficultyKey: this.difficultyKey,
      phase: this.phase,
      players: Array.from(this.players.values()).map((player) => ({
        id: player.id,
        name: player.name,
        avatarKey: player.avatarKey,
        slot: player.slot,
      })),
    };
  }
}

module.exports = {
  MatchManager,
};
