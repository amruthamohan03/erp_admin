import { describe, expect, it } from 'vitest';
import { groupIntoBands, isDense, panelOf, type AccordionLike } from './layout';

const acc = (props: Record<string, unknown> | null): AccordionLike => ({ props });

describe('panelOf', () => {
  it('reads the declared slot', () => {
    expect(panelOf({ panel: 'side' })).toBe('side');
    expect(panelOf({ panel: 'main' })).toBe('main');
  });

  it('treats anything else as full width', () => {
    expect(panelOf(null)).toBeNull();
    expect(panelOf({})).toBeNull();
    // A typo in config must not silently drop the section into a rail.
    expect(panelOf({ panel: 'left' })).toBeNull();
  });
});

describe('isDense', () => {
  it('accepts the jsonb literals a migration writes', () => {
    expect(isDense({ dense: 1 })).toBe(true);
    expect(isDense({ dense: true })).toBe(true);
    expect(isDense({ dense: '1' })).toBe(true);
  });

  it('is off by default', () => {
    expect(isDense(null)).toBe(false);
    expect(isDense({})).toBe(false);
    expect(isDense({ dense: 0 })).toBe(false);
  });
});

describe('groupIntoBands', () => {
  it('keeps a page with no layout config stacked full width', () => {
    const bands = groupIntoBands([acc(null), acc(null), acc({})]);
    expect(bands).toHaveLength(3);
    expect(bands.every((b) => b.kind === 'full')).toBe(true);
  });

  it('pairs consecutive side/main sections into one band', () => {
    // main's import invoice: header, then the rail beside the lines panel.
    const bands = groupIntoBands([
      acc(null),
      acc({ panel: 'side' }),
      acc({ panel: 'side' }),
      acc({ panel: 'main' }),
    ]);
    expect(bands).toHaveLength(2);
    expect(bands[0]!.kind).toBe('full');
    const band = bands[1]!;
    if (band.kind !== 'split') throw new Error('expected a split band');
    expect(band.side).toHaveLength(2);
    expect(band.main).toHaveLength(1);
  });

  it('carries each section its position on the page, for the accent colour', () => {
    const bands = groupIntoBands([acc(null), acc({ panel: 'side' }), acc({ panel: 'main' })]);
    const band = bands[1]!;
    if (band.kind !== 'split') throw new Error('expected a split band');
    expect(band.side[0]!.index).toBe(1);
    expect(band.main[0]!.index).toBe(2);
  });

  it('a full-width section ends the band, so later panels start a new one', () => {
    const bands = groupIntoBands([
      acc({ panel: 'side' }),
      acc({ panel: 'main' }),
      acc(null),
      acc({ panel: 'side' }),
      acc({ panel: 'main' }),
    ]);
    expect(bands.map((b) => b.kind)).toEqual(['split', 'full', 'split']);
  });
});
