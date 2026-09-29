import { z } from 'zod';
import type { AllGridHeadings } from '@/lib/invoiceGrid/columns';

// §4.1 — what an invoice PDF looks like is configuration, not a source file.
//
// The shape follows §4.33's rule for reference formats: config names a VETTED
// layout, never arbitrary code. A master row picks one of the layouts below and
// carries the options that layout reads. An operator can therefore add a third
// house style — same layout, different colour and footer — with a row, and can
// never produce an invoice the renderer cannot draw.
//
// `render.ts` turns one of these plus an `InvoiceDoc` into HTML, and is the ONE
// renderer: the master's live preview and the real facture both call it, so what
// an operator approves on screen is what the client receives (§4.10).

/** The layouts the renderer can draw. A closed set — see the module comment. */
export const LAYOUT_KEYS = ['classic', 'modern'] as const;
export type LayoutKey = (typeof LAYOUT_KEYS)[number];

export const LAYOUTS: { key: LayoutKey; name: string; description: string }[] = [
  {
    key: 'classic',
    name: 'Classic Facture',
    description:
      'The bordered DRC facture — boxed client and document panels, black category bars, totals bottom-right.',
  },
  {
    key: 'modern',
    name: 'Modern Coloured',
    description:
      'Accent header bar with logo and tagline, tinted table headers and rows, terms and payment blocks, coloured contact strip at the foot.',
  },
];

/**
 * A 6-digit hex colour.
 *
 * Named explicitly so the message says what to type (§4.23) — the Zod default
 * would be "Invalid", which on a colour field tells an operator nothing.
 */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 6-digit hex colour (e.g. #7B3F9E)');

/**
 * Everything a template can change without changing the layout.
 *
 * Every key is optional and every one has a default, so a row saved before an
 * option existed keeps rendering — a half-configured template must never stop
 * an invoice printing (§4.33's fallback rule).
 */
export const templateOptionsSchema = z.object({
  /** The big word at the top — 'FACTURE' or 'INVOICE'. */
  title: z.string().max(40, 'The title must be 40 characters or fewer.').optional(),
  /** Under the logo, e.g. 'Customs Clearance & Logistics'. */
  tagline: z.string().max(80, 'The tagline must be 80 characters or fewer.').optional(),
  accentColor: hexColor.optional(),
  /** The letterhead address block. Was hardcoded in the builder until 0126. */
  companyAddress: z.string().max(300, 'The address must be 300 characters or fewer.').optional(),
  termsText: z.string().max(600, 'Terms must be 600 characters or fewer.').optional(),
  footerText: z.string().max(200, 'The footer must be 200 characters or fewer.').optional(),
  /** The coloured strip at the foot of the modern layout. */
  contactLine: z.string().max(200, 'The contact line must be 200 characters or fewer.').optional(),
  showSignature: z.boolean().optional(),
  showCifPanel: z.boolean().optional(),
  showCategoryHeaders: z.boolean().optional(),
  showPaymentInfo: z.boolean().optional(),
  /** The diagonal NOT VALID wash on an unvalidated invoice. */
  showWatermark: z.boolean().optional(),
  pageSize: z.enum(['A4', 'Letter']).optional(),
});

export type TemplateOptions = z.infer<typeof templateOptionsSchema>;

export interface InvoiceTemplate {
  layout: LayoutKey;
  options: TemplateOptions;
}

/**
 * What a template falls back to.
 *
 * Reproduces exactly what the hardcoded builder produced before 0126, so an
 * invoice whose template row is missing, deactivated or unrecognised prints the
 * same document it always did rather than failing or printing something new.
 */
export const TEMPLATE_DEFAULTS: Required<
  Omit<TemplateOptions, 'tagline' | 'termsText' | 'contactLine'>
> &
  Pick<TemplateOptions, 'tagline' | 'termsText' | 'contactLine'> = {
  title: 'FACTURE',
  tagline: undefined,
  accentColor: '#111111',
  companyAddress:
    'No. 1068, Avenue Ruwe, Quartier Makutano,\nLubumbashi, DRC\nRCCM: 13-B-1122 · NIF: A 1309334 L',
  termsText: undefined,
  footerText: 'Thank you for your business!',
  contactLine: undefined,
  showSignature: true,
  showCifPanel: true,
  showCategoryHeaders: true,
  showPaymentInfo: true,
  showWatermark: true,
  pageSize: 'A4',
};

export const DEFAULT_TEMPLATE: InvoiceTemplate = { layout: 'classic', options: {} };

/** A template's options with every gap filled — what the renderer actually reads. */
export function resolveOptions(options: TemplateOptions): typeof TEMPLATE_DEFAULTS {
  return { ...TEMPLATE_DEFAULTS, ...stripUndefined(options) };
}

/** `{ a: undefined }` must not override a default; a spread would let it. */
function stripUndefined(o: TemplateOptions): TemplateOptions {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as TemplateOptions;
}

export function isLayoutKey(v: unknown): v is LayoutKey {
  return typeof v === 'string' && (LAYOUT_KEYS as readonly string[]).includes(v);
}

// ── What the renderer is given ─────────────────────────────────────────────
//
// Deliberately a plain data shape with no DB types in it, so the preview can
// hand it sample rows and the print route can hand it real ones through the
// same function.

export interface InvoiceLine {
  category_id: number;
  category_header: string;
  item_name: string;
  unit: string;
  quantity: number;
  taux_usd: number;
  subtotal_usd: number;
  tva_usd: number;
  total_usd: number;
  rate_cdf: number;
  vat_cdf: number;
  total_cdf: number;
}

export interface InvoiceDoc {
  company_name: string;
  invoice_ref: string;
  created_at: string | null;
  /** 0 = not validated, 1 = validated, 2 = DGI verified. */
  validated: number;
  client_name: string;
  address: string;
  rccm_number: string;
  nif_number: string;
  id_nat_number: string;
  transport_mode_name: string;
  produit: string;
  license_number: string;
  declaration_no: string;
  declaration_date: string | null;
  liquidation_no: string;
  liquidation_date: string | null;
  quittance_no: string;
  quittance_date: string | null;
  payment_method: string;
  poids_kg: number;
  cif_usd: number;
  cif_cdf: number;
  rate_bcc: number;
  rate_inv: number;
  /** Data URL or served path; omitted when the operator has no signature. */
  signature_image: string | null;
  operator_name: string;
  /** Customs categories render in CDF; everything else in USD. */
  cdf_category_ids: number[];
  lines: InvoiceLine[];
  /**
   * Column headings, from `invoice_grid_heading_master_t` (§4.1).
   *
   * Carried on the document rather than read inside the renderer so the
   * renderer stays pure and the preview can hand it whatever it wants. The
   * printed facture and the editable grid resolve through the same master, so
   * renaming a column renames it in both — otherwise the operator sees
   * "Taux/USD" on screen and the client reads something else.
   *
   * Optional: a caller with no headings gets the built-ins.
   */
  headings?: AllGridHeadings;
}
