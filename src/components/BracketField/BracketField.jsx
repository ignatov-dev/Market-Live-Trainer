export default function BracketField({
  id,
  label,
  value,
  onChange,
  pnlText = null,
  pnlTone = 'neutral',
  disabled = false,
  readOnly = false,
  step = '0.01',
  min = '0.01',
}) {
  return (
    <label htmlFor={id}>
      {label}
      <span className="bracket-field-input-wrap">
        <input
          id={id}
          className="bracket-field-input"
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={onChange}
          disabled={disabled}
          readOnly={readOnly}
        />
        {typeof pnlText === 'string' && pnlText.length > 0 ? (
          <span className={`bracket-field-pnl ${pnlTone === 'pos' ? 'is-pos' : pnlTone === 'neg' ? 'is-neg' : ''}`}>
            {pnlText}
          </span>
        ) : null}
      </span>
    </label>
  );
}
