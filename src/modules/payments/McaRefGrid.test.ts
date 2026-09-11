import { describe, it, expect } from 'vitest';
import { importSentence, nameRefs, type ImportResult, type ImportedLine } from './McaRefGrid';

/**
 * The sentence an operator reads after importing a spreadsheet of references.
 *
 * It is tested because it IS the feature: an import that quietly lands four bad
 * rows is indistinguishable from one that worked until Save rejects the whole
 * request and names one of them. §4.23 — say which reference, what is wrong with
 * it, and what to do.
 */

const line = (over: Partial<ImportedLine>): ImportedLine => ({
  mca_ref: 'A-1',
  amount: 0,
  exists: true,
  duplicate: null,
  valid: true,
  ...over,
});

const result = (over: Partial<ImportResult> = {}): ImportResult => ({
  lines: [],
  blank: 0,
  duplicates: 0,
  header_skipped: false,
  file_name: 'refs.xlsx',
  valid_count: 0,
  not_found: [],
  already_claimed: [],
  ...over,
});

const NONE = { alreadyHere: 0, overflow: 0 };

describe('nameRefs', () => {
  it('lists them when there are few enough to read', () => {
    expect(nameRefs(['A-1', 'A-2'])).toBe('A-1, A-2');
  });

  it('caps the list rather than printing a wall of references', () => {
    // A sheet where every row is wrong must still produce a sentence.
    expect(nameRefs(['A-1', 'A-2', 'A-3', 'A-4', 'A-5'])).toBe('A-1, A-2, A-3 and 2 more');
  });
});

describe('importSentence', () => {
  it('reports how many of the imported rows are actually usable', () => {
    const fresh = [line({ mca_ref: 'A-1' }), line({ mca_ref: 'A-2' })];
    const msg = importSentence(result(), fresh, NONE);
    expect(msg).toContain('2 references imported from “refs.xlsx”');
    expect(msg).toContain('2 ready to save');
    // Nothing went wrong, so nothing is said about red rows.
    expect(msg).not.toContain('red');
  });

  it('NAMES the references that are not in the tracking system', () => {
    const fresh = [line({ mca_ref: 'GOOD-1' }), line({ mca_ref: 'GHOST-1', exists: false, valid: false })];
    const msg = importSentence(result(), fresh, NONE);
    expect(msg).toContain('1 not found in the tracking system for this client: GHOST-1.');
    expect(msg).toContain('1 ready to save');
  });

  it('NAMES the references already claimed, with the request holding each', () => {
    // The operator's next move is to open that request — so the sentence has to
    // carry its number, not just say "already used".
    const fresh = [line({ mca_ref: 'TAKEN-1', duplicate: 42, valid: false })];
    const msg = importSentence(result(), fresh, NONE);
    expect(msg).toContain('1 already claimed for this expense type: TAKEN-1 (request #42).');
  });

  it('keeps the two failures apart — they have different fixes', () => {
    const fresh = [
      line({ mca_ref: 'GHOST-1', exists: false, valid: false }),
      line({ mca_ref: 'TAKEN-1', duplicate: 7, valid: false }),
    ];
    const msg = importSentence(result(), fresh, NONE);
    expect(msg).toContain('1 not found in the tracking system');
    expect(msg).toContain('1 already claimed for this expense type');
    // A reference that does not exist must never be reported as "already used",
    // which is what a single merged "N invalid" count would amount to.
    expect(msg).not.toContain('2 already claimed');
  });

  it('tells the operator the red rows block the save', () => {
    const fresh = [line({ mca_ref: 'GHOST-1', exists: false, valid: false })];
    expect(importSentence(result(), fresh, NONE)).toContain(
      'The red rows must be corrected or removed before this request can be saved.',
    );
  });

  it('accounts for every row it skipped', () => {
    // Four different reasons a row never reached the grid; all four are stated,
    // because an import that silently shortens is one nobody can reconcile
    // against the sheet they sent.
    const msg = importSentence(
      result({ duplicates: 2, blank: 1 }),
      [line({})],
      { alreadyHere: 3, overflow: 4 },
    );
    expect(msg).toContain('Skipped 3 already in the grid, 2 repeated in the file, 1 with no reference, 4 past the 50-reference limit.');
  });

  it('says nothing about skipping when nothing was skipped', () => {
    expect(importSentence(result(), [line({})], NONE)).not.toContain('Skipped');
  });

  it('handles a sheet whose every row was already in the grid', () => {
    // fresh is empty: the count reads naturally and no "0 ready to save" appears.
    const msg = importSentence(result(), [], { alreadyHere: 5, overflow: 0 });
    expect(msg).toContain('0 references imported');
    expect(msg).not.toContain('ready to save');
    expect(msg).toContain('Skipped 5 already in the grid.');
  });

  it('uses the singular for one reference', () => {
    expect(importSentence(result(), [line({})], NONE)).toContain('1 reference imported');
  });
});
