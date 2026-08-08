'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

// The project's single on/off control (§4.11). Built on Radix so keyboard handling,
// focus management and ARIA come from the primitive rather than a hand-rolled button,
// and styled from design tokens so it follows the configured brand and stays visible
// in dark mode.
//
// This represents *state* — something that is on or off. Multi-select groups and
// table row selection keep native checkboxes; see §4.11 for the distinction.

const SIZES = {
  sm: { track: 'h-4 w-7', thumb: 'h-3 w-3 data-[state=checked]:translate-x-3' },
  md: { track: 'h-5 w-9', thumb: 'h-4 w-4 data-[state=checked]:translate-x-4' },
} as const;

export interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Visible text beside the switch. Omit inside a table cell and pass `aria-label`. */
  label?: React.ReactNode;
  disabled?: boolean;
  size?: keyof typeof SIZES;
  id?: string;
  className?: string;
  /** Required when there is no visible `label`, or the control is unnamed to a screen reader. */
  'aria-label'?: string;
  title?: string;
}

export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  id,
  className,
  title,
  'aria-label': ariaLabel,
}: ToggleProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const dims = SIZES[size];

  const control = (
    <SwitchPrimitives.Root
      id={inputId}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        dims.track,
        className,
      )}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          // Deliberately white in both themes: a token-coloured thumb disappears
          // against the dark unchecked track.
          'pointer-events-none block rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform',
          'data-[state=unchecked]:translate-x-0',
          dims.thumb,
        )}
      />
    </SwitchPrimitives.Root>
  );

  if (!label) return control;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex items-center gap-2 text-sm text-foreground/80',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      {control}
      <span>{label}</span>
    </label>
  );
}
