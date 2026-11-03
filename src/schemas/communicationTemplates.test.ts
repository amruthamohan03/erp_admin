import { describe, expect, it } from 'vitest';
import { communicationTemplateSchema, outboundLinkSchema, stageDraftQuerySchema } from './communicationTemplates';
import { escapeHtml, renderTemplate } from '@/lib/notificationTemplate';
import { summarizeZodError } from '@/lib/validation/messages';

const BASE = {
  template_key: 'import.cleared',
  name: 'Import cleared',
  page_slug: 'import',
  trigger: 'field_change',
  trigger_key: 'clearing_status',
  trigger_value: 'CLEARING COMPLETED',
  auto_email: true,
  auto_whatsapp: false,
  recipient: 'client',
  extra_to: '',
  cc: '',
  email_subject: 'File {mca_ref} cleared',
  email_body: '<p>Dear {client_name}</p>',
  whatsapp_body: 'Dear {client_code}',
  display: 'Y',
};

function messageOf(input: unknown): string {
  const r = communicationTemplateSchema.safeParse(input);
  if (r.success) return '';
  return summarizeZodError(r.error).message;
}

describe('communicationTemplateSchema', () => {
  it('accepts a field-change template', () => {
    const r = communicationTemplateSchema.parse(BASE);
    expect(r.trigger_key).toBe('clearing_status');
    expect(r.trigger_value).toBe('CLEARING COMPLETED');
  });

  it('needs the field a field-change template watches', () => {
    expect(messageOf({ ...BASE, trigger_key: '' })).toMatch(/Field: choose the field/u);
  });

  it('needs the event an event template listens for', () => {
    expect(messageOf({ ...BASE, trigger: 'event', trigger_key: '' })).toMatch(/Event: enter the system event key/u);
  });

  it('refuses automatic sending on a manual template', () => {
    expect(messageOf({ ...BASE, trigger: 'manual' })).toMatch(/manual template is never sent on its own/u);
  });

  it('clears a trigger key and value that do not apply', () => {
    const r = communicationTemplateSchema.parse({ ...BASE, trigger: 'create' });
    expect(r.trigger_key).toBe('');
    expect(r.trigger_value).toBe('');
  });

  it('names a bad fixed address', () => {
    expect(messageOf({ ...BASE, extra_to: 'ops@company.cd, not-an-email' })).toMatch(/Always send to:/u);
  });

  it('normalises the fixed address list', () => {
    expect(communicationTemplateSchema.parse({ ...BASE, cc: ' a@x.cd ;b@x.cd ' }).cc).toBe('a@x.cd, b@x.cd');
  });

  it('refuses a stage it cannot reach the client of', () => {
    expect(messageOf({ ...BASE, page_slug: 'payment' })).toMatch(/Stage: choose one of the listed stages/u);
  });

  it('strips script from the email body', () => {
    expect(communicationTemplateSchema.parse({ ...BASE, email_body: '<p>Hi</p><script>x()</script>' }).email_body).toBe('<p>Hi</p>');
  });

  it('needs an email body with text in it', () => {
    expect(messageOf({ ...BASE, email_body: '<p></p>' })).toMatch(/Email Body is required/u);
  });
});

describe('outboundLinkSchema', () => {
  it('accepts no link and a full link', () => {
    expect(outboundLinkSchema.parse({})).toEqual({});
    expect(outboundLinkSchema.parse({ entity_type: 'license', entity_id: '7' })).toEqual({ entity_type: 'license', entity_id: 7 });
  });

  it('refuses half a link', () => {
    expect(outboundLinkSchema.safeParse({ entity_type: 'license' }).success).toBe(false);
  });
});

describe('stageDraftQuerySchema', () => {
  it('coerces the id and checks the channel', () => {
    expect(stageDraftQuerySchema.parse({ slug: 'import', id: '3', channel: 'email' })).toEqual({ slug: 'import', id: 3, channel: 'email' });
    expect(stageDraftQuerySchema.safeParse({ slug: 'import', id: '3', channel: 'sms' }).success).toBe(false);
  });
});

describe('renderTemplate with escaping', () => {
  it('cannot be used to inject markup into an email body', () => {
    expect(renderTemplate('<p>{client_name}</p>', { client_name: '<b>A & B</b>' }, { escape: escapeHtml })).toBe(
      '<p>&lt;b&gt;A &amp; B&lt;/b&gt;</p>',
    );
  });

  it('leaves plain-text rendering untouched', () => {
    expect(renderTemplate('Dear {client_code}', { client_code: 'A&B' })).toBe('Dear A&B');
  });
});
