// §4.1 / §4.12 — where a transaction page's sections sit is CONFIG, not code.
//
// `master_page_accordion_t.props` may declare:
//
//   { "panel": "side" }  — narrow left rail
//   { "panel": "main" }  — wide panel beside the rail
//   { "dense": 1 }       — label-beside-control rows instead of the field grid
//
// main's importinvoice.php is the shape this exists for: a 25% INVOICE DETAILS
// rail (financials, transport, documents, comments) beside a 75% QUOTATION
// SELECTION panel. exportinvoice.php stacks everything full width, and so does
// every other page — which is exactly what "no props" means, so nothing that
// already works has to change.
//
// Consecutive sections that declare a panel form ONE band; a section without a
// panel ends the band and spans the page. Grouping by adjacency rather than by
// slug keeps the rule general: a page orders its sections, and the ones it wants
// side by side simply sit next to each other.

export type PanelSlot = 'side' | 'main';

export interface AccordionLike {
  props: Record<string, unknown> | null;
}

export interface BandEntry<T> {
  accordion: T;
  /**
   * Position on the page. The accent colour is picked from it, so it has to
   * survive the grouping rather than being recomputed per band — otherwise the
   * rail and the panel beside it would both restart at the first accent.
   */
  index: number;
}

export type Band<T> =
  | { kind: 'full'; entry: BandEntry<T> }
  | { kind: 'split'; side: Array<BandEntry<T>>; main: Array<BandEntry<T>> };

/** The slot a section asked for, or null when it spans the page. */
export function panelOf(props: Record<string, unknown> | null | undefined): PanelSlot | null {
  const panel = props?.['panel'];
  return panel === 'side' || panel === 'main' ? panel : null;
}

/**
 * True when the section draws label-beside-control rows.
 *
 * Accepts 1 as well as true because the value arrives from jsonb written by a
 * migration, where `1` is the natural literal.
 */
export function isDense(props: Record<string, unknown> | null | undefined): boolean {
  const dense = props?.['dense'];
  return dense === true || dense === 1 || dense === '1';
}

/**
 * Group a page's sections into full-width bands and two-column bands, keeping
 * the page's own order. Pure, so the rule can be tested without a DOM (§4.10).
 */
export function groupIntoBands<T extends AccordionLike>(accordions: readonly T[]): Array<Band<T>> {
  const bands: Array<Band<T>> = [];
  let open: { kind: 'split'; side: Array<BandEntry<T>>; main: Array<BandEntry<T>> } | null = null;

  accordions.forEach((accordion, index) => {
    const slot = panelOf(accordion.props);
    if (!slot) {
      // A full-width section ends the band: sections only pair up when the page
      // put them next to each other.
      open = null;
      bands.push({ kind: 'full', entry: { accordion, index } });
      return;
    }
    if (!open) {
      open = { kind: 'split', side: [], main: [] };
      bands.push(open);
    }
    open[slot].push({ accordion, index });
  });

  return bands;
}
