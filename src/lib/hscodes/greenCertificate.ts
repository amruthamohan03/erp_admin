// §4.1 — which tariff lines need an environmental clearance (certificat vert).
//
// The rule is a list of HS-code PREFIXES an operator maintains, not a flag
// ticked one code at a time: "everything under 0301" is one decision, and
// setting it per code means the hundredth code added next year quietly misses
// it. An individual code can still override the rule in either direction,
// because real tariff lines have exceptions and the alternative is deleting a
// prefix that correctly covers ninety-nine others.
//
// Shared by the HS code list, its form and anything that later asks whether a
// declaration needs the certificate, so there is one answer to the question
// (§4.10).

/**
 * An HS code reduced to its digits.
 *
 * `0101.21.00`, `0101 21 00` and `01012100` are the same tariff line written
 * three ways — operators type all three, and a prefix entered as `0101` has to
 * match every one of them. Comparing the raw strings makes the rule depend on
 * punctuation nobody thinks of as part of the code.
 */
export function normaliseHsCode(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/gu, '');
}

/**
 * Whether `code` falls under any of `prefixes`.
 *
 * An empty or punctuation-only prefix matches NOTHING rather than everything.
 * A blank row in the master is somebody part-way through typing; reading it as
 * "all codes" would silently put the entire tariff under the certificate.
 */
export function matchingPrefix(
  code: string | null | undefined,
  prefixes: readonly string[],
): string | null {
  const digits = normaliseHsCode(code);
  if (digits === '') return null;

  for (const prefix of prefixes) {
    const p = normaliseHsCode(prefix);
    if (p !== '' && digits.startsWith(p)) return prefix;
  }
  return null;
}

/** Why a code ended up requiring the certificate — for the UI to explain itself. */
export type GreenCertificateSource = 'override' | 'prefix' | 'none';

export interface GreenCertificateVerdict {
  required: boolean;
  source: GreenCertificateSource;
  /** The prefix that decided it, when one did. */
  prefix: string | null;
}

/**
 * The effective answer for one code.
 *
 * `override` is deliberately tri-state and NULL is the common case:
 *   * `null`  — follow the prefix rules (what almost every code should be)
 *   * `true`  — always required, whatever the prefixes say
 *   * `false` — explicitly exempt, even though a prefix matches
 *
 * A two-state flag could not express the difference between "nobody has said"
 * and "somebody said no", which is exactly what an exemption is.
 */
export function greenCertificateFor(
  code: string | null | undefined,
  override: boolean | null | undefined,
  prefixes: readonly string[],
): GreenCertificateVerdict {
  if (override === true) return { required: true, source: 'override', prefix: null };
  if (override === false) return { required: false, source: 'override', prefix: null };

  const prefix = matchingPrefix(code, prefixes);
  return prefix === null
    ? { required: false, source: 'none', prefix: null }
    : { required: true, source: 'prefix', prefix };
}
