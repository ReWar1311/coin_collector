const VolumeControls = ({
  bgmVolume,
  sfxVolume,
  isBgmActive,
  onBgmVolume,
  onSfxVolume,
  onToggleBgm,
}) => {
  const bgmLabel = isBgmActive ? 'Pause BGM' : 'Play BGM';
  return (
    <div className="panel-block">
      <div className="panel-block__header">
        <div>
          <p className="eyebrow">Audio mix</p>
          <h2>Sound studio</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onToggleBgm}>
          {bgmLabel}
        </button>
      </div>
      <div className="volume-slider">
        <label htmlFor="bgm-volume">Background music</label>
        <input
          id="bgm-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={bgmVolume}
          onChange={(event) => onBgmVolume(Number(event.target.value))}
          aria-valuetext={`${Math.round(bgmVolume * 100)} percent`}
        />
      </div>
      <div className="volume-slider">
        <label htmlFor="sfx-volume">Game sounds</label>
        <input
          id="sfx-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sfxVolume}
          onChange={(event) => onSfxVolume(Number(event.target.value))}
          aria-valuetext={`${Math.round(sfxVolume * 100)} percent`}
        />
      </div>
    </div>
  );
};

export default VolumeControls;
