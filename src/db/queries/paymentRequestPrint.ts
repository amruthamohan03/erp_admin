// §2 step 6 — the printable DEMANDE DE FONDS: the paper a payment request
// becomes once it is authorised, carrying the signatures that release the money.
//
// Self-contained HTML the browser opens and saves as PDF; no PDF library is
// installed (§3 — adding one needs asking first), which is the same approach the
// invoice print builders take.
//
// One A4 page: letterhead, the request in figures AND in words, the motif, the
// references, the authorisation signatures, and the cash withdrawal. The
// references move to a second page only when there are too many to share the
// first — a request is signed as one sheet, and splitting it for three lines
// meant the approvers signed a page that did not show what they were paying.
//
// Nothing here is a hardcoded business fact: the letterhead is Settings →
// Application, the signature cells are the stages flagged `print_signature` in
// Masters → Payment Stages (in their configured order), and the currency's name
// is currency_master_t.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { frenchAmountInWords } from '@/lib/frenchAmount';
import { PAY_FOR_LABELS, STAGE_COLUMNS, flagOf, paymentStatus, type PaymentApprovalState } from '@/lib/payments/stages';
import { applicableStages } from '@/lib/payments/stageConfig';
import { loadBranding } from './branding';
import { loadPaymentStages } from './paymentStages';

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
 * decimals — `1 696,19`. Deliberately NOT `toLocaleString('fr-FR')`, which
 * follows the SERVER's ICU data and so prints differently per machine (the same
 * reason §4.19 forbids `toLocaleDateString`).
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

/** References that still leave room for the signatures on one A4 sheet. */
const REFS_ON_FIRST_PAGE = 12;

/**
 * One signature cell. An unsigned stage prints EMPTY rather than "Pending": a
 * blank is where a wet signature goes, and "Pending" in it would make an
 * authorised document read as a draft.
 */
function signCell(title: string, signed: boolean, name: unknown, at: unknown): string {
  return `<td>
    <div class="sign-title">${esc(title)}</div>
    <div class="sign-body">${
      signed
        ? `<div class="sign-name">${esc(name || '—')}</div><div class="sign-time">${esc(stamp(at))}</div><div class="sign-ok">APPROUVÉ</div>`
        : ''
    }</div>
  </td>`;
}

function refsTable(lines: McaLine[], expense: unknown): string {
  let total = 0;
  const rows = lines
    .map((line, i) => {
      const amount = num(line.amount);
      total += amount;
      return `<tr><td class="c">${i + 1}</td><td class="mono">${esc(line.mca_ref ?? '')}</td><td>${esc(expense)}</td><td class="r mono">${esc(moneyFr(amount))}</td></tr>`;
    })
    .join('');
  return `<table class="grid">
    <thead><tr><th style="width:32px">#</th><th>Référence dossier (MCA)</th><th>Dépense</th><th class="r" style="width:120px">Montant</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3" class="r"><strong>Total</strong></td><td class="r mono"><strong>${esc(moneyFr(total))}</strong></td></tr></tfoot>
  </table>`;
}

export async function buildPaymentRequestPrintHtml(id: number): Promise<string | null> {
  const [branding, stages] = await Promise.all([loadBranding(), loadPaymentStages()]);

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
  const state = r as unknown as PaymentApprovalState;

  // §4.1 — the currency's full name comes from currency_master_t.
  const currencyName = String(r.currency_name ?? r.currency_short_name ?? '');
  const amountWords = frenchAmountInWords(num(r.amount), currencyName);
  const chargeback = r.chargeback == null ? null : num(r.chargeback);
  const chargebackWords = chargeback === null ? '' : frenchAmountInWords(chargeback, currencyName);

  const lines: McaLine[] = Array.isArray(r.mca_data) ? (r.mca_data as McaLine[]) : [];

  // §4.15 — a printed document names the legal entity, not the trading code.
  const clientName = String(r.client_company_name ?? r.client_short_name ?? '');

  // The approver name for a slot: `<by column>_name` as selected above.
  const byName = (stage: keyof typeof STAGE_COLUMNS): unknown => r[`${STAGE_COLUMNS[stage].by}_name`];

  const chain = applicableStages(stages, state.payment_type);
  const signers = chain.filter((s) => s.print_signature);
  // The last stage of the chain is the one that releases the money — its
  // approver is the cashier, whatever the stage is called.
  const release = chain.at(-1);
  const status = paymentStatus(state, stages);

  const logo = branding.logo_url
    ? `<img class="logo" src="${esc(branding.logo_url)}" alt="${esc(branding.project_name)}">`
    : `<div class="brand">${esc(branding.project_name)}</div>`;
  const letterhead = (branding.letterhead_text ?? '')
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(esc)
    .join('<br>');

  const refsFit = lines.length > 0 && lines.length <= REFS_ON_FIRST_PAGE;

  const chargebackRow =
    chargeback !== null && chargeback > 0
      ? `<tr>
           <td class="lbl">Chargeback</td><td class="val"><strong>${esc(moneyFr(chargeback))} ${esc(r.currency_short_name ?? '')}</strong></td>
           <td class="lbl">En lettres</td><td class="val words">${esc(chargebackWords || moneyFr(chargeback))}</td>
         </tr>`
      : '';

  const secondPage =
    lines.length > 0 && !refsFit
      ? `<div class="page page-break">
  <div class="head">${logo}<div class="letterhead">${letterhead}</div></div>
  <div class="title-band"><span>Détails — Demande de Fonds</span><span class="no">N° ${esc(r.id)}</span></div>
  ${refsTable(lines, r.expense_type_name)}
</div>`
      : '';

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>DEMANDE_DE_FONDS_${esc(r.id)}</title>
<style>
@page{size:A4;margin:12mm;}
*{box-sizing:border-box;}
body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#111;margin:0;background:#f3f4f6;
     -webkit-print-color-adjust:exact;print-color-adjust:exact;}
.page{background:#fff;width:186mm;min-height:273mm;margin:12px auto;padding:9mm;border:2px solid #000;display:flex;flex-direction:column;}
.page-break{page-break-before:always;}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:8px;border-bottom:2px solid #000;}
.logo{max-width:190px;max-height:62px;object-fit:contain;}
.brand{font-size:20px;font-weight:bold;letter-spacing:.5px;}
.letterhead{text-align:right;font-size:8.5px;line-height:1.5;color:#222;}
.title-band{display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px;padding:8px 12px;background:#111;color:#fff;}
.title-band span{font-size:15px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;}
.title-band .no{font-size:14px;}
.meta{display:flex;justify-content:space-between;font-size:9.5px;margin-bottom:8px;}
.meta b{font-weight:bold;}
.status{display:inline-block;border:1px solid #000;padding:1px 6px;font-weight:bold;text-transform:uppercase;font-size:9px;}
/* §6 — borders on every table and cell, enforced again under @media print. */
table{border-collapse:collapse;width:100%;border:1px solid #000;}
th,td{border:1px solid #000 !important;padding:5px 7px;vertical-align:top;}
.info{margin-bottom:8px;}
.info .lbl{width:17%;background:#f0f0f0;font-weight:bold;font-size:9.5px;text-transform:uppercase;}
.info .val{width:33%;}
.amount{font-size:14px;font-weight:bold;}
.words{font-style:italic;}
.grid thead th{background:#e5e5e5;font-size:9.5px;text-transform:uppercase;text-align:left;}
.grid tfoot td{background:#f0f0f0;}
.section{margin:10px 0 0;padding:5px 8px;border:1px solid #000;border-bottom:none;background:#e5e5e5;
         font-weight:bold;font-size:10px;letter-spacing:1px;text-transform:uppercase;text-align:center;}
.sign td{width:${signers.length > 0 ? Math.floor(100 / signers.length) : 100}%;height:92px;text-align:center;}
.retrait td{width:50%;height:80px;text-align:center;}
.sign-title{font-weight:bold;font-size:9.5px;text-transform:uppercase;border-bottom:1px dashed #999;padding-bottom:3px;}
.sign-body{padding-top:10px;}
.sign-name{font-weight:bold;font-size:11px;}
.sign-time{font-size:9px;color:#333;margin-top:2px;}
.sign-ok{display:inline-block;margin-top:6px;border:1.5px solid #000;padding:1px 8px;font-size:8.5px;font-weight:bold;letter-spacing:1px;}
.r{text-align:right;} .c{text-align:center;} .mono{font-family:'Courier New',monospace;}
.spacer{flex:1;}
.foot{display:flex;justify-content:space-between;border-top:1px solid #000;margin-top:10px;padding-top:5px;font-size:8.5px;color:#333;}
.noprint{max-width:186mm;margin:12px auto 0;display:flex;justify-content:flex-end;}
.btn{background:#111;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;}
@media print{
  body{background:#fff;}
  .noprint{display:none;}
  .page{margin:0;width:auto;min-height:0;height:273mm;border:2px solid #000;}
  table,th,td{border:1px solid #000 !important;}
}
</style></head><body>
<div class="noprint"><button class="btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>

<div class="page">
  <div class="head">${logo}<div class="letterhead">${letterhead}</div></div>

  <div class="title-band"><span>Demande de Fonds</span><span class="no">N° ${esc(r.id)}</span></div>
  <div class="meta">
    <div><b>Date :</b> ${esc(day(r.created_at))} &nbsp; <b>Heure :</b> ${esc(stamp(r.created_at).split(' ')[1] ?? '')}</div>
    <div><b>Lieu :</b> ${esc(r.main_location_name ?? '—')}</div>
    <div><b>Statut :</b> <span class="status">${esc(status.label)}</span></div>
  </div>

  <table class="info">
    <tr>
      <td class="lbl">Département</td><td class="val"><strong>${esc(r.department_name ?? '')}</strong></td>
      <td class="lbl">Demandeur</td><td class="val"><strong>${esc(r.requestee ?? '')}</strong></td>
    </tr>
    <tr>
      <td class="lbl">Bénéficiaire</td><td class="val" colspan="3"><strong>${esc(r.beneficiary ?? '')}</strong></td>
    </tr>
    <tr>
      <td class="lbl">Montant</td><td class="val amount">${esc(moneyFr(r.amount))} ${esc(r.currency_short_name ?? '')}</td>
      <td class="lbl">Mode</td><td class="val"><strong>${esc(r.payment_type ?? '')}</strong></td>
    </tr>
    <tr>
      <td class="lbl">En lettres</td><td class="val words" colspan="3">${esc(amountWords || moneyFr(r.amount))}</td>
    </tr>
    ${chargebackRow}
    <tr>
      <td class="lbl">Client</td><td class="val" colspan="3"><strong>${esc(clientName || '—')}</strong></td>
    </tr>
    <tr>
      <td class="lbl">Paiement pour</td><td class="val">${esc(r.pay_for == null ? '' : (PAY_FOR_LABELS[Number(r.pay_for)] ?? ''))}</td>
      <td class="lbl">Dépense</td><td class="val">${esc(r.expense_type_name ?? '')}</td>
    </tr>
    <tr>
      <td class="lbl">Motif</td><td class="val" colspan="3">${esc(r.motif ?? '')}</td>
    </tr>
  </table>

  ${refsFit ? `<div class="section">Références (${lines.length})</div>${refsTable(lines, r.expense_type_name)}` : ''}
  ${lines.length > 0 && !refsFit ? `<div class="meta"><div><b>Références :</b> ${lines.length} dossier(s) — détail en page 2.</div></div>` : ''}

  <div class="spacer"></div>

  ${
    signers.length > 0
      ? `<div class="section">Autorisation</div>
  <table class="sign"><tr>${signers
    .map((s) => signCell(s.label, flagOf(state, s.stage) === 1, byName(s.stage), r[STAGE_COLUMNS[s.stage].at]))
    .join('')}</tr></table>`
      : ''
  }

  <div class="section">Retrait</div>
  <table class="retrait"><tr>
    ${signCell('Caissier', !!release && flagOf(state, release.stage) === 1, release ? byName(release.stage) : '', release ? r[STAGE_COLUMNS[release.stage].at] : null)}
    <td>
      <div class="sign-title">Pour réception</div>
      <div class="sign-body">${r.cash_collector ? `<div class="sign-name">${esc(r.cash_collector)}</div>` : ''}</div>
    </td>
  </tr></table>

  <div class="foot">
    <span>${esc(branding.project_name)} — Demande de Fonds N° ${esc(r.id)}</span>
    <span>Imprimé le ${esc(stamp(new Date()))}</span>
  </div>
</div>
${secondPage}
</body></html>`;
}

export default buildPaymentRequestPrintHtml;
