const formatClock = (seconds) => {
  if (seconds == null) return '--:--';
  const clamped = Math.max(0, seconds);
  const m = String(Math.floor(clamped / 60)).padStart(2, '0');
  const s = String(clamped % 60).padStart(2, '0');
  return `${m}:${s}`;
};

const Scoreboard = ({
  matchState,
  playerId,
  avatarLookup,
  modeLookup,
  difficultyLookup,
  matchSeconds,
}) => {
  const latest = matchState.snapshots?.[matchState.snapshots.length - 1];
  const players = latest?.players || matchState.roster || [];
  const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const phaseCopy = {
    idle: 'Awaiting pilots',
    staging: 'Staging',
    countdown: 'Countdown',
    playing: 'Live match',
    results: 'Results',
  };

  return (
    <div className="scoreboard">
      <div className="scoreboard__header">
        <div>
          <p className="eyebrow">Match HUD</p>
          <h2>{phaseCopy[matchState.phase] || 'Preparing'}</h2>
        </div>
        <div className="scoreboard__mode">
          <p className="player-status tone-idle">
            {modeLookup[latest?.match?.modeKey] || latest?.match?.modeKey || 'Countdown'} ·{' '}
            {difficultyLookup[latest?.match?.difficultyKey] || latest?.match?.difficultyKey || ''}
          </p>
          <span className={`match-timer ${matchSeconds != null && matchSeconds <= 10 ? 'critical' : ''}`}>
            {formatClock(matchSeconds)}
          </span>
        </div>
      </div>
      <div className="scoreboard__list">
        {sorted.map((player) => {
          const isSelf = player.id === playerId;
          return (
            <div key={player.id} className={`scoreboard__row ${isSelf ? 'self' : ''}`}>
              <div className="avatar-thumb">
                <img src={avatarLookup[player.avatarKey] || avatarLookup.default || '/Avatars/black.svg'} alt="Avatar" />
              </div>
              <div className="scoreboard__meta">
                <p className="player-name">{player.name}</p>
                <p className="player-status tone-idle">Slot {player.slot}</p>
              </div>
              <strong className="score">{player.score ?? 0}</strong>
            </div>
          );
        })}
        {!sorted.length && <p className="empty-state">Jump into a match to see live stats.</p>}
      </div>
    </div>
  );
};

export default Scoreboard;
