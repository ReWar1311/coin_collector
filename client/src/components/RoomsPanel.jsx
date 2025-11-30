const phaseCopy = {
  staging: 'Staging',
  countdown: 'Countdown',
  playing: 'Playing',
  results: 'Results',
};

const RoomsPanel = ({ rooms, modeLookup, difficultyLookup }) => {
  return (
    <div className="panel-block">
      <div className="panel-block__header">
        <div>
          <p className="eyebrow">Live matches</p>
          <h2>{rooms?.length || 0} Rooms</h2>
        </div>
      </div>
      <div className="rooms-stack">
        {(rooms || []).map((room) => (
          <div key={room.id} className="room-card">
            <div>
              <p className="player-name">{modeLookup[room.modeKey] || room.modeKey}</p>
              <p className="player-status tone-idle">{difficultyLookup[room.difficultyKey] || room.difficultyKey}</p>
            </div>
            <div className="room-card__meta">
              <span>{phaseCopy[room.phase] || room.phase}</span>
              <span>{room.players?.length || 0} pilots</span>
            </div>
          </div>
        ))}
        {!rooms?.length && <p className="empty-state">No matches yet, start one!</p>}
      </div>
    </div>
  );
};

export default RoomsPanel;
