import { describe, it, expect } from 'vitest';
import {
  ACTION_KEYS,
  ACTION_DEFAULTS,
  ACTION_STYLE_DEFAULTS,
  actionStyleCssVars,
  type ActionStyle,
} from './actionStyles';

// §4.26 — these variables are what every action button in the app reads, so a
// gap here is invisible in code review and very visible on screen.

describe('action style defaults', () => {
  it('covers all sixteen configurable actions', () => {
    expect(ACTION_KEYS).toHaveLength(16);
    expect(ACTION_STYLE_DEFAULTS).toHaveLength(16);
    for (const key of ACTION_KEYS) expect(ACTION_DEFAULTS[key]).toBeDefined();
  });

  it('ships the conventions the app already followed', () => {
    expect(ACTION_DEFAULTS.view.color).toBe('#0f172a'); // near-black
    expect(ACTION_DEFAULTS.edit.color).toBe('#2563eb'); // blue
    expect(ACTION_DEFAULTS.delete.color).toBe('#dc2626'); // red
    expect(ACTION_DEFAULTS.export.color).toBe('#059669'); // green
  });

  it('gives every default a valid hex and a PascalCase icon', () => {
    for (const s of ACTION_STYLE_DEFAULTS) {
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.icon).toMatch(/^[A-Z][A-Za-z0-9]*$/);
    }
  });
});

describe('actionStyleCssVars', () => {
  const css = actionStyleCssVars(ACTION_STYLE_DEFAULTS);

  it('emits base, hover and foreground for every action, in both themes', () => {
    for (const key of ACTION_KEYS) {
      for (const suffix of ['', '-hover', '-fg']) {
        expect(css).toContain(`--action-${key}${suffix}:`);
      }
    }
    expect(css).toContain(':root{');
    expect(css).toContain('.dark{');
  });

  it('lifts colours for dark mode rather than reusing the light value', () => {
    const [light, dark] = css.split('.dark{');
    const pick = (block: string, key: string) =>
      new RegExp(`--action-${key}:([^;]+);`).exec(block)?.[1];
    // A dense red chosen against white is too heavy on a dark surface.
    expect(pick(dark, 'delete')).not.toBe(pick(light, 'delete'));
  });

  it('falls back to the default when a row carries an unusable colour', () => {
    const broken: ActionStyle[] = [
      { action_key: 'delete', label: 'Delete', color: 'not-a-colour', icon: 'Trash2' },
    ];
    const out = actionStyleCssVars(broken);
    const fromDefault = actionStyleCssVars(ACTION_STYLE_DEFAULTS);
    const pick = (s: string) => /--action-delete:([^;]+);/.exec(s)?.[1];
    expect(pick(out)).toBe(pick(fromDefault));
  });

  it('still emits a full set when only one action is configured', () => {
    const out = actionStyleCssVars([
      { action_key: 'view', label: 'View', color: '#123456', icon: 'Eye' },
    ]);
    for (const key of ACTION_KEYS) expect(out).toContain(`--action-${key}:`);
  });
});
