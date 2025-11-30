const MAP = {
  width: Number(process.env.GAME_WIDTH ?? 960),
  height: Number(process.env.GAME_HEIGHT ?? 640),
};

const PLAYER_SIZE = 32;
const COIN_RADIUS = 18;
const HAZARD_RADIUS = 20;

const REQUIRED_PLAYERS = Number(process.env.REQUIRED_PLAYERS ?? 2);
const NETWORK_LATENCY_MS = Number(process.env.NETWORK_LATENCY_MS ?? 200);
const TICK_RATE = Number(process.env.TICK_RATE ?? 30);

const DIFFICULTIES = {
  chill: {
    key: 'chill',
    label: 'Chill Orbit',
    description: 'Slower pilots, relaxed spawn cadence, long rounds.',
    playerSpeed: 190,
    coinInterval: 3200,
    hazardInterval: 7000,
    matchDuration: 90_000,
  },
  striker: {
    key: 'striker',
    label: 'Star Runner',
    description: 'Balanced movement with moderate spawn pressure.',
    playerSpeed: 230,
    coinInterval: 2600,
    hazardInterval: 5200,
    matchDuration: 75_000,
  },
  inferno: {
    key: 'inferno',
    label: 'Solar Storm',
    description: 'Fastest pilots, relentless spawns, short intense rounds.',
    playerSpeed: 280,
    coinInterval: 1900,
    hazardInterval: 4200,
    matchDuration: 60_000,
  },
};

const GAME_MODES = {
  countdown: {
    key: 'countdown',
    label: 'Countdown',
    description: '90s high-score chase. Highest score after the horn wins.',
    winCondition: 'timer',
    targetScore: null,
    allowHazards: false,
  },
  blitz: {
    key: 'blitz',
    label: 'Blitz',
    description: 'First to 12 coins wins instantly. No ties.',
    winCondition: 'target',
    targetScore: 12,
    allowHazards: false,
  },
  survival: {
    key: 'survival',
    label: 'Survival',
    description: 'Void hazards deduct points. Highest score after timer wins.',
    winCondition: 'timer',
    targetScore: null,
    allowHazards: true,
  },
};

module.exports = {
  MAP,
  PLAYER_SIZE,
  COIN_RADIUS,
  HAZARD_RADIUS,
  REQUIRED_PLAYERS,
  NETWORK_LATENCY_MS,
  TICK_RATE,
  DIFFICULTIES,
  GAME_MODES,
};
