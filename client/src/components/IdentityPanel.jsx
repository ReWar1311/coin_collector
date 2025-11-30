import AvatarPicker from './AvatarPicker';

const IdentityPanel = ({
  name,
  nameDraft,
  onNameChange,
  onNameCommit,
  avatars,
  selectedAvatar,
  onAvatarSelect,
}) => {
  return (
    <div className="panel-block">
      <div className="panel-block__header">
        <div>
          <p className="eyebrow">Pilot identity</p>
          <h2>Call sign &amp; avatar</h2>
        </div>
      </div>
      <label className="field-label" htmlFor="pilot-name">
        Display name
      </label>
      <input
        id="pilot-name"
        className="text-input"
        type="text"
        maxLength={18}
        value={nameDraft}
        onChange={(event) => onNameChange(event.target.value)}
        onBlur={() => onNameCommit(nameDraft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onNameCommit(nameDraft);
          }
        }}
        placeholder="Enter your callsign"
        aria-label="Display name"
      />
      <p className="field-hint">Share how other pilots will greet you in the lobby.</p>
      <AvatarPicker avatars={avatars} selected={selectedAvatar} onSelect={onAvatarSelect} />
    </div>
  );
};

export default IdentityPanel;
