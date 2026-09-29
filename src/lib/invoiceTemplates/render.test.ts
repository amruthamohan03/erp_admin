import { describe, expect, it } from 'vitest';
import { renderInvoice } from './render';
import { defaultAllHeadings, defaultHeadings } from '@/lib/invoiceGrid/columns';
import { SAMPLE_INVOICE } from './sample';
import { resolveOptions, TEMPLATE_DEFAULTS, type InvoiceTemplate } from './types';

const classic: InvoiceTemplate = { layout: 'classic', options: {} };
const modern: InvoiceTemplate = {
  layout: 'modern',
  options: { accentColor: '#7B3F9E', title: 'INVOICE' },
};

describe('resolveOptions', () => {
  it('fills every gap from the defaults', () => {
    expect(resolveOptions({}).footerText).toBe(TEMPLATE_DEFAULTS.footerText);
  });

  it('lets a configured value win', () => {
    expect(resolveOptions({ title: 'INVOICE' }).title).toBe('INVOICE');
  });

  it('does not let an explicit undefined erase a default', () => {
    // `{ ...defaults, ...{ title: undefined } }` would set title to undefined,
    // and the document would print with no title at all.
    expect(resolveOptions({ title: undefined }).title).toBe(TEMPLATE_DEFAULTS.title);
  });

  it('keeps a deliberate false rather than reading it as absent', () => {
    expect(resolveOptions({ showSignature: false }).showSignature).toBe(false);
  });
});

describe('renderInvoice — §6, borders on every PDF table', () => {
  for (const [name, template] of [
    ['classic', classic],
    ['modern', modern],
  ] as const) {
    it(`${name} collapses borders and borders every cell`, () => {
      const html = renderInvoice(SAMPLE_INVOICE, template);
      expect(html).toContain('border-collapse:collapse');
      expect(html).toMatch(/th,td\{border:1px solid/u);
    });

    it(`${name} restates borders under @media print, so they survive the PDF step`, () => {
      const html = renderInvoice(SAMPLE_INVOICE, template);
      const printBlock = html.slice(html.indexOf('@media print{'));
      expect(printBlock).toContain('table,th,td{border:1px solid #000 !important;}');
    });

    it(`${name} keeps colours through the print step`, () => {
      const html = renderInvoice(SAMPLE_INVOICE, template);
      expect(html).toContain('print-color-adjust:exact');
    });
  }
});

describe('renderInvoice — content', () => {
  it('prints the reference and the client', () => {
    const html = renderInvoice(SAMPLE_INVOICE, classic);
    expect(html).toContain('2026-NMI-0042');
    expect(html).toContain('Compagnie Minière de Katanga SARL');
  });

  it('renders dates as DD-MM-YYYY (§4.19)', () => {
    const html = renderInvoice(SAMPLE_INVOICE, classic);
    expect(html).toContain('14-09-2026');
    expect(html).not.toContain('2026-09-14<');
  });

  it('escapes operator text rather than letting it become markup', () => {
    const html = renderInvoice(
      { ...SAMPLE_INVOICE, client_name: '<script>alert(1)</script>' },
      classic,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a configured option too — it is typed by an operator', () => {
    const html = renderInvoice(SAMPLE_INVOICE, {
      layout: 'modern',
      options: { footerText: '<img onerror=x>' },
    });
    expect(html).not.toContain('<img onerror=x>');
  });

  it('uses the configured accent colour', () => {
    expect(renderInvoice(SAMPLE_INVOICE, modern)).toContain('#7B3F9E');
  });

  it('honours a hidden block', () => {
    const shown = renderInvoice(SAMPLE_INVOICE, classic);
    const hidden = renderInvoice(SAMPLE_INVOICE, {
      layout: 'classic',
      options: { showCifPanel: false },
    });
    expect(shown).toContain('CIF/USD');
    expect(hidden).not.toContain('CIF/USD');
  });

  it('shows the NOT VALID wash only on an unvalidated invoice', () => {
    expect(renderInvoice({ ...SAMPLE_INVOICE, validated: 0 }, classic)).toContain('NOT VALID');
    expect(renderInvoice({ ...SAMPLE_INVOICE, validated: 1 }, classic)).not.toContain(
      '>NOT VALID<',
    );
  });

  it('suppresses the wash when the template turns it off', () => {
    const html = renderInvoice(
      { ...SAMPLE_INVOICE, validated: 0 },
      { layout: 'classic', options: { showWatermark: false } },
    );
    expect(html).not.toContain('class="wm"');
  });

  it('omits the print button unless the caller asks for it', () => {
    expect(renderInvoice(SAMPLE_INVOICE, classic)).not.toContain('window.print()');
    expect(renderInvoice(SAMPLE_INVOICE, classic, { interactive: true })).toContain(
      'window.print()',
    );
  });

  it('totals USD lines and the USD equivalent of CDF lines together', () => {
    // The sample's three USD lines sub-total 5,070.00 and the CDF line is
    // carried as its own usd equivalent, which the sample leaves at 0 — so the
    // printed sub-total is the USD lines alone.
    expect(renderInvoice(SAMPLE_INVOICE, classic)).toContain('5,070.00');
  });

  it('draws an invoice with no lines rather than failing', () => {
    const html = renderInvoice({ ...SAMPLE_INVOICE, lines: [] }, modern);
    expect(html).toContain('No items on this invoice.');
  });

  it('picks readable text for a pale accent and for a dark one', () => {
    const pale = renderInvoice(SAMPLE_INVOICE, {
      layout: 'modern',
      options: { accentColor: '#F5F5F5' },
    });
    const dark = renderInvoice(SAMPLE_INVOICE, {
      layout: 'modern',
      options: { accentColor: '#101010' },
    });
    // A pale header takes near-black text; a dark one takes white.
    expect(pale).toMatch(/background:#F5F5F5;color:#111111/u);
    expect(dark).toMatch(/background:#101010;color:#ffffff/u);
  });

  it('uses the built-in column headings when none are configured', () => {
    const html = renderInvoice(SAMPLE_INVOICE, classic);
    expect(html).toContain('Taux/USD');
    expect(html).toContain('Rate/CDF');
  });

  it('uses the configured column headings, so the PDF matches the grid', () => {
    // The defect this prevents: an operator renames a column on screen and the
    // client reads the old label on the document (§4.10).
    const html = renderInvoice(
      {
        ...SAMPLE_INVOICE,
        headings: {
          ...defaultAllHeadings(),
          'import-usd': { ...defaultHeadings('import-usd'), taux_usd: 'Tarif Unitaire' },
          'import-cdf': { ...defaultHeadings('import-cdf'), rate_cdf: 'Taux en CDF' },
        },
      },
      classic,
    );
    expect(html).toContain('Tarif Unitaire');
    expect(html).toContain('Taux en CDF');
    expect(html).not.toContain('>Taux/USD<');
    expect(html).not.toContain('>Rate/CDF<');
  });

  it('applies configured headings in the modern layout too', () => {
    const html = renderInvoice(
      {
        ...SAMPLE_INVOICE,
        headings: {
          ...defaultAllHeadings(),
          'import-usd': { ...defaultHeadings('import-usd'), description: 'Libellé' },
        },
      },
      modern,
    );
    expect(html).toContain('Libellé');
  });

  it('escapes a heading — it is operator-typed text', () => {
    const html = renderInvoice(
      {
        ...SAMPLE_INVOICE,
        headings: {
          ...defaultAllHeadings(),
          'import-usd': { ...defaultHeadings('import-usd'), taux_usd: '<b>x</b>' },
        },
      },
      classic,
    );
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('applies the configured page size', () => {
    const html = renderInvoice(SAMPLE_INVOICE, {
      layout: 'classic',
      options: { pageSize: 'Letter' },
    });
    expect(html).toContain('size:Letter');
  });
});
