// A road consignment's journey, as the ordered milestones it passes.
//
// Main's dashboard expressed this as ten hand-written SUM(CASE WHEN …) clauses
// in one 2 kB query, each repeating the previous milestone's column to say "got
// this far but no further". Ten clauses, nine of them pairwise duplicates, and
// inserting a stage meant rewriting its neighbours.
//
// Declared as a chain instead: a file is WAITING at milestone i when milestone
// i is empty and milestone i-1 is filled, so the SQL is generated from this one
// list and a new leg is a new entry (§4.10).

export interface RoadMilestone {
  /** Stable key — used in the API, the UI and the per-stage export. */
  key: string;
  /** What the file is waiting FOR, as a stage label. */
  label: string;
  /** Column on `imports_t` that records reaching it. */
  column: string;
}

export const ROAD_MILESTONES: readonly RoadMilestone[] = [
  { key: 'arrival_zambia', label: 'Arrival in Zambia', column: 'arrival_date_zambia' },
  { key: 'dispatch_zambia', label: 'Dispatch from Zambia', column: 'dispatch_from_zambia' },
  { key: 'drc_entry', label: 'DRC Entry', column: 'drc_entry_date' },
  {
    key: 'border_warehouse',
    label: 'Border Warehouse Arrival',
    column: 'border_warehouse_arrival_date',
  },
  { key: 'border_dispatch', label: 'Dispatch from Border', column: 'dispatch_from_border' },
  { key: 'kanyaka_arrival', label: 'Kanyaka Arrival', column: 'kanyaka_arrival_date' },
  { key: 'kanyaka_dispatch', label: 'Kanyaka Dispatch', column: 'kanyaka_dispatch_date' },
  { key: 'warehouse_arrival', label: 'Final Warehouse Arrival', column: 'warehouse_arrival_date' },
] as const;

export const ROAD_MILESTONE_KEYS: readonly string[] = ROAD_MILESTONES.map((m) => m.key);

export function isRoadMilestone(key: string): boolean {
  return ROAD_MILESTONE_KEYS.includes(key);
}

/**
 * The milestone that must already be reached before a file can be waiting at
 * `key` — or null for the first leg, which nothing precedes.
 */
export function previousMilestone(key: string): RoadMilestone | null {
  const i = ROAD_MILESTONES.findIndex((m) => m.key === key);
  return i > 0 ? ROAD_MILESTONES[i - 1] : null;
}

/** Reaching the last milestone IS completing the road journey. */
export const ROAD_JOURNEY_END = ROAD_MILESTONES[ROAD_MILESTONES.length - 1];
