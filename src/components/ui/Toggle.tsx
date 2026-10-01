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

/**
 * The INSIDE-LABELLED pill — the state's own word sits in the track, opposite
 * the thumb, as on an ON/OFF pill.
 *
 * A separate size table because the geometry is different in kind: the track
 * width follows the text rather than being fixed, so the thumb is positioned
 * absolutely from each end instead of being translated a known distance.
 */
const LABELLED_SIZES = {
  sm: { track: 'h-6 text-[10px]', thumb: 'h-4 w-4', pad: ['pl-6 pr-2.5', 'pl-2.5 pr-6'] },
  md: { track: 'h-7 text-xs', thumb: 'h-5 w-5', pad: ['pl-7 pr-3', 'pl-3 pr-7'] },
} as const;

export interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Visible text beside the switch. Omit inside a table cell and pass `aria-label`. */
  label?: React.ReactNode;
  /**
   * Text shown INSIDE the track when on / off.
   *
   * Supplying either turns the control into the labelled pill. It is opt-in so
   * the ~90 existing call sites are untouched: a bare switch is still the right
   * control for a settings row, where the row's own label already names it and
   * a word in the track would say the same thing twice. The pill earns its
   * width where the control stands ALONE — in chrome, with no label beside it.
   */
  onLabel?: React.ReactNode;
  offLabel?: React.ReactNode;
  /** Extra classes for the thumb — needed when the track colour is overridden. */
  thumbClassName?: string;
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
  onLabel,
  offLabel,
  thumbClassName,
  disabled = false,
  size = 'md',
  id,
  className,
  title,
  'aria-label': ariaLabel,
}: ToggleProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const labelled = onLabel !== undefined || offLabel !== undefined;

  const shared = cn(
    'peer inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
  );

  const control = labelled ? (
    (() => {
      const dims = LABELLED_SIZES[size];
      return (
        <SwitchPrimitives.Root
          id={inputId}
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          className={cn(
            shared,
            // `relative` because the thumb is pinned to an end rather than
            // translated: the track's width follows its text, so there is no
            // fixed distance to translate by.
            'relative justify-center font-semibold uppercase tracking-wide',
            'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
            dims.track,
            // Room for the thumb on whichever side it currently sits.
            checked ? dims.pad[1] : dims.pad[0],
            className,
          )}
        >
          {/* The word, not a second control — it must never swallow the click
              that the track is there to receive. */}
          <span className="pointer-events-none select-none leading-none">
            {checked ? onLabel : offLabel}
          </span>
          <SwitchPrimitives.Thumb
            className={cn(
              'pointer-events-none absolute top-1/2 block -translate-y-1/2 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-all',
              'left-1 data-[state=checked]:left-auto data-[state=checked]:right-1',
              dims.thumb,
              thumbClassName,
            )}
          />
        </SwitchPrimitives.Root>
      );
    })()
  ) : (
    <SwitchPrimitives.Root
      id={inputId}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        shared,
        'border-2 border-transparent',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        SIZES[size].track,
        className,
      )}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          // Deliberately white in both themes: a token-coloured thumb disappears
          // against the dark unchecked track.
          'pointer-events-none block rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform',
          'data-[state=unchecked]:translate-x-0',
          SIZES[size].thumb,
          thumbClassName,
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
