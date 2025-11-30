const AvatarPicker = ({ avatars, selected, onSelect }) => {
  if (!avatars?.length) {
    return null;
  }

  return (
    <div className="avatar-picker" role="radiogroup" aria-label="Select your pilot avatar">
      {avatars.map((avatar) => {
        const isSelected = avatar.key === selected;
        return (
          <button
            key={avatar.key}
            type="button"
            className={`avatar-chip ${isSelected ? 'selected' : ''}`}
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(avatar.key)}
          >
            <img src={avatar.asset} alt={avatar.label} loading="lazy" />
            <span>{avatar.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default AvatarPicker;
