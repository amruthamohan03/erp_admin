'use client';

import { useId } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  title?: string;
  'aria-label'?: string;
}

export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  id,
  title,
  'aria-label': ariaLabel,
}: ToggleProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const dims =
    size === 'sm'
      ? { track: 'h-4 w-7', knob: 'h-3 w-3', translate: 'translate-x-3' }
      : { track: 'h-5 w-9', knob: 'h-4 w-4', translate: 'translate-x-4' };

  const button = (
    <button
      type="button"
      role="switch"
      id={inputId}
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
        dims.track,
        checked ? 'bg-primary-600' : 'bg-slate-300',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block transform rounded-full bg-white shadow transition-transform',
          dims.knob,
          checked ? dims.translate : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );

  if (!label) return button;

  return (
    <label
      htmlFor={inputId}
      className={[
        'inline-flex items-center gap-2 text-sm text-slate-700',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {button}
      <span>{label}</span>
    </label>
  );
}
