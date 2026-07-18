export function Select({ label, value, onChange, options }) {
  return (
    <label className="select-field">
      {label ? <span>{label}</span> : null}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
