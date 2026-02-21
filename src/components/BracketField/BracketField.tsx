import React from 'react';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  pnlText?: string | null;
  pnlTone?: 'pos' | 'neg' | 'neutral';
  disabled?: boolean;
  readOnly?: boolean;
  step?: string;
  min?: string;
}

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
}: Props) {
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
