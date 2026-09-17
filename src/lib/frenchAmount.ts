// An amount written out in French words, for the DEMANDE DE FONDS print
// document's "Montant en lettre" line (§2 step 6).
//
// A payment authorisation states its amount twice — in figures and in words —
// because the words cannot be altered by adding a digit. That makes this a
// correctness-critical conversion, not a cosmetic one, which is why it lives
// here as a pure function with its own tests rather than inside the HTML
// builder.
//
// Ported from main's `numberToFrenchWords`, with two defects fixed; both are
// called out where they occur, because the words this prints have to be
// defensible against a document produced by the other system.

const ONES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const TEENS = [
  'dix', 'onze', 'douze', 'treize', 'quatorze',
  'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const TENS = [
  '', 'dix', 'vingt', 'trente', 'quarante',
  'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix',
];

/**
 * 0–999 in words.
 *
 * French counts 70–79 and 90–99 as sixty-ten and four-twenty-ten, so those two
 * decades borrow the previous ten's word and take a TEEN as their unit:
 * 71 is "soixante-onze", not "septante-un". That is the whole reason this
 * cannot be a straight digit-by-digit lookup.
 */
function under1000(n: number): string {
  if (n === 0) return '';
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];

  if (n < 100) {
    const ten = Math.floor(n / 10);
    const one = n % 10;
    if (ten === 7 || ten === 9) {
      // 70 → "soixante-dix", 71 → "soixante-onze", 90 → "quatre-vingt-dix".
      return `${TENS[ten - 1]}-${one > 0 ? TEENS[one] : 'dix'}`;
    }
    return TENS[ten] + (one > 0 ? `-${ONES[one]}` : '');
  }

  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundred > 1 ? `${ONES[hundred]} cent` : 'cent';
  return rest > 0 ? `${head} ${under1000(rest)}` : head;
}

/** The largest amount this writes out. Above it the caller gets the figures only. */
const MAX = 999_999_999;

/**
 * A whole number in words, up to 999,999,999.
 *
 * Main built this with a recursive call whose result it then split on the
 * string " centime" to strip the decimals back off. That worked but meant the
 * millions branch silently dropped the centimes entirely — see
 * `frenchAmountInWords`. Splitting the scales apart here removes the need for
 * the recursion and the string surgery both.
 */
export function frenchIntegerWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (!Number.isFinite(n) || n === 0) return 'zéro';
  if (n > MAX) return '';

  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const thousands = Math.floor(rest / 1000);
  const units = rest % 1000;

  const parts: string[] = [];
  // "un million" but "deux millions" — the scale word pluralises, and "un"
  // is said before it where it is NOT said before "mille".
  if (millions > 0) parts.push(`${under1000(millions)} million${millions > 1 ? 's' : ''}`);
  if (thousands > 0) parts.push(thousands === 1 ? 'mille' : `${under1000(thousands)} mille`);
  if (units > 0) parts.push(under1000(units));

  return parts.join(' ');
}

/**
 * The full "Montant en lettre" phrase: the amount, its currency, and the
 * centimes, capitalised as the document prints it.
 *
 *   frenchAmountInWords(1696.19, 'Dollars Américain')
 *     → 'Mille six cent quatre-vingt-seize Dollars Américain, dix-neuf centimes'
 *
 * Two fixes over main, both of which lose or corrupt information on a document
 * that authorises a payment:
 *
 *   1. **The centimes survive a millions amount.** Main's millions branch
 *      returned before appending them, so 1,000,000.50 printed as "un million"
 *      and the fifty centimes vanished from the written amount while remaining
 *      in the figures — exactly the disagreement writing it twice exists to
 *      catch.
 *   2. **The centimes are stated ONCE.** Main's template appended a literal
 *      ", zéro centime" after a string that had often already stated the real
 *      centimes, so 1696.19 read "…quatre-vingt-seize, dix-neuf centimes
 *      Dollars Américain, zéro centime".
 *
 * "zéro centime" is still printed for a whole amount, deliberately: a written
 * amount that simply stops has room after it for someone to add to, and naming
 * the zero closes it.
 */
export function frenchAmountInWords(amount: number, currencyName: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';

  const whole = Math.floor(Math.abs(value));
  if (whole > MAX) return ''; // the caller prints the figures alone rather than a wrong phrase

  // Rounded, not truncated, and off the fractional part rather than the whole
  // number: `1696.19 * 100` is 169618.99999999997 in binary floating point, so
  // truncating anywhere in that chain turns 19 centimes into 18.
  const centimes = Math.round((Math.abs(value) - whole) * 100);
  // A fraction of 0.999 rounds to 100 centimes, which is a franc, not a hundred
  // centimes — carry it rather than print "cent centimes".
  const carried = centimes === 100;
  const words = frenchIntegerWords(carried ? whole + 1 : whole);
  const cents = carried ? 0 : centimes;

  const head = `${words}${currencyName ? ` ${currencyName}` : ''}`;
  const tail = cents > 0
    ? `${under1000(cents)} centime${cents > 1 ? 's' : ''}`
    : 'zéro centime';

  const phrase = `${head}, ${tail}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
