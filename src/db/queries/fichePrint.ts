// §2 step 3 — the printable Fiche de Calcul (main's fiche_print_template): the
// header figures, then every line with its CIF and DDI, on landscape A4 because
// the line table is twenty columns wide.
//
// Opened in a new tab and saved as PDF from the browser, like every other print
// in the app. §6 — every table and cell is bordered, and the borders are
// enforced again under @media print. §4.19 — dates are DD-MM-YYYY.
import { formatDate } from '@/lib/formatDate';
import { loadBranding } from './branding';
import { getFicheForPrint } from './fiches';

const esc = (v: unknown): string =>
  String(v ?? '').replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] as string,
  );
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** Fixed grouping — not toLocaleString, which follows the server's locale data. */
const money = (v: unknown, places = 2): string => {
  const [whole, decimals] = num(v).toFixed(places).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return decimals ? `${grouped}.${decimals}` : grouped;
};
const title = (s: unknown): string =>
  String(s ?? '').replace(/_/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());

export async function buildFichePrintHtml(id: number): Promise<string | null> {
  const [data, branding] = await Promise.all([getFicheForPrint(id), loadBranding()]);
  if (!data) return null;
  const h = data.header;

  const logo = branding.logo_url
    ? `<img class="logo" src="${esc(branding.logo_url)}" alt="${esc(branding.project_name)}">`
    : `<div class="brand">${esc(branding.project_name)}</div>`;
  const letterhead = (branding.letterhead_text ?? '')
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(esc)
    .join('<br>');

  const withCurrency = (amount: unknown, currency: unknown): string =>
    `${esc(money(amount))} ${esc(currency ?? '')}`.trim();

  const info: [string, string][] = [
    ['Fiche Reference', esc(h['fiche_reference'])],
    ['Fiche Date', esc(formatDate(h['fiche_date_iso'], ''))],
    ['Client', esc(h['client_legal_name'])],
    ['License Number', esc(h['license_number'])],
    ['MCA Reference', esc(h['mca_ref'])],
    ['Supplier', esc(h['supplier'])],
    ['Type of Goods', esc(h['goods_type'])],
    ['Regime', esc(h['regime_name'])],
    ['Transport Mode', esc(h['transport_mode_name'])],
    ['Currency', esc(h['currency'])],
    ['Poids (kg)', esc(money(h['poids']))],
    ['Exchange Rate (CDF)', esc(money(h['tx_de_change'], 6))],
    ['FOB', withCurrency(h['fob'], h['fob_currency'])],
    ['Insurance', withCurrency(h['insurance_amount'], h['insurance_currency'])],
    ['Fret', withCurrency(h['fret'], h['fret_currency'])],
    ['Other Charges', withCurrency(h['autres_charges'], h['autres_charges_currency'])],
    ['USD Rate', esc(money(h['usd_to_currency_rate'], 2))],
    ['CIF', `<strong>${withCurrency(h['cif'], h['currency'])}</strong>`],
    ['Coefficient', esc(money(h['coefficient'], 6))],
    ['Provenance', esc(h['provence'])],
    ['INCOTERM', esc([h['incoterm_short_name'], h['incoterm_full_name']].filter(Boolean).join(' — '))],
    ['Status', `<span class="status">${esc(title(h['state']))}</span>`],
  ];
  const infoRows: string[] = [];
  for (let i = 0; i < info.length; i += 2) {
    const [a, b] = [info[i], info[i + 1]];
    infoRows.push(
      `<tr><td class="lbl">${a?.[0] ?? ''}</td><td>${a?.[1] ?? ''}</td>` +
        `<td class="lbl">${b?.[0] ?? ''}</td><td>${b?.[1] ?? ''}</td></tr>`,
    );
  }

  const cols = [
    'Description sur facture', 'N° BIVAC', 'N° Facture', 'N°', 'Position tarifaire', 'DDI %',
    'Description tarif', 'AV', 'ORG', 'PROV', 'Régime', 'Code add', 'Colis', 'Qté',
    'Poids net', 'Poids brut', 'FOB par article', 'Coef', 'CIF par article', 'DDI en FC',
  ];
  const lines = data.items
    .map(
      (it) => `<tr>
        <td>${esc(it.description)}</td><td>${esc(it.no_bivac)}</td><td>${esc(it.no_facture)}</td>
        <td class="c">${it.numero}</td><td class="mono">${esc(it.position_tarif)}</td><td class="r">${esc(money(it.ddi_percent))}</td>
        <td>${esc(it.description_tarif)}</td><td>${esc(it.av)}</td><td>${esc(it.org)}</td><td>${esc(it.prov)}</td>
        <td>${esc(it.regime)}</td><td>${esc(it.code_add)}</td>
        <td class="r">${esc(money(it.colis))}</td><td class="r">${esc(money(it.qte))}</td>
        <td class="r">${esc(money(it.net))}</td><td class="r">${esc(money(it.brut))}</td>
        <td class="r">${esc(money(it.fob_article))}</td><td class="r">${esc(money(it.coef, 6))}</td>
        <td class="r">${esc(money(it.cif_article))}</td><td class="r"><strong>${esc(money(it.ddi))}</strong></td>
      </tr>`,
    )
    .join('');
  const sum = (k: 'colis' | 'qte' | 'net' | 'brut' | 'fob_article' | 'cif_article' | 'ddi'): string =>
    esc(money(data.items.reduce((s, it) => s + num(it[k]), 0)));

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(h['fiche_reference'] ?? `FICHE_${id}`)}</title>
<style>
@page{size:A4 landscape;margin:10mm;}
*{box-sizing:border-box;}
body{font-family:Arial,Helvetica,sans-serif;font-size:9.5px;color:#111;margin:0;background:#f3f4f6;
     -webkit-print-color-adjust:exact;print-color-adjust:exact;}
.page{background:#fff;width:277mm;margin:12px auto;padding:7mm;border:2px solid #000;}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:6px;border-bottom:2px solid #000;}
.logo{max-width:180px;max-height:56px;object-fit:contain;}
.brand{font-size:18px;font-weight:bold;}
.letterhead{text-align:right;font-size:8px;line-height:1.5;}
.title-band{margin:10px 0 8px;padding:7px 10px;background:#111;color:#fff;font-size:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;display:flex;justify-content:space-between;}
/* §6 — borders on every table and cell, enforced again under @media print. */
table{border-collapse:collapse;width:100%;border:1px solid #000;margin-bottom:8px;}
th,td{border:1px solid #000 !important;padding:3px 5px;vertical-align:top;}
.info .lbl{width:14%;background:#f0f0f0;font-weight:bold;text-transform:uppercase;font-size:8.5px;}
.lines th{background:#e5e5e5;font-size:8px;text-transform:uppercase;}
.lines tfoot td{background:#f0f0f0;font-weight:bold;}
.status{border:1px solid #000;padding:1px 6px;font-weight:bold;text-transform:uppercase;}
.r{text-align:right;} .c{text-align:center;} .mono{font-family:'Courier New',monospace;}
.noprint{max-width:277mm;margin:12px auto 0;display:flex;justify-content:flex-end;}
.btn{background:#111;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;}
@media print{
  body{background:#fff;}
  .noprint{display:none;}
  .page{margin:0;width:auto;border:2px solid #000;}
  table,th,td{border:1px solid #000 !important;}
}
</style></head><body>
<div class="noprint"><button class="btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
<div class="page">
  <div class="head">${logo}<div class="letterhead">${letterhead}</div></div>
  <div class="title-band"><span>Fiche de Calcul</span><span>${esc(h['fiche_reference'])}</span></div>
  <table class="info">${infoRows.join('')}</table>
  <table class="lines">
    <thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${lines || `<tr><td colspan="${cols.length}" class="c">No lines.</td></tr>`}</tbody>
    <tfoot><tr>
      <td colspan="12" class="r">TOTALS</td>
      <td class="r">${sum('colis')}</td><td class="r">${sum('qte')}</td><td class="r">${sum('net')}</td>
      <td class="r">${sum('brut')}</td><td class="r">${sum('fob_article')}</td><td></td>
      <td class="r">${sum('cif_article')}</td><td class="r">${sum('ddi')}</td>
    </tr></tfoot>
  </table>
</div>
</body></html>`;
}
