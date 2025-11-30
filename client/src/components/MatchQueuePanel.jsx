const MatchQueuePanel = ({
  modes,
  difficulties,
  selectedMode,
  selectedDifficulty,
  onModeChange,
  onDifficultyChange,
  queueState,
  onJoinQueue,
  onLeaveQueue,
}) => {
  const isWaiting = queueState.status === 'waiting';
  const blocked = queueState.status === 'blocked';
  const buttonLabel = isWaiting ? 'Leave queue' : 'Enter queue';

  return (
    <div className="panel-block">
      <div className="panel-block__header">
        <div>
          <p className="eyebrow">Matchmaking</p>
          <h2>Queue preferences</h2>
        </div>
      </div>
      <div className="option-grid" role="radiogroup" aria-label="Game mode">
        {(modes || []).map((mode) => (
          <button
            key={mode.key}
            type="button"
            className={`option-card ${mode.key === selectedMode ? 'active' : ''}`}
            role="radio"
            aria-checked={mode.key === selectedMode}
            onClick={() => onModeChange(mode.key)}
          >
            <div>
              <p className="eyebrow">Mode</p>
              <strong>{mode.label}</strong>
            </div>
            <p className="option-card__text">{mode.description}</p>
          </button>
        ))}
      </div>
      <div className="option-grid" role="radiogroup" aria-label="Difficulty tier">
        {(difficulties || []).map((difficulty) => (
          <button
            key={difficulty.key}
            type="button"
            className={`option-card ${difficulty.key === selectedDifficulty ? 'active' : ''}`}
            role="radio"
            aria-checked={difficulty.key === selectedDifficulty}
            onClick={() => onDifficultyChange(difficulty.key)}
          >
            <div>
              <p className="eyebrow">Difficulty</p>
              <strong>{difficulty.label}</strong>
            </div>
            <p className="option-card__text">{difficulty.description}</p>
          </button>
        ))}
      </div>
      <div className="queue-actions">
        {blocked && <p className="queue-warning">Finish your challenge flow before queueing again.</p>}
        {isWaiting && (
          <p className="queue-status">
            Waiting · Position {queueState.position}/{queueState.needed}
          </p>
        )}
        <button
          type="button"
          className="primary-button"
          onClick={() => (isWaiting ? onLeaveQueue() : onJoinQueue())}
          disabled={blocked}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
};

export default MatchQueuePanel;
