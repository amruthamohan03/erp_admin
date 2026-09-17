// The Payment Request list's default reporting period.
//
// Its own module, and that placement is load-bearing rather than tidiness. The
// browser needs this function — the filter panel opens on the range it returns —
// and it previously lived in `schemas/payments.ts`, so the list page imported it
// from the `@/schemas` barrel. That barrel re-exports `bulk-update`, which
// reaches `recordAudit` and then `next/headers`, and pulling a server-only API
// into a client component is a build error, not a runtime one. A pure leaf
// module has nothing behind it to drag along.

/**
 * 1 January of the current year → today, both bounds inclusive.
 *
 * Not an arbitrary window: a payment request is raised and settled within a
 * financial year, so "this year so far" is the view somebody opening the screen
 * is looking for. An unbounded list, by contrast, gets slower every year while
 * showing more rows nobody asked for. Main opens on the same range.
 *
 * Computed per call, never cached at module load — a server process alive over
 * New Year would otherwise keep handing out last year's default until it was
 * restarted, which is the kind of fault that appears once and is never
 * reproduced.
 *
 * ISO `YYYY-MM-DD`, because that is what Postgres, Zod and `<input type="date">`
 * all take; `DD-MM-YYYY` is for reading (§4.19). Read from the LOCAL calendar,
 * so a client component must not call it during render — see the list page's
 * `mounted` gate.
 */
export function defaultPaymentDateRange(): { from: string; to: string } {
  const now = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return {
    from: `${now.getFullYear()}-01-01`,
    to: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
  };
}

export default defaultPaymentDateRange;
