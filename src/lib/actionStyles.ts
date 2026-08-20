import { forDarkSurface, hexToHsl, hslToToken, readableOn, shiftLightness, type Hsl } from './color';

// §4.26 — the colour and icon of every action are configuration, not code.
//
// Each action resolves to three CSS variables (base, hover, foreground) which the
// `btn-*` / `ico-*` classes in globals.css read. Because every call site already
// goes through those shared classes (§4.20) rather than inlining a palette colour,
// changing a row here reaches the whole ERP without touching a single component.

/** The actions an operator can restyle. Order drives the settings screen. */
export const ACTION_KEYS = [
  'create',
  'save',
  'update',
  'edit',
  'view',
  'delete',
  'cancel',
  'approve',
  'reject',
  'submit',
  'export',
  'import',
  'download',
  'print',
  'restore',
  'permanent_delete',
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

export interface ActionStyle {
  action_key: ActionKey;
  label: string;
  color: string;
  icon: string;
}

/**
 * Shipped defaults. A fresh install must look deliberate without anyone opening
 * Settings, so these encode the conventions the app already follows: view is
 * near-black, edit blue, delete red, export green, print red (§4.20).
 */
export const ACTION_DEFAULTS: Record<ActionKey, Omit<ActionStyle, 'action_key'>> = {
  create: { label: 'Create', color: '#4f46e5', icon: 'Plus' },
  save: { label: 'Save', color: '#4f46e5', icon: 'Save' },
  update: { label: 'Update', color: '#4f46e5', icon: 'Save' },
  edit: { label: 'Edit', color: '#2563eb', icon: 'Edit2' },
  view: { label: 'View', color: '#0f172a', icon: 'Eye' },
  delete: { label: 'Delete', color: '#dc2626', icon: 'Trash2' },
  cancel: { label: 'Cancel', color: '#475569', icon: 'X' },
  approve: { label: 'Approve', color: '#059669', icon: 'Check' },
  reject: { label: 'Reject', color: '#dc2626', icon: 'X' },
  submit: { label: 'Submit', color: '#4f46e5', icon: 'Send' },
  export: { label: 'Export', color: '#059669', icon: 'FileSpreadsheet' },
  import: { label: 'Import', color: '#0891b2', icon: 'Upload' },
  download: { label: 'Download', color: '#0891b2', icon: 'Download' },
  print: { label: 'Print', color: '#e11d48', icon: 'Printer' },
  restore: { label: 'Restore', color: '#7c3aed', icon: 'RotateCcw' },
  permanent_delete: { label: 'Permanent Delete', color: '#991b1b', icon: 'ShieldX' },
};

export const ACTION_STYLE_DEFAULTS: ActionStyle[] = ACTION_KEYS.map((key) => ({
  action_key: key,
  ...ACTION_DEFAULTS[key],
}));

function parse(hex: string, fallback: string): Hsl {
  return hexToHsl(hex) ?? hexToHsl(fallback) ?? { h: 243, s: 75, l: 59 };
}

/** `--action-<key>: H S% L%;` — one declaration line. */
function decl(key: string, suffix: string, hsl: Hsl): string {
  return `--action-${key}${suffix}:${hslToToken(hsl)};`;
}

/**
 * The `<style>` body injected in the root layout, next to the brand palette.
 *
 * Light mode uses the configured hex as-is. Dark mode lifts it, because a colour
 * chosen against white is usually too dense to read on a dark surface — the same
 * inversion the `--input` token makes (§4.20).
 */
export function actionStyleCssVars(styles: ActionStyle[]): string {
  const byKey = new Map(styles.map((s) => [s.action_key, s]));
  const light: string[] = [];
  const dark: string[] = [];

  for (const key of ACTION_KEYS) {
    const fallback = ACTION_DEFAULTS[key].color;
    const base = parse(byKey.get(key)?.color ?? fallback, fallback);
    // Hover is a shade in whichever direction keeps it distinguishable: darker on
    // a light-ish colour, lighter on one that is already near-black.
    const hover = shiftLightness(base, base.l > 22 ? -7 : 9);
    const onDark = forDarkSurface(base);

    light.push(decl(key, '', base), decl(key, '-hover', hover), decl(key, '-fg', readableOn(base)));
    dark.push(
      decl(key, '', onDark),
      decl(key, '-hover', shiftLightness(onDark, onDark.l > 22 ? -7 : 9)),
      decl(key, '-fg', readableOn(onDark)),
    );
  }

  return `:root{${light.join('')}}\n.dark{${dark.join('')}}`;
}
