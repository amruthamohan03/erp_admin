import { describe, expect, it } from 'vitest';
import { htmlToText, htmlToWhatsApp, isBlankHtml, sanitizeHtml } from './richText';
import { attachmentError, MAX_ATTACHMENT_BYTES } from './attachments';
import { describeWhatsAppError } from './whatsapp';
import { describeSmtpError } from './email';
import { sendOutboundSchema, checkRecipient } from '@/schemas/outboundMessages';
import { summarizeZodError } from '@/lib/validation/messages';

describe('sanitizeHtml', () => {
  it('keeps the formatting the editor can produce', () => {
    expect(sanitizeHtml('<p><b>Hi</b> <i>there</i></p><ul><li>one</li></ul>')).toBe(
      '<p><b>Hi</b> <i>there</i></p><ul><li>one</li></ul>',
    );
  });

  it('drops scripts and styles with their contents', () => {
    expect(sanitizeHtml('a<script>alert(1)</script>b<style>p{}</style>c')).toBe('abc');
  });

  it('strips every attribute, event handlers included', () => {
    expect(sanitizeHtml('<p onclick="x()" style="color:red" class="k">t</p>')).toBe('<p>t</p>');
    expect(sanitizeHtml('<img src=x onerror=alert(1)>ok')).toBe('ok');
  });

  it('keeps only safe link targets', () => {
    expect(sanitizeHtml('<a href="https://x.com">x</a>')).toBe(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('escapes stray angle brackets and closes what was left open', () => {
    expect(sanitizeHtml('1 < 2 <b>bold')).toBe('1 &lt; 2 <b>bold</b>');
    expect(sanitizeHtml('</i>text')).toBe('text');
  });

  it('keeps existing entities but escapes a bare ampersand', () => {
    expect(sanitizeHtml('A &amp; B & C')).toBe('A &amp; B &amp; C');
  });
});

describe('htmlToText / htmlToWhatsApp', () => {
  const html = '<p>Dear <b>client</b>,</p><ul><li>First</li><li><i>Second</i></li></ul><p>See <a href="https://x.com">our site</a></p>';

  it('writes paragraphs, bullets and links as plain text', () => {
    expect(htmlToText(html)).toBe('Dear client,\n\n• First\n• Second\n\nSee our site (https://x.com)');
  });

  it('uses WhatsApp markup for emphasis', () => {
    expect(htmlToWhatsApp(html)).toBe('Dear *client*,\n\n• First\n• _Second_\n\nSee our site (https://x.com)');
  });

  it('moves spaces outside the markers, where WhatsApp needs them', () => {
    expect(htmlToWhatsApp('a<b> bold </b>b')).toBe('a *bold* b');
  });

  it('numbers an ordered list', () => {
    expect(htmlToText('<ol><li>a</li><li>b</li></ol>')).toBe('1. a\n2. b');
  });

  it('decodes entities and treats an empty editor as blank', () => {
    expect(htmlToText('<p>A &amp; B&nbsp;C</p>')).toBe('A & B C');
    expect(isBlankHtml('<p><br></p>')).toBe(true);
    expect(isBlankHtml('<ul><li></li></ul>')).toBe(true);
    expect(isBlankHtml('<p>x</p>')).toBe(false);
  });
});

describe('checkRecipient', () => {
  it('normalises an email and names a bad one', () => {
    expect(checkRecipient('email', ' Jean@Company.COM ')).toEqual({ value: 'Jean@company.com' });
    expect(checkRecipient('email', 'jean').error).toBe('To address "jean" is missing the "@" — it should look like name@company.com.');
  });

  it('requires a country code for WhatsApp', () => {
    expect(checkRecipient('whatsapp', '+243 812 345 678')).toEqual({ value: '+243812345678' });
    expect(checkRecipient('whatsapp', '0812345678').error).toBe(
      'To number "0812345678" needs its country code for WhatsApp (e.g. +243 812 345 678).',
    );
  });
});

describe('sendOutboundSchema', () => {
  const base = { channel: 'email', to: ['a@x.com'], subject: 'Hello', message: '<p>Hi</p>' };

  it('names each missing piece', () => {
    const r = sendOutboundSchema.safeParse({ channel: 'email', to: [], subject: '', message: '<p></p>' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const { fields } = summarizeZodError(r.error);
      expect(fields.to?.[0]).toBe('To: add at least one email address.');
      expect(fields.subject?.[0]).toBe('Subject is required for an email.');
      expect(fields.message?.[0]).toBe('Message is required — write the text to send.');
    }
  });

  it('de-duplicates and drops a Cc already in To', () => {
    const r = sendOutboundSchema.parse({ ...base, to: ['a@x.com', 'A@X.com'], cc: ['a@x.com', 'b@x.com'] });
    expect(r.to).toEqual(['a@x.com']);
    expect(r.cc).toEqual(['b@x.com']);
  });

  it('sanitises the body and builds the WhatsApp text with the subject in bold', () => {
    const r = sendOutboundSchema.parse({
      channel: 'whatsapp',
      to: ['+243812345678'],
      cc: ['ignored@x.com'],
      subject: 'Invoice',
      message: '<p>Due <b>today</b></p><script>x</script>',
    });
    expect(r.cc).toEqual([]);
    expect(r.body_html).toBe('<p>Due <b>today</b></p>');
    expect(r.body_text).toBe('*Invoice*\n\nDue *today*');
  });

  it('refuses a WhatsApp text past the 4096-character limit', () => {
    const r = sendOutboundSchema.safeParse({ channel: 'whatsapp', to: ['+243812345678'], message: `<p>${'x'.repeat(5000)}</p>` });
    expect(r.success).toBe(false);
  });
});

describe('attachmentError', () => {
  it('accepts ordinary documents', () => {
    expect(attachmentError([{ name: 'invoice.pdf', size: 1000 }])).toBeNull();
  });

  it('refuses programs, empty files and oversized ones, naming the file', () => {
    expect(attachmentError([{ name: 'setup.EXE', size: 10 }])).toContain('"setup.EXE" is a .exe file');
    expect(attachmentError([{ name: 'a.pdf', size: 0 }])).toContain('"a.pdf" is empty');
    expect(attachmentError([{ name: 'big.pdf', size: MAX_ATTACHMENT_BYTES + 1 }])).toContain('the limit is 10.0 MB per file');
  });
});

describe('provider error translation', () => {
  it('explains the WhatsApp 24-hour window', () => {
    expect(describeWhatsAppError(400, { error: { code: 131047 } })).toContain('last 24 hours');
  });

  it('names an expired WhatsApp token', () => {
    expect(describeWhatsAppError(401, { error: { code: 190 } })).toContain('WHATSAPP_ACCESS_TOKEN');
  });

  it('falls back to the provider detail with the HTTP status', () => {
    expect(describeWhatsAppError(400, { error: { code: 999, message: 'Odd' } })).toBe('WhatsApp refused the message (HTTP 400): Odd.');
  });

  it('names an SMTP sign-in failure', () => {
    expect(describeSmtpError({ code: 'EAUTH' })).toContain('SMTP_USER / SMTP_PASSWORD');
    expect(describeSmtpError({ responseCode: 552 })).toContain('too large');
  });
});
