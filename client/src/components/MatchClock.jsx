const formatClock = (seconds, fallback = '—') => {
  if (seconds == null) return fallback;
  const clamped = Math.max(0, seconds);
  const m = String(Math.floor(clamped / 60)).padStart(2, '0');
  const s = String(clamped % 60).padStart(2, '0');
  return `${m}:${s}`;
};

const MatchClock = ({ countdownSeconds, matchSeconds, phase }) => {
  const label = countdownSeconds && countdownSeconds > 0 ? 'Match begins in' : 'Time remaining';
  const value = countdownSeconds && countdownSeconds > 0 ? countdownSeconds : formatClock(matchSeconds);
  const critical = matchSeconds != null && matchSeconds <= 10 && phase === 'playing';

  return (
    <div className={`match-clock ${critical ? 'critical' : ''}`}>
      <span className="label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
};

export default MatchClock;
