import { describe, expect, it } from 'vitest';
import {
  audienceSchema,
  bulkContentSchema,
  bulkSendSchema,
  contactAddresses,
  sendOutboundSchema,
  type ClientContacts,
} from './outboundMessages';

const contacts = (over: Partial<ClientContacts> = {}): ClientContacts => ({
  email: null,
  email_secondary: null,
  payment_email: null,
  phone: null,
  phone_secondary: null,
  payment_phone: null,
  ...over,
});

const firstMessage = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }): string | undefined =>
  r.error?.issues[0]?.message;

describe('audienceSchema', () => {
  it('refuses a send with no condition, so it cannot go to every client', () => {
    const r = audienceSchema.safeParse({ module: 'import' });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toMatch(/at least one condition/u);
  });

  it('accepts a single condition and fills the rest with empties', () => {
    const r = audienceSchema.safeParse({ module: 'export', clearing_status_ids: ['2', 3] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.clearing_status_ids).toEqual([2, 3]);
      expect(r.data.stages).toEqual([]);
      expect(r.data.invoicing_hold).toBe(false);
    }
  });

  it('counts invoicing hold, delay and pre-alert as conditions', () => {
    expect(audienceSchema.safeParse({ module: 'import', invoicing_hold: true }).success).toBe(true);
    expect(audienceSchema.safeParse({ module: 'import', delay: ['overdue'] }).success).toBe(true);
    expect(audienceSchema.safeParse({ module: 'import', pre_alert: 'missing' }).success).toBe(true);
  });

  it('refuses a pre-alert condition on export files', () => {
    const r = audienceSchema.safeParse({ module: 'export', pre_alert: 'received' });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toMatch(/Import Tracking only/u);
  });

  it('refuses pre-alert dates with "pre-alert missing"', () => {
    const r = audienceSchema.safeParse({ module: 'import', pre_alert: 'missing', pre_alert_from: '2026-01-01' });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toMatch(/cannot be combined/u);
  });

  it('refuses a reversed pre-alert range', () => {
    const r = audienceSchema.safeParse({ module: 'import', pre_alert_from: '2026-05-02', pre_alert_to: '2026-05-01' });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toMatch(/on or after/u);
  });

  it('treats blank date inputs as no date', () => {
    const r = audienceSchema.safeParse({ module: 'import', stages: ['crf_missing'], pre_alert_from: '', pre_alert_to: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.pre_alert_from).toBeUndefined();
  });
});

describe('bulkSendSchema', () => {
  const audience = { module: 'import', stages: ['crf_missing'] };

  it('needs at least one contact kind', () => {
    const r = bulkSendSchema.safeParse({ audience, contacts: [], client_ids: [1] });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toMatch(/at least one contact/u);
  });

  it('needs at least one client', () => {
    const r = bulkSendSchema.safeParse({ audience, contacts: ['main'], client_ids: [] });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toMatch(/at least one client/u);
  });
});

describe('bulkContentSchema', () => {
  it('applies the same subject rule as a single message', () => {
    const bulk = bulkContentSchema.safeParse({ channel: 'email', subject: '', message: '<p>Hi</p>' });
    const single = sendOutboundSchema.safeParse({ channel: 'email', to: ['a@b.com'], subject: '', message: '<p>Hi</p>' });
    expect(firstMessage(bulk)).toBe('Subject is required for an email.');
    expect(firstMessage(single)).toBe('Subject is required for an email.');
  });

  it('renders the WhatsApp text with the subject in bold', () => {
    const r = bulkContentSchema.parse({ channel: 'whatsapp', subject: 'Update', message: '<p>Your file moved.</p>' });
    expect(r.body_text.startsWith('*Update*')).toBe(true);
  });
});

describe('contactAddresses', () => {
  it('takes only the chosen kinds, de-duplicated', () => {
    const c = contacts({ email: 'Ops@Client.com', email_secondary: 'ops@client.com', payment_email: 'pay@client.com' });
    expect(contactAddresses(c, 'email', ['main', 'secondary']).valid).toEqual(['Ops@client.com']);
    expect(contactAddresses(c, 'email', ['payment']).valid).toEqual(['pay@client.com']);
  });

  it('reports a WhatsApp number without a country code instead of dialling it', () => {
    const r = contactAddresses(contacts({ phone: '0812345678' }), 'whatsapp', ['main']);
    expect(r.valid).toEqual([]);
    expect(r.invalid[0]?.error).toMatch(/country code/u);
  });

  it('skips blank contacts silently', () => {
    expect(contactAddresses(contacts({ phone: '  ' }), 'whatsapp', ['main'])).toEqual({ valid: [], invalid: [] });
  });
});
