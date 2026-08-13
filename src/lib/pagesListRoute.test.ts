import { describe, it, expect } from 'vitest';
import { parentListRoute } from './pages/listRoute';

// Every transaction page in the app, both entry points. These are the real
// paths (verified against src/app/(app)) — if a page moves and this table is not
// updated, the redirect after save is what breaks, so pin them.
const TRANSACTION_PAGES: Array<[slug: string, base: string]> = [
  ['clients', '/masters/clients'],
  ['license', '/licenses'],
  ['import', '/imports'],
  ['export', '/exports'],
  ['local', '/local'],
  ['payment', '/payments'],
  ['export-invoices', '/export-invoices'],
  ['import-invoices', '/import-invoices'],
];

describe('parentListRoute', () => {
  it.each(TRANSACTION_PAGES)('resolves the list for %s from its create page', (_slug, base) => {
    expect(parentListRoute(`${base}/new`)).toBe(base);
  });

  it.each(TRANSACTION_PAGES)('resolves the list for %s from an edit page', (_slug, base) => {
    expect(parentListRoute(`${base}/42`)).toBe(base);
  });

  it('tolerates a trailing slash', () => {
    expect(parentListRoute('/masters/clients/new/')).toBe('/masters/clients');
  });

  // The bug this replaced: master_page_t.route said '/clients', which has no page
  // behind it. The derived parent is right whatever that column happens to hold.
  it('ignores a fallback that disagrees with the URL', () => {
    expect(parentListRoute('/masters/clients/new', '/clients')).toBe('/masters/clients');
  });

  it('falls back only when there is no parent segment', () => {
    expect(parentListRoute('/new', '/payments')).toBe('/payments');
    expect(parentListRoute('/', '/payments')).toBe('/payments');
    expect(parentListRoute('', '/payments')).toBe('/payments');
    expect(parentListRoute(null)).toBe('/dashboard');
    expect(parentListRoute(undefined)).toBe('/dashboard');
  });

  it('never returns an empty string', () => {
    expect(parentListRoute('/new')).toBe('/dashboard');
    expect(parentListRoute('/new', '')).toBe('/dashboard');
  });
});
