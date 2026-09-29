// §4.1 — the invoice grid's column HEADINGS are configuration.
//
// "Taux/USD", "Total en USD", "CIF/Split" are the operators' own vocabulary,
// half of it French and half English, and it was spelled out in JSX in two
// places — the editable grid and the printed facture — so renaming a column
// meant editing both and hoping they matched. They are rows now.
//
// What is NOT configurable is which columns exist: a column key names a field
// the renderer reads off a line, so the set is vetted exactly as §4.33 vets a
// reference segment type. An operator renames a column; they cannot invent one
// the grid has no value for.

/** The three column sets an invoice grid draws. */
export const GRID_KEYS = ['import-cdf', 'import-usd', 'export-usd'] as const;
export type GridKey = (typeof GRID_KEYS)[number];

export const GRIDS: { key: GridKey; name: string; description: string }[] = [
  {
    key: 'import-cdf',
    name: 'Import — customs (CDF)',
    description:
      'Categories billed in francs on an import invoice — the liquidation block (Government Taxes & Duties).',
  },
  {
    key: 'import-usd',
    name: 'Import — services (USD)',
    description:
      'Every other category on an import invoice — bank, SEGUCE, operations and clearing charges.',
  },
  {
    key: 'export-usd',
    name: 'Export — services (USD)',
    description: 'The categories on an export invoice.',
  },
];

/**
 * The columns each set draws, in order, with the heading each has today.
 *
 * This is the FALLBACK as well as the seed: a heading with no row — because the
 * master was never seeded, or a row was retired — renders the label printed
 * here rather than a blank column header. A grid whose columns have no names is
 * unusable, so a missing config row must never produce one (§4.33's rule).
 */
export const GRID_COLUMNS: Record<GridKey, { key: string; heading: string }[]> = {
  'import-cdf': [
    { key: 'description', heading: 'Description' },
    { key: 'unit', heading: 'Unit' },
    { key: 'cif_split', heading: 'CIF/Split' },
    { key: 'percentage', heading: '%' },
    { key: 'rate_cdf', heading: 'Rate/CDF' },
    { key: 'vat_cdf', heading: 'VAT/CDF' },
    { key: 'total_cdf', heading: 'Total/CDF' },
  ],
  'import-usd': [
    { key: 'description', heading: 'Description' },
    { key: 'unit', heading: 'Unit' },
    { key: 'quantity', heading: 'Qty' },
    { key: 'taux_usd', heading: 'Taux/USD' },
    { key: 'currency', heading: 'Currency' },
    { key: 'tva', heading: 'TVA' },
    { key: 'tva_usd', heading: 'TVA/USD' },
    { key: 'total_usd', heading: 'Total en USD' },
  ],
  'export-usd': [
    { key: 'description', heading: 'Description' },
    { key: 'unit', heading: 'Unit' },
    { key: 'quantity', heading: 'Qty' },
    { key: 'cost_usd', heading: 'Cost/USD' },
    { key: 'tva', heading: 'TVA' },
    { key: 'subtotal_usd', heading: 'Subtotal USD' },
    { key: 'tva_16', heading: 'TVA 16%' },
    { key: 'total_usd', heading: 'Total USD' },
  ],
};

/** Every (grid, column) pair that may be configured — what the master may hold. */
export const GRID_COLUMN_KEYS: Record<GridKey, string[]> = {
  'import-cdf': GRID_COLUMNS['import-cdf'].map((c) => c.key),
  'import-usd': GRID_COLUMNS['import-usd'].map((c) => c.key),
  'export-usd': GRID_COLUMNS['export-usd'].map((c) => c.key),
};

export function isGridKey(v: unknown): v is GridKey {
  return typeof v === 'string' && (GRID_KEYS as readonly string[]).includes(v);
}

export function isColumnOf(grid: GridKey, columnKey: string): boolean {
  return GRID_COLUMN_KEYS[grid].includes(columnKey);
}

/** One grid's headings, keyed by column. What the renderers actually read. */
export type GridHeadings = Record<string, string>;

/** Every grid's headings — one object the client fetches once and holds. */
export type AllGridHeadings = Record<GridKey, GridHeadings>;

/** The built-in headings, as the shape the renderers consume. */
export function defaultHeadings(grid: GridKey): GridHeadings {
  return Object.fromEntries(GRID_COLUMNS[grid].map((c) => [c.key, c.heading]));
}

export function defaultAllHeadings(): AllGridHeadings {
  return {
    'import-cdf': defaultHeadings('import-cdf'),
    'import-usd': defaultHeadings('import-usd'),
    'export-usd': defaultHeadings('export-usd'),
  };
}

/**
 * The heading for one column, with the built-in as the floor.
 *
 * Never returns empty: a configured blank is treated as "not configured", so
 * clearing the box in the master restores the built-in name instead of leaving
 * a nameless column that nobody can identify or fix.
 */
export function headingFor(
  grid: GridKey,
  columnKey: string,
  configured: GridHeadings | undefined,
): string {
  const set = configured?.[columnKey]?.trim();
  if (set) return set;
  return GRID_COLUMNS[grid].find((c) => c.key === columnKey)?.heading ?? columnKey;
}

/** Merge configured rows over the built-ins, for one grid. */
export function mergeHeadings(grid: GridKey, configured: GridHeadings | undefined): GridHeadings {
  return Object.fromEntries(
    GRID_COLUMNS[grid].map((c) => [c.key, headingFor(grid, c.key, configured)]),
  );
}
