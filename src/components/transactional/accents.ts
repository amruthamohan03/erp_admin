// Shared accent palette for transactional-page accordions. One curated,
// same-saturation gradient set, cycled by accordion position so a page's
// sections read as one harmonious group. Kept here (not inline in each
// component) so the form accordions and the read-only view modal stay in
// visual sync — §4.10, one source, no divergent copies.

export interface Accent {
  // Icon-chip gradient (bg-gradient-to-br).
  chip: string;
  // Thin accent bar + section save button (bg-gradient-to-r).
  bar: string;
  // Soft header tint when the section is open.
  tint: string;
  // Title colour when open.
  title: string;
}

export const ACCENTS: Accent[] = [
  { chip: 'from-indigo-500 to-violet-600', bar: 'from-indigo-500 to-violet-500', tint: 'bg-indigo-50/70 dark:bg-indigo-500/10', title: 'text-indigo-950 dark:text-indigo-100' },
  { chip: 'from-sky-500 to-blue-600', bar: 'from-sky-500 to-blue-500', tint: 'bg-sky-50/70 dark:bg-sky-500/10', title: 'text-sky-950 dark:text-sky-100' },
  { chip: 'from-emerald-500 to-teal-600', bar: 'from-emerald-500 to-teal-500', tint: 'bg-emerald-50/70 dark:bg-emerald-500/10', title: 'text-emerald-950 dark:text-emerald-100' },
  { chip: 'from-amber-500 to-orange-600', bar: 'from-amber-500 to-orange-500', tint: 'bg-amber-50/70 dark:bg-amber-500/10', title: 'text-amber-950 dark:text-amber-100' },
  { chip: 'from-rose-500 to-pink-600', bar: 'from-rose-500 to-pink-500', tint: 'bg-rose-50/70 dark:bg-rose-500/10', title: 'text-rose-950 dark:text-rose-100' },
  { chip: 'from-cyan-500 to-sky-600', bar: 'from-cyan-500 to-sky-500', tint: 'bg-cyan-50/70 dark:bg-cyan-500/10', title: 'text-cyan-950 dark:text-cyan-100' },
  { chip: 'from-violet-500 to-purple-600', bar: 'from-violet-500 to-purple-500', tint: 'bg-violet-50/70 dark:bg-violet-500/10', title: 'text-violet-950 dark:text-violet-100' },
  { chip: 'from-teal-500 to-emerald-600', bar: 'from-teal-500 to-emerald-500', tint: 'bg-teal-50/70 dark:bg-teal-500/10', title: 'text-teal-950 dark:text-teal-100' },
];

export function accentFor(index: number): Accent {
  return ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}
