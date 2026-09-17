import { describe, expect, it } from 'vitest';
import { frenchAmountInWords, frenchIntegerWords } from './frenchAmount';

// The written amount on a payment authorisation. It exists to be checked
// against the figures, so every one of these is a case where getting it wrong
// would put two different amounts on the same document.

describe('frenchIntegerWords', () => {
  it('writes the units', () => {
    expect(frenchIntegerWords(0)).toBe('zéro');
    expect(frenchIntegerWords(1)).toBe('un');
    expect(frenchIntegerWords(9)).toBe('neuf');
  });

  it('writes the teens, which are their own words', () => {
    expect(frenchIntegerWords(10)).toBe('dix');
    expect(frenchIntegerWords(11)).toBe('onze');
    expect(frenchIntegerWords(16)).toBe('seize');
    expect(frenchIntegerWords(17)).toBe('dix-sept');
    expect(frenchIntegerWords(19)).toBe('dix-neuf');
  });

  it('counts 70–79 as sixty-ten, not as its own decade', () => {
    expect(frenchIntegerWords(70)).toBe('soixante-dix');
    expect(frenchIntegerWords(71)).toBe('soixante-onze');
    expect(frenchIntegerWords(77)).toBe('soixante-dix-sept');
    expect(frenchIntegerWords(79)).toBe('soixante-dix-neuf');
  });

  it('counts 80–99 in twenties', () => {
    expect(frenchIntegerWords(80)).toBe('quatre-vingt');
    expect(frenchIntegerWords(81)).toBe('quatre-vingt-un');
    expect(frenchIntegerWords(90)).toBe('quatre-vingt-dix');
    expect(frenchIntegerWords(91)).toBe('quatre-vingt-onze');
    expect(frenchIntegerWords(96)).toBe('quatre-vingt-seize');
    expect(frenchIntegerWords(99)).toBe('quatre-vingt-dix-neuf');
  });

  it('says "cent" bare for one hundred and counts the rest', () => {
    expect(frenchIntegerWords(100)).toBe('cent');
    expect(frenchIntegerWords(101)).toBe('cent un');
    expect(frenchIntegerWords(200)).toBe('deux cent');
    expect(frenchIntegerWords(999)).toBe('neuf cent quatre-vingt-dix-neuf');
  });

  it('says "mille" bare for one thousand, but "un million" with the un', () => {
    expect(frenchIntegerWords(1000)).toBe('mille');
    expect(frenchIntegerWords(1001)).toBe('mille un');
    expect(frenchIntegerWords(2000)).toBe('deux mille');
    expect(frenchIntegerWords(1_000_000)).toBe('un million');
    expect(frenchIntegerWords(2_000_000)).toBe('deux millions');
  });

  it('joins the scales in order', () => {
    expect(frenchIntegerWords(1696)).toBe('mille six cent quatre-vingt-seize');
    expect(frenchIntegerWords(1_234_567)).toBe(
      'un million deux cent trente-quatre mille cinq cent soixante-sept',
    );
  });

  it('gives up above its range rather than printing something wrong', () => {
    expect(frenchIntegerWords(1_000_000_000)).toBe('');
  });
});

describe('frenchAmountInWords', () => {
  it('states the amount, the currency and the centimes once each', () => {
    // The live screen's own figure.
    expect(frenchAmountInWords(1696.19, 'Dollars Américain')).toBe(
      'Mille six cent quatre-vingt-seize Dollars Américain, dix-neuf centimes',
    );
  });

  it('names the zero rather than trailing off', () => {
    // A written amount that simply stops has room after it to be added to.
    expect(frenchAmountInWords(830, 'Dollars Américain')).toBe(
      'Huit cent trente Dollars Américain, zéro centime',
    );
  });

  it('singular centime for exactly one', () => {
    expect(frenchAmountInWords(5.01, 'Euros')).toBe('Cinq Euros, un centime');
    expect(frenchAmountInWords(5.02, 'Euros')).toBe('Cinq Euros, deux centimes');
  });

  it('keeps the centimes on a millions amount', () => {
    // main returned from its millions branch before appending them, so the
    // fifty centimes vanished from the words while staying in the figures.
    expect(frenchAmountInWords(1_000_000.5, 'Francs Congolais')).toBe(
      'Un million Francs Congolais, cinquante centimes',
    );
  });

  it('survives binary floating point', () => {
    // 1696.19 * 100 is 169618.99999999997 — truncating anywhere in that chain
    // turns nineteen centimes into eighteen.
    expect(frenchAmountInWords(1696.19, '')).toContain('dix-neuf centimes');
    expect(frenchAmountInWords(0.07, '')).toContain('sept centimes');
    expect(frenchAmountInWords(2.29, '')).toContain('vingt-neuf centimes');
  });

  it('carries a fraction that rounds up to a whole unit', () => {
    // 100 centimes is one franc, not "cent centimes".
    expect(frenchAmountInWords(4.999, 'Euros')).toBe('Cinq Euros, zéro centime');
  });

  it('writes zero', () => {
    expect(frenchAmountInWords(0, 'Euros')).toBe('Zéro Euros, zéro centime');
  });

  it('returns nothing above its range, so the caller can print figures alone', () => {
    expect(frenchAmountInWords(1_000_000_000, 'Euros')).toBe('');
  });
});
