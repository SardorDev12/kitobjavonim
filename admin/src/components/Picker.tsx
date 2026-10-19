/** A small labelled dropdown for the list pages' "Show" and "Sort" controls. */
export function Picker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }} className="text-muted">
      {label}
      <select className="input" value={value} onChange={(event) => onChange(event.target.value as T)} style={{ width: 'auto' }}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
