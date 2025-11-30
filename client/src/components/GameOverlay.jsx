const formatWinner = (results) => {
  if (!results) return 'Game Over';
  if (!results.winnerId) {
    return 'Draw!';
  }
  const winner = results.scores?.find((entry) => entry.id === results.winnerId);
  if (winner) {
    return `${winner.name || 'Pilot'} wins!`;
  }
  const fallbackName = results.winnerName || results.winnerId;
  if (fallbackName) {
    return `${fallbackName} wins!`;
  }
  return 'Victory';
};

const GameOverlay = ({ countdownSeconds, phase, results }) => {
  if (countdownSeconds && countdownSeconds > 0) {
    return (
      <div className="game-overlay">
        <p className="label">Prepare for launch</p>
        <span className="countdown-value">{countdownSeconds}</span>
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="game-overlay">
        <p className="label">Game Over</p>
        <span className="countdown-value sm">{formatWinner(results)}</span>
      </div>
    );
  }

  return null;
};

export default GameOverlay;
