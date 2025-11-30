const latencyStatus = (latency, budget) => {
  if (!latency) return 'neutral';
  if (latency <= budget + 40) return 'good';
  if (latency <= budget * 1.5) return 'warning';
  return 'bad';
};

const LatencyBadge = ({ latency, connectionState }) => {
  const live = latency?.live ?? null;
  const budget = latency?.budget ?? 0;
  const status = latencyStatus(live, budget);
  const label = live ? `${Math.round(live)} ms` : '—';

  return (
    <div className={`latency-badge ${status}`} aria-live="polite">
      <span className="label">Latency</span>
      <strong>{label}</strong>
      <span className="sub">Target 400 (200+200) ms · {connectionState}</span>
    </div>
  );
};

export default LatencyBadge;
