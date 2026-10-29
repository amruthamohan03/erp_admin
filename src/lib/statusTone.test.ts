import { describe, expect, it } from 'vitest';
import { displayLabel, statusTone } from './statusTone';

describe('statusTone', () => {
  it.each([
    // the clearing statuses as seeded
    ['IN TRANSIT', 'sky'],
    ['IN PROGRESS', 'sky'],
    ['CLEARING COMPLETED', 'emerald'],
    ['CANCELLED', 'rose'],
    ['CLEARED WITH IR', 'emerald'],
    // licence statuses
    ['ACTIVE', 'emerald'],
    ['INACTIVE', 'slate'],
    ['EXPIRED', 'rose'],
    ['ANNULATED', 'rose'],
    ['MODIFIED', 'amber'],
    ['PROROGATED', 'cyan'],
    // seals, payments, invoices, workflow states
    ['Available', 'emerald'],
    ['Used', 'violet'],
    ['Damaged', 'rose'],
    ['Pending Finance', 'amber'],
    ['Under Process', 'sky'],
    ['Paid', 'emerald'],
    ['Rejected', 'rose'],
    ['draft', 'slate'],
    ['submitted', 'sky'],
    ['Disabled', 'slate'],
  ] as const)('%s → %s', (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });

  it('reads "to be …" as waiting, not as the thing it is waiting for', () => {
    expect(statusTone('CRF/AD/INSURANCE TO BE VALIDATED')).toBe('amber');
    expect(statusTone('SEGUCE TO BE PAID')).toBe('amber');
    expect(statusTone('NOT VALIDATED')).toBe('amber');
  });

  it('matches whole words only', () => {
    expect(statusTone('UNPAID')).toBe('amber');
    expect(statusTone('INACTIVE')).toBe('slate');
  });

  // The Licence dashboard's expiry bands. A licence about to lapse is
  // waiting on somebody to renew it, not stopped — so it is amber, and only
  // the one that already lapsed is red.
  it('reads the expiry bands', () => {
    expect(statusTone('Valid')).toBe('emerald');
    expect(statusTone('Expiring in 7 Days')).toBe('amber');
    expect(statusTone('Expiring in 30 Days')).toBe('amber');
    expect(statusTone('Expired')).toBe('rose');
    expect(statusTone('No Expiry Date')).toBe('slate');
  });

  // Communication → Email & WhatsApp send outcomes.
  it('reads the outbound message statuses', () => {
    expect(statusTone('Sending')).toBe('sky');
    expect(statusTone('Sent')).toBe('sky');
    expect(statusTone('Partial')).toBe('amber');
    expect(statusTone('Failed')).toBe('rose');
  });

  it('is neutral for text it does not know, and for nothing', () => {
    expect(statusTone('TRUCK AT KASUMBALESA')).toBe('slate');
    expect(statusTone('')).toBe('slate');
    expect(statusTone(null)).toBe('slate');
  });

  it('treats underscores and hyphens as spaces', () => {
    expect(statusTone('in_progress')).toBe('sky');
    expect(statusTone('on-hold')).toBe('amber');
  });
});

describe('displayLabel', () => {
  it('names the flag', () => {
    expect(displayLabel('Y')).toBe('Active');
    expect(displayLabel('N')).toBe('Disabled');
  });
});
