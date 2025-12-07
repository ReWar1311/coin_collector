const statusCopy = {
  idle: 'Idle',
  queue: 'In queue',
  match: 'In match',
  challenging: 'Sending challenge',
  challengeIncoming: 'Challenge pending',
};

const statusTone = {
  idle: 'tone-idle',
  queue: 'tone-warn',
  match: 'tone-live',
  challenging: 'tone-accent',
  challengeIncoming: 'tone-accent',
};

const PlayerList = ({ players, selfId, onChallenge, challengeStatus, avatarLookup }) => {
  const sorted = [...(players || [])].sort((a, b) => a.name.localeCompare(b.name));
  const pending = challengeStatus?.state === 'pending';
  const reasonCopy = {
    invalidTarget: 'Select a different pilot',
    notFound: 'Pilot left the lobby',
    unavailable: 'Pilot unavailable',
    challengePending: 'Finish pending challenge',
    disconnect: 'Opponent disconnected',
  };

  return (
    <div className="panel-block fill">
      <div className="panel-block__header">
        <div>
          <p className="eyebrow">Pilots online</p>
          <h2>{players?.length || 0} Connected</h2>
        </div>
      </div>
      {challengeStatus && (
        <div className={`challenge-status ${challengeStatus.state}`}>
          <p>
            {challengeStatus.state === 'pending' && 'Awaiting opponent response...'}
            {challengeStatus.state === 'accepted' && 'Challenge accepted · launching match'}
            {challengeStatus.state === 'declined' && 'Challenge declined'}
            {challengeStatus.state === 'timeout' && 'Challenge expired'}
            {challengeStatus.state === 'cancelled' && 'Challenge cancelled'}
            {challengeStatus.state === 'error' && 'Cannot challenge that pilot right now'}
            {challengeStatus.state === 'unavailable' && 'Pilot became unavailable'}
            {challengeStatus.reason && ` · ${reasonCopy[challengeStatus.reason] || challengeStatus.reason}`}
          </p>
        </div>
      )}
      <div className="player-list" role="list">
        {sorted.map((player) => {
          const isSelf = player.id === selfId;
          const readableStatus = statusCopy[player.status] || 'Online';
          const tone = statusTone[player.status] || 'tone-idle';
          const canChallenge = !isSelf && player.status === 'idle' && !pending;
          return (
            <div key={player.id} className={`player-card ${isSelf ? 'self' : ''}`} role="listitem">
              <div className="player-card__meta">
                <div className="avatar-thumb">
                  <img
                    src={avatarLookup[player.avatarKey] || avatarLookup.default || '/Avatars/black.svg'}
                    alt="Avatar"
                    loading="lazy"
                  />
                </div>
                <div>
                  <p className="player-name">{player.name}</p>
                  <p className={`player-status ${tone}`}>{isSelf ? `${readableStatus} · You` : readableStatus}</p>
                </div>
              </div>
              <div className="player-card__actions">{canChallenge && (
                <button type="button" className="ghost-button" disabled={!canChallenge} onClick={() => onChallenge(player)}>
                  Challenge
                </button>)}
              </div>
            </div>
          );
        })}
        {!sorted.length && <p className="empty-state">The lobby is loading pilots...</p>}
      </div>
    </div>
  );
};

export default PlayerList;
