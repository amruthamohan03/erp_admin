import type { InvoiceDoc } from './types';

// The invoice the master's preview draws.
//
// Realistic on purpose: a long commodity description, a customs category that
// renders in CDF, and figures with thousands separators. A preview built from
// three short lines tells an operator nothing about whether their template
// survives real data (§4.36's lesson — every layout defect was invisible until
// a real record arrived, because seed data is short).
//
// `validated: 1` so the preview shows the signature block and no NOT VALID
// wash; that is the state a template is designed to look right in.

export const SAMPLE_INVOICE: InvoiceDoc = {
  company_name: 'Your Company',
  invoice_ref: '2026-NMI-0042',
  created_at: '2026-09-14',
  validated: 1,
  client_name: 'Compagnie Minière de Katanga SARL',
  address: 'châtelet 44, Avenue Lumumba, Lubumbashi, Haut-Katanga, DRC',
  rccm_number: '13-B-4417',
  nif_number: 'A 1904772 P',
  id_nat_number: '01-83-N40125K',
  transport_mode_name: 'Road',
  produit: 'PHOTOVOLTAIC INVERTER, POWER DISTRIBUTION BOARD, CABLE ACCESSORIES',
  license_number: 'NMI-ID-CO-R',
  declaration_no: 'IM4 2026 / 118342',
  declaration_date: '2026-08-30',
  liquidation_no: 'LQ-2026-55710',
  liquidation_date: '2026-09-02',
  quittance_no: 'QT-2026-99104',
  quittance_date: '2026-09-05',
  payment_method: 'CREDIT',
  poids_kg: 24680.5,
  cif_usd: 184320.75,
  cif_cdf: 516097950,
  rate_bcc: 2795.4,
  rate_inv: 2800,
  signature_image: null,
  operator_name: 'A. Mohan',
  cdf_category_ids: [2],
  lines: [
    {
      category_id: 1,
      category_header: 'Honoraires',
      item_name: 'Clearing and forwarding fee',
      unit: 'File',
      quantity: 1,
      taux_usd: 1850,
      subtotal_usd: 1850,
      tva_usd: 296,
      total_usd: 2146,
      rate_cdf: 0,
      vat_cdf: 0,
      total_cdf: 0,
    },
    {
      category_id: 1,
      category_header: 'Honoraires',
      item_name: 'Transport Lubumbashi – Kolwezi (per truck)',
      unit: 'Truck',
      quantity: 4,
      taux_usd: 720,
      subtotal_usd: 2880,
      tva_usd: 460.8,
      total_usd: 3340.8,
      rate_cdf: 0,
      vat_cdf: 0,
      total_cdf: 0,
    },
    {
      category_id: 1,
      category_header: 'Honoraires',
      item_name: 'Documentation and handling',
      unit: 'File',
      quantity: 1,
      taux_usd: 340,
      subtotal_usd: 340,
      tva_usd: 54.4,
      total_usd: 394.4,
      rate_cdf: 0,
      vat_cdf: 0,
      total_cdf: 0,
    },
    {
      category_id: 2,
      category_header: 'Débours Douane',
      item_name: 'Droits de douane à l’importation',
      unit: 'Lot',
      quantity: 1,
      taux_usd: 0,
      subtotal_usd: 0,
      tva_usd: 0,
      total_usd: 0,
      rate_cdf: 41287836,
      vat_cdf: 6606053.76,
      total_cdf: 47893889.76,
    },
  ],
};
