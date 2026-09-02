import { describe, expect, it } from 'vitest';
import {
  MCA_REF_DEFAULTS,
  MCA_REF_TARGETS,
  MCA_REF_TARGET_KEYS,
  buildSequencePattern,
  previewMcaRef,
  renderMcaRef,
  validateSegments,
  type McaRefSegment,
  type McaRefTokens,
} from './mcaRefFormat';

const TOKENS: McaRefTokens = {
  client: 'NMI',
  kind: 'ID',
  goods: 'CO',
  transport: 'R',
  office: 'KINSHASA',
  year: '2026',
};

describe('the shipped defaults reproduce the references already in the database', () => {
  // These are not arbitrary examples — they are the exact output of the hardcoded
  // templates this table replaced. If one of them changes, every consignment
  // created after the deploy gets a reference in a different shape from the ones
  // before it, which is the one outcome this feature must never produce.
  it.each([
    ['import', 'NMI-IDCOR26-0001'],
    ['export', 'NMI-IDCOR26-0001'],
    ['license', 'NMI-ID-CO-R'],
    ['local', 'NMI-LTKI26-0001'],
    ['export-invoice', '2026-NMI-EXP-0001'],
    ['import-invoice', '2026-NMI-0001'],
  ] as const)('%s renders %s', (target, expected) => {
    expect(renderMcaRef(MCA_REF_DEFAULTS[target], TOKENS, 1)).toBe(expected);
  });

  it('covers every target, so none falls back to nothing', () => {
    for (const key of MCA_REF_TARGET_KEYS) {
      expect(MCA_REF_DEFAULTS[key].length).toBeGreaterThan(0);
      expect(validateSegments(MCA_REF_DEFAULTS[key], key)).toEqual([]);
    }
  });
});

describe('rearranging segments', () => {
  it('moves the client code to the end without touching anything else', () => {
    // The second arrangement from the request: IDCOR26-0001-NMI.
    const segments: McaRefSegment[] = [
      { type: 'kind' },
      { type: 'goods', separator: '' },
      { type: 'transport', separator: '' },
      { type: 'year', separator: '', digits: 2 },
      { type: 'sequence', separator: '-', width: 4 },
      { type: 'client', separator: '-' },
    ];
    expect(renderMcaRef(segments, TOKENS, 1)).toBe('IDCOR26-0001-NMI');
  });

  it("ignores the first segment's separator, so a leading dash is impossible", () => {
    expect(renderMcaRef([{ type: 'client', separator: '/' }], TOKENS, 1)).toBe('NMI');
  });

  it('honours a separator that is not a dash', () => {
    const segments: McaRefSegment[] = [
      { type: 'client' },
      { type: 'year', separator: '/', digits: 4 },
      { type: 'sequence', separator: '/', width: 3 },
    ];
    expect(renderMcaRef(segments, TOKENS, 7)).toBe('NMI/2026/007');
  });

  it('pads the number to the configured width', () => {
    const segments: McaRefSegment[] = [{ type: 'sequence', width: 6 }];
    expect(renderMcaRef(segments, TOKENS, 42)).toBe('000042');
  });

  it('slices a full office name down to its leading letters', () => {
    expect(renderMcaRef([{ type: 'office', letters: 3 }], TOKENS, 1)).toBe('KIN');
    expect(renderMcaRef([{ type: 'office', letters: 2 }], { office: 'Lubumbashi (Main)' }, 1)).toBe('LU');
  });
});

describe('a missing code blanks the whole reference', () => {
  // A reference with a hole in it is not a shorter reference — it is a different
  // one, and it will collide with a consignment that legitimately has that shape.
  it('returns null when a segment has no value', () => {
    expect(renderMcaRef(MCA_REF_DEFAULTS.import, { ...TOKENS, transport: null }, 1)).toBeNull();
    expect(renderMcaRef(MCA_REF_DEFAULTS.import, { ...TOKENS, client: '' }, 1)).toBeNull();
  });

  it('returns null when the format wants a number and none was supplied', () => {
    expect(renderMcaRef(MCA_REF_DEFAULTS.import, TOKENS, null)).toBeNull();
  });

  it('does not need a number for a format without a sequence', () => {
    expect(renderMcaRef(MCA_REF_DEFAULTS.license, TOKENS)).toBe('NMI-ID-CO-R');
  });

  it('rejects a year that is not four digits', () => {
    expect(renderMcaRef([{ type: 'year', digits: 2 }], { year: '26' }, 1)).toBeNull();
  });
});

describe('buildSequencePattern', () => {
  it('anchors on every other segment and captures the digits', () => {
    const built = buildSequencePattern(MCA_REF_DEFAULTS.import, TOKENS);
    expect(built).not.toBeNull();
    expect(built!.width).toBe(4);
    const re = new RegExp(built!.pattern);
    expect(re.test('NMI-IDCOR26-0001')).toBe(true);
    expect('NMI-IDCOR26-0417'.match(re)![1]).toBe('0417');
  });

  it('excludes a different client, kind, transport or year — that is the counter scope', () => {
    const re = new RegExp(buildSequencePattern(MCA_REF_DEFAULTS.import, TOKENS)!.pattern);
    expect(re.test('ABC-IDCOR26-0001')).toBe(false); // other client
    expect(re.test('NMI-EXCOR26-0001')).toBe(false); // other kind
    expect(re.test('NMI-IDCOA26-0001')).toBe(false); // other transport
    expect(re.test('NMI-IDCOR27-0001')).toBe(false); // other year
  });

  it('matches when the number is in the MIDDLE, which a prefix scan could not', () => {
    const segments: McaRefSegment[] = [
      { type: 'kind' },
      { type: 'sequence', separator: '-', width: 4 },
      { type: 'client', separator: '-' },
    ];
    const re = new RegExp(buildSequencePattern(segments, TOKENS)!.pattern);
    expect('ID-0009-NMI'.match(re)![1]).toBe('0009');
    expect(re.test('ID-0009-ABC')).toBe(false);
  });

  it('rejects the wrong number of digits, so 0001 and 00001 are not the same series', () => {
    const re = new RegExp(buildSequencePattern(MCA_REF_DEFAULTS.import, TOKENS)!.pattern);
    expect(re.test('NMI-IDCOR26-00001')).toBe(false);
    expect(re.test('NMI-IDCOR26-001')).toBe(false);
  });

  it('escapes a separator that is a regex metacharacter', () => {
    const segments: McaRefSegment[] = [
      { type: 'client' },
      { type: 'sequence', separator: '.', width: 2 },
    ];
    const re = new RegExp(buildSequencePattern(segments, TOKENS)!.pattern);
    expect(re.test('NMI.07')).toBe(true);
    expect(re.test('NMIx07')).toBe(false);
  });

  it('is null for a format that has no number to increment', () => {
    expect(buildSequencePattern(MCA_REF_DEFAULTS.license, TOKENS)).toBeNull();
  });

  it('is null when a token is missing, so no scan runs against a half-built prefix', () => {
    expect(buildSequencePattern(MCA_REF_DEFAULTS.import, { ...TOKENS, kind: null })).toBeNull();
  });
});

describe('validateSegments', () => {
  it('accepts a rearranged but complete format', () => {
    expect(
      validateSegments(
        [{ type: 'kind' }, { type: 'sequence', separator: '-', width: 4 }, { type: 'client', separator: '-' }],
        'import',
      ),
    ).toEqual([]);
  });

  it('refuses a segment the target cannot resolve, and says what it can', () => {
    const [issue] = validateSegments([{ type: 'transport' }], 'import-invoice');
    expect(issue.message).toContain('transport');
    expect(issue.message).toContain('client');
  });

  it('refuses two counters in one reference', () => {
    const issues = validateSegments(
      [{ type: 'sequence', width: 4 }, { type: 'sequence', separator: '-', width: 4 }],
      'import',
    );
    expect(issues.some((i) => i.message.includes('one incrementing number'))).toBe(true);
  });

  it('refuses an empty format and empty fixed text', () => {
    expect(validateSegments([], 'import')).toHaveLength(1);
    expect(validateSegments([{ type: 'literal', value: '  ' }], 'import')[0].message).toContain('nothing typed');
  });

  it('refuses an out-of-range sequence width and year digit count', () => {
    expect(validateSegments([{ type: 'sequence', width: 0 }], 'import')).not.toEqual([]);
    expect(validateSegments([{ type: 'year', digits: 3 }], 'import')).not.toEqual([]);
  });
});

describe('previewMcaRef', () => {
  it('renders the sample so the setup screen shows the shape before it is used', () => {
    expect(previewMcaRef(MCA_REF_DEFAULTS.import, 'import')).toBe('NMI-IDCOR26-0001');
  });

  it('degrades to an em-dash rather than throwing on a half-edited format', () => {
    expect(previewMcaRef([{ type: 'literal', value: '' }], 'import')).toBe('—');
  });

  it('every target declares a sample for each token type it accepts', () => {
    for (const key of MCA_REF_TARGET_KEYS) {
      const meta = MCA_REF_TARGETS[key];
      for (const type of meta.tokens) {
        if (type === 'literal' || type === 'sequence') continue;
        expect(meta.sample[type as keyof McaRefTokens]).toBeTruthy();
      }
    }
  });
});
