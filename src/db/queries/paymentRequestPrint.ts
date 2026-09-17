// §2 step 6 — the printable DEMANDE DE FONDS: the paper a payment request
// becomes once it is authorised, carrying the signatures that release the money.
//
// Self-contained HTML the browser opens and saves as PDF; no PDF library is
// installed (§3 — adding one needs asking first), which is the same approach the
// invoice print builders take.
//
// Two pages, matching main:
//   1. the authorisation — amount in figures AND in words, motif, and the three
//      approval signatures with their timestamps;
//   2. the reference detail — one line per MCA reference, with the total.
//
// Page 2 is omitted when the request carries no references, rather than printing
// an empty table under a heading that promises one.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { frenchAmountInWords } from '@/lib/frenchAmount';
import { PAY_FOR_LABELS } from '@/lib/payments/stages';
import { loadBranding } from './branding';

const esc = (v: unknown): string =>
  String(v ?? '').replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] as string,
  );

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The French money format: a space every three digits, a comma before the
 * decimals — `1 696,19`.
 *
 * Deliberately NOT `toLocaleString('fr-FR')`: that follows the SERVER's ICU
 * data, which differs between machines and containers, so the same request
 * would print differently depending on where it was rendered. The same reason
 * §4.19 forbids `toLocaleDateString` for dates.
 */
function moneyFr(value: unknown): string {
  const [whole, decimals] = num(value).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ' ')},${decimals}`;
}

/** §4.19 — every date a person reads, and a printed document leaves the office. */
const day = (v: unknown): string => formatDate(v, '');
const stamp = (v: unknown): string => formatDateTime(v, '');

interface McaLine {
  mca_ref?: string;
  amount?: number;
}

/**
 * One authorisation cell: the stage, and who signed it when.
 *
 * An unsigned stage prints its box EMPTY rather than "Pending", because this is
 * a signature block on paper — a blank is where a wet signature goes, and the
 * word "Pending" printed in it would make an authorised document look like a
 * draft.
 */
function authCell(label: string, approved: unknown, name: unknown, at: unknown): string {
  const signed = Number(approved) === 1;
  return `<td><strong>${esc(label)}</strong><br><br>${
    signed
      ? `<div class="auth-name">${esc(name || '—')}</div><div class="auth-time">${esc(stamp(at))}</div>`
      : ''
  }</td>`;
}

export async function buildPaymentRequestPrintHtml(id: number): Promise<string | null> {
  // §4.1 — the letterhead names the deployment, not a hardcoded company.
  const branding = await loadBranding();

  const res = await db.execute(sql`
    SELECT pr.*,
           d.department_name,
           c.short_name AS client_short_name, c.company_name AS client_company_name,
           cu.currency_short_name, cu.currency_name,
           mo.main_location_name, ex.expense_type_name,
           u1.full_name AS dept_approved_by_name,
           u2.full_name AS finance_approved_by_name,
           u3.full_name AS management_approved_by_name,
           u4.full_name AS under_process_by_name,
           u5.full_name AS paid_approved_by_name
    FROM payment_request_t pr
    LEFT JOIN department_master_t d ON d.id = pr.department
    LEFT JOIN client_master_t c ON c.id = pr.client_id
    LEFT JOIN currency_master_t cu ON cu.id = pr.currency
    LEFT JOIN main_office_master_t mo ON mo.id = pr.location_id
    LEFT JOIN expense_type_master_t ex ON ex.id = pr.expense_type
    LEFT JOIN users_t u1 ON u1.id = pr.dept_approved_by
    LEFT JOIN users_t u2 ON u2.id = pr.finance_approved_by
    LEFT JOIN users_t u3 ON u3.id = pr.management_approved_by
    LEFT JOIN users_t u4 ON u4.id = pr.under_process_by
    LEFT JOIN users_t u5 ON u5.id = pr.paid_approved_by
    WHERE pr.id = ${id} AND pr.display = 'Y' LIMIT 1`);

  const r = (res as unknown as { rows: Record<string, unknown>[] }).rows[0];
  if (!r) return null;

  // §4.1 — the currency's full name comes from currency_master_t, not from a
  // hardcoded USD/EUR/CDF map. A deployment that adds a currency gets its name
  // on the document by filling the master row in, with no deploy.
  const currencyName = String(r.currency_name ?? r.currency_short_name ?? '');
  const amountWords = frenchAmountInWords(num(r.amount), currencyName);
  const chargeback = r.chargeback == null ? null : num(r.chargeback);
  const chargebackWords = chargeback === null ? '' : frenchAmountInWords(chargeback, currencyName);

  const lines: McaLine[] = Array.isArray(r.mca_data) ? (r.mca_data as McaLine[]) : [];

  // §4.15 — a printed document names the legal entity, not the trading code.
  // This is one of the places the rule explicitly points the other way.
  const clientName = String(r.client_company_name ?? r.client_short_name ?? '');

  const chargebackRows =
    chargeback !== null && chargeback > 0
      ? `<tr>
           <td class="lbl">Chargeback:</td><td><strong>${esc(moneyFr(chargeback))}</strong></td>
           <td class="lbl">Devise:</td><td><strong>${esc(r.currency_short_name)}</strong></td>
         </tr>
         <tr>
           <td class="lbl">Montant en lettre:</td>
           <td colspan="3"><strong>${esc(chargebackWords || moneyFr(chargeback))}</strong></td>
         </tr>`
      : '';

  let detail = '';
  if (lines.length > 0) {
    let total = 0;
    let rows = '';
    lines.forEach((line, i) => {
      const amount = num(line.amount);
      total += amount;
      rows += `<tr><td class="c">${i + 1}</td><td><strong>${esc(line.mca_ref ?? '')}</strong></td><td>${esc(r.expense_type_name)}</td><td class="r"><strong>${esc(moneyFr(amount))}</strong></td></tr>`;
    });
    detail = `<div class="pagebreak"></div>
<div class="doc">
  <div class="head"><div class="brand">${esc(branding.project_name)}</div></div>
  <div class="title">DETAILS - DEMANDE DE FONDS No. ${esc(r.id)}</div>
  <table>
    <tr class="g"><th style="width:40px">#</th><th>MCA File No</th><th>Expense</th><th class="r" style="width:130px">Amount</th></tr>
    ${rows}
    <tr class="g"><td colspan="3" class="r"><strong>Total</strong></td><td class="r"><strong>${esc(moneyFr(total))}</strong></td></tr>
  </table>
</div>`;
  }

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>DEMANDE_DE_FONDS_${esc(r.id)}</title>
<style>
*{box-sizing:border-box;}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:0;padding:18px;
     -webkit-print-color-adjust:exact;print-color-adjust:exact;}
.doc{border:2px solid #000;padding:12px;margin-bottom:12px;}
/* §6 — borders on every table and every cell, enforced again under @media print. */
table{border-collapse:collapse;width:100%;border:1px solid #000;margin-bottom:10px;}
th,td{border:1px solid #000 !important;padding:4px 6px;vertical-align:top;}
.g{background:#e8e8e8;} .r{text-align:right;} .c{text-align:center;}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #000;padding-bottom:8px;margin-bottom:10px;}
.brand{font-size:18px;font-weight:bold;letter-spacing:.5px;}
.addr{text-align:right;font-size:9px;line-height:1.5;}
.title{text-align:center;font-size:15px;font-weight:bold;margin:10px 0;text-transform:uppercase;}
.when{text-align:right;font-size:10px;margin-bottom:8px;}
.lbl{width:130px;background:#f4f4f4;font-weight:bold;}
.section{background:#e8e8e8;border:1px solid #000;border-bottom:none;padding:4px 6px;font-weight:bold;text-transform:uppercase;}
.auth td{height:70px;} .auth-name{font-weight:bold;} .auth-time{font-size:9px;color:#333;}
.retrait td{height:60px;}
.pagebreak{page-break-before:always;}
.noprint{margin-bottom:10px;}
.btn{background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;}
@media print{.noprint{display:none;} body{padding:6px;} table,th,td{border:1px solid #000 !important;}}
</style></head><body>
<div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>

<div class="doc">
  <div class="head">
    <div class="brand">${esc(branding.project_name)}</div>
    <div class="addr">${esc(r.main_location_name ?? '')}</div>
  </div>

  <div class="title">DEMANDE DE FONDS No. ${esc(r.id)}</div>
  <div class="when">${esc(day(r.created_at))}<br>${esc(stamp(r.created_at))}</div>

  <table>
    <tr><td class="lbl">Department:</td><td colspan="3"><strong>${esc(r.department_name ?? '')}</strong></td></tr>
    <tr><td class="lbl">Beneficiare:</td><td colspan="3"><strong>${esc(r.beneficiary ?? '')}</strong></td></tr>
    <tr>
      <td class="lbl">Montant:</td><td><strong>${esc(moneyFr(r.amount))}</strong></td>
      <td class="lbl">Devise:</td><td><strong>${esc(r.currency_short_name ?? '')}</strong></td>
    </tr>
    <tr>
      <td class="lbl">Demandeur:</td><td><strong>${esc(r.requestee ?? '')}</strong></td>
      <td class="lbl">Type:</td><td><strong>${esc(r.payment_type ?? '')}</strong></td>
    </tr>
    <tr>
      <td class="lbl">Montant en lettre:</td>
      <td colspan="3"><strong>${esc(amountWords || moneyFr(r.amount))}</strong></td>
    </tr>
    ${chargebackRows}
    <tr><td class="lbl">Client:</td><td colspan="3"><strong>${esc(clientName)}</strong></td></tr>
    <tr>
      <td class="lbl">Payment For:</td>
      <td><strong>${esc(r.pay_for == null ? '' : (PAY_FOR_LABELS[Number(r.pay_for)] ?? ''))}</strong></td>
      <td class="lbl">Expense:</td><td><strong>${esc(r.expense_type_name ?? '')}</strong></td>
    </tr>
    <tr><td class="lbl">Motif:</td><td colspan="3">${esc(r.motif ?? '')}</td></tr>
  </table>

  <div class="section">Autorisation</div>
  <table class="auth"><tr>
    ${authCell('Department', r.dept_approval, r.dept_approved_by_name, r.dept_approved_at)}
    ${authCell('Management Approval', r.management_approval, r.management_approved_by_name, r.management_approved_at)}
    ${authCell('Finance', r.finance_approval, r.finance_approved_by_name, r.finance_approved_at)}
  </tr></table>

  <div class="section">Retrait</div>
  <table class="retrait"><tr>
    <td><strong>Caissier:</strong>${
      Number(r.paid_approval) === 1
        ? `<br><br><div class="auth-name">${esc(r.paid_approved_by_name ?? '—')}</div><div class="auth-time">${esc(stamp(r.paid_approved_at))}</div>`
        : ''
    }</td>
    <td><strong>Pour Reception:</strong>${
      r.cash_collector ? `<br><br><div class="auth-name">${esc(r.cash_collector)}</div>` : ''
    }</td>
  </tr></table>
</div>
${detail}
</body></html>`;
}

export default buildPaymentRequestPrintHtml;
