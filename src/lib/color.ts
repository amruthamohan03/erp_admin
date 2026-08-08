// Pure colour maths for the branding pipeline.
//
// Branding is stored as `#rrggbb` in `application_settings_master_t` (§4.1), but the
// design tokens in globals.css are bare HSL triplets (`243 75% 59%`) so Tailwind's
// slash-opacity modifiers (`bg-primary/90`) keep working. Everything that bridges
// those two representations lives here, and only here — no component does its own
// colour arithmetic.

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const HEX_RE = /^#?([0-9a-f]{6})$/i;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Parse `#rrggbb` (with or without the hash) into HSL. Returns null on anything else. */
export function hexToHsl(hex: string): Hsl | null {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;

  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  return { h: ((h * 60) % 360 + 360) % 360, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const rgb: [number, number, number] =
    seg === 0 ? [c, x, 0] :
    seg === 1 ? [x, c, 0] :
    seg === 2 ? [0, c, x] :
    seg === 3 ? [0, x, c] :
    seg === 4 ? [x, 0, c] :
    [c, 0, x];

  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

/** Serialise to the bare `H S% L%` form a CSS custom property feeds into `hsl()`. */
export function hslToToken(hsl: Hsl): string {
  return `${Math.round(hsl.h)} ${Math.round(clamp(hsl.s, 0, 100))}% ${Math.round(clamp(hsl.l, 0, 100))}%`;
}

/** Same hue and saturation, new lightness — the basis for hover/active shades. */
export function withLightness(hsl: Hsl, l: number): Hsl {
  return { ...hsl, l: clamp(l, 0, 100) };
}

/** Nudge lightness by a delta, staying inside the 0–100 range. */
export function shiftLightness(hsl: Hsl, delta: number): Hsl {
  return withLightness(hsl, hsl.l + delta);
}

/**
 * Lift a brand colour into the range that reads well on a dark surface.
 * Dark themes need a lighter, slightly less saturated brand or it turns muddy.
 */
export function forDarkSurface(hsl: Hsl): Hsl {
  return { h: hsl.h, s: clamp(hsl.s, 0, 92), l: clamp(Math.max(hsl.l, 62), 0, 78) };
}

/** WCAG relative luminance, used to pick a legible foreground. */
export function relativeLuminance(hsl: Hsl): number {
  const [r, g, b] = hslToRgb(hsl).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A near-white or near-black foreground for the given background, tinted with the
 * background's own hue so it reads as part of the palette rather than pure #fff/#000.
 */
export function readableOn(background: Hsl): Hsl {
  return relativeLuminance(background) > 0.45
    ? { h: background.h, s: clamp(background.s, 0, 40), l: 12 }
    : { h: background.h, s: clamp(background.s, 0, 25), l: 98 };
}
