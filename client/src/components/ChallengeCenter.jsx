import { useEffect, useState } from 'react';

const formatCountdown = (expiresAt) => {
  if (!expiresAt) return '';
  const remaining = Math.max(0, expiresAt - Date.now());
  return `${Math.ceil(remaining / 1000)}s`;
};

const ChallengeCenter = ({ inbox, onRespond, challengeStatus, onCancelPending, modeLookup, difficultyLookup }) => {
  const [, setTick] = useState(0);
  const pendingId = challengeStatus?.state === 'pending' ? challengeStatus.challengeId : null;

  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="panel-block">
      <div className="panel-block__header">
        <div>
          <p className="eyebrow">Challenges</p>
          <h2>Engagements</h2>
        </div>
        {pendingId && (
          <button type="button" className="ghost-button" onClick={() => onCancelPending(pendingId)}>
            Cancel pending
          </button>
        )}
      </div>
      <div className="challenge-list">
        {(inbox || []).map((entry) => (
          <div key={entry.challengeId} className="challenge-card">
            <div>
              <p className="player-name">{entry.from?.name}</p>
              <p className="player-status tone-accent">
                {modeLookup[entry.selection?.modeKey] || entry.selection?.modeKey}
                {' · '}
                {difficultyLookup[entry.selection?.difficultyKey] || entry.selection?.difficultyKey}
              </p>
            </div>
            <div className="challenge-card__actions">
              <span className="countdown" aria-live="polite">
                {formatCountdown(entry.expiresAt)}
              </span>
              <div>
                <button type="button" onClick={() => onRespond(entry.challengeId, true)} className="primary-button sm">
                  Accept
                </button>
                <button type="button" onClick={() => onRespond(entry.challengeId, false)} className="ghost-button sm">
                  Decline
                </button>
              </div>
            </div>
          </div>
        ))}
        {!inbox?.length && <p className="empty-state">No incoming challenges right now.</p>}
      </div>
    </div>
  );
};

export default ChallengeCenter;
