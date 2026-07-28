// Export Delay KPI aggregation. Mirrors imkpi but over exports_t and the export
// milestone stages. Reuses the holiday set, filter options and working-days
// engine so the two KPIs stay in lockstep (§4.10).
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { STAGE_DEFS, CLIENT_STAGE_ALIASES } from '@/lib/exkpi/stages';
import type { StageDef } from '@/lib/imkpi/stages';
import { makeWorkingDays, calendarDays, isValidDateStr } from '@/lib/imkpi/workingDays';
import { getHolidaySet } from '@/db/queries/imkpi';
import type { ImkpiFilters, StageKpi, ClientRow, Bottleneck, ImkpiAggregate } from '@/db/queries/imkpi';

export type ExkpiFilters = ImkpiFilters;

function rows<T>(res: unknown): T[] {
  return (res as { rows: T[] }).rows;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
const s = (v: unknown) => (v == null ? '' : String(v));

function whereFilters(f: ExkpiFilters): SQL {
  const conds: SQL[] = [sql`e.display = 'Y'`];
  if (f.client_id !== 'all' && /^\d+$/.test(f.client_id)) conds.push(sql`e.client_id = ${Number(f.client_id)}`);
  if (f.clearance_type && /^\d+$/.test(f.clearance_type)) conds.push(sql`e.types_of_clearance = ${Number(f.clearance_type)}`);
  if (isValidDateStr(f.start_date) && isValidDateStr(f.end_date) && f.start_date <= f.end_date) {
    conds.push(sql`e.created_at::date BETWEEN ${f.start_date} AND ${f.end_date}`);
  }
  return sql.join(conds, sql` AND `);
}

interface MasterRow {
  id: number;
  client_id: number | null;
  company_name: string;
  [col: string]: unknown;
}

async function fetchMasterData(f: ExkpiFilters): Promise<MasterRow[]> {
  const res = await db.execute(sql`
    SELECT e.id, e.client_id, COALESCE(c.company_name,'Unknown') AS company_name,
           to_char(e.loading_date,'YYYY-MM-DD') AS loading_date,
           to_char(e.bp_date,'YYYY-MM-DD') AS bp_date,
           to_char(e.assay_date,'YYYY-MM-DD') AS assay_date,
           to_char(e.ceec_in_date,'YYYY-MM-DD') AS ceec_in_date,
           to_char(e.ceec_out_date,'YYYY-MM-DD') AS ceec_out_date,
           to_char(e.min_div_in_date,'YYYY-MM-DD') AS min_div_in_date,
           to_char(e.min_div_out_date,'YYYY-MM-DD') AS min_div_out_date,
           to_char(e.gov_docs_in_date,'YYYY-MM-DD') AS gov_docs_in_date,
           to_char(e.gov_docs_out_date,'YYYY-MM-DD') AS gov_docs_out_date,
           to_char(e.dgda_in_date,'YYYY-MM-DD') AS dgda_in_date,
           to_char(e.dgda_out_date,'YYYY-MM-DD') AS dgda_out_date,
           to_char(e.liquidation_date,'YYYY-MM-DD') AS liquidation_date,
           to_char(e.quittance_date,'YYYY-MM-DD') AS quittance_date,
           to_char(e.dispatch_deliver_date,'YYYY-MM-DD') AS dispatch_deliver_date,
           to_char(e.border_arrival_date,'YYYY-MM-DD') AS border_arrival_date,
           to_char(e.exit_drc_date,'YYYY-MM-DD') AS exit_drc_date
    FROM exports_t e
    LEFT JOIN client_master_t c ON e.client_id = c.id AND c.display = 'Y'
    WHERE ${whereFilters(f)}
  `);
  return rows<MasterRow>(res);
}

export async function getExkpiAggregate(f: ExkpiFilters): Promise<ImkpiAggregate> {
  const holidays = await getHolidaySet();
  const master = await fetchMasterData(f);
  const wd = makeWorkingDays(holidays);
  const today = todayISO();

  const stageAcc = STAGE_DEFS.map((def) => ({
    def, total_records: 0, evaluated_count: 0, on_time_count: 0, delayed_count: 0, sum_days: 0,
  }));

  let totalExports = 0, fullyDelivered = 0;
  let sumTotal = 0, cntTotal = 0, sumCustoms = 0, cntCustoms = 0;
  let sumDgdaLiq = 0, cntDgdaLiq = 0, sumLiqQuitt = 0, cntLiqQuitt = 0;
  let dgdaLiqDelayed = 0, liqQuittDelayed = 0, ceecDelayed = 0, borderExitDelayed = 0;
  let onTimeTotal = 0, delayedTotal = 0;

  const clientData = new Map<number, ClientRow & Record<string, number>>();

  for (const row of master) {
    totalExports++;
    const cid = row.client_id ?? 0;
    const delivered = isValidDateStr(s(row.exit_drc_date));
    if (delivered) fullyDelivered++;

    let cd = clientData.get(cid);
    if (!cd) {
      cd = { client_name: row.company_name || 'Unknown', total_exports: 0, delivered_count: 0, on_time_count: 0, delayed_count: 0 } as unknown as ClientRow & Record<string, number>;
      for (const alias of Object.values(CLIENT_STAGE_ALIASES)) { cd[`${alias}_sum`] = 0; cd[`${alias}_cnt`] = 0; }
      clientData.set(cid, cd);
    }
    cd.total_exports = (cd.total_exports as number) + 1;
    if (delivered) cd.delivered_count = (cd.delivered_count as number) + 1;

    for (const acc of stageAcc) {
      const { from, to, threshold, key } = acc.def;
      const fVal = s(row[from]);
      const hasFrom = isValidDateStr(fVal);
      const hasTo = isValidDateStr(s(row[to]));
      acc.total_records++;
      const effectiveTo = hasTo ? s(row[to]) : hasFrom ? today : null;
      const days = hasFrom && effectiveTo ? wd(fVal, effectiveTo) : null;
      if (days !== null) {
        acc.evaluated_count++;
        acc.sum_days += days;
        if (days <= threshold) acc.on_time_count++; else acc.delayed_count++;
        if (hasTo && CLIENT_STAGE_ALIASES[key]) {
          const alias = CLIENT_STAGE_ALIASES[key];
          cd[`${alias}_sum`] = (cd[`${alias}_sum`] as number) + days;
          cd[`${alias}_cnt`] = (cd[`${alias}_cnt`] as number) + 1;
        }
      }
    }

    const val = (k: string) => s(row[k]);
    const span = (fromK: string, endK: string): number | null => {
      const from = val(fromK);
      if (!isValidDateStr(from)) return null;
      const end = isValidDateStr(val(endK)) ? val(endK) : today;
      return wd(from, end);
    };

    const wdTotal = span('loading_date', 'exit_drc_date');
    if (wdTotal !== null) {
      sumTotal += wdTotal; cntTotal++;
      if (wdTotal <= 21) { onTimeTotal++; cd.on_time_count = (cd.on_time_count as number) + 1; }
      else { delayedTotal++; cd.delayed_count = (cd.delayed_count as number) + 1; }
    }
    const wdC = span('dgda_in_date', 'dgda_out_date');
    if (wdC !== null) { sumCustoms += wdC; cntCustoms++; }
    const wdDL = span('dgda_in_date', 'liquidation_date');
    if (wdDL !== null) { sumDgdaLiq += wdDL; cntDgdaLiq++; if (wdDL > 2) dgdaLiqDelayed++; }
    const wdLQ = span('liquidation_date', 'quittance_date');
    if (wdLQ !== null) { sumLiqQuitt += wdLQ; cntLiqQuitt++; if (wdLQ > 2) liqQuittDelayed++; }
    const wdCe = span('ceec_in_date', 'ceec_out_date');
    if (wdCe !== null && wdCe > 3) ceecDelayed++;
    const wdBE = span('border_arrival_date', 'exit_drc_date');
    if (wdBE !== null && wdBE > 2) borderExitDelayed++;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const stage_kpis: StageKpi[] = stageAcc.map((acc) => {
    const c = acc.evaluated_count;
    return {
      ...acc.def,
      total_records: acc.total_records,
      evaluated_count: c,
      on_time_count: acc.on_time_count,
      delayed_count: acc.delayed_count,
      avg_days: c > 0 ? round1(acc.sum_days / c) : 0,
      on_time_pct: c > 0 ? Math.round((acc.on_time_count / c) * 100) : 0,
      delayed_pct: c > 0 ? Math.round((acc.delayed_count / c) * 100) : 0,
    };
  });

  const priority_kpis = stage_kpis.filter((k) => k.priority);
  const bottleneck_analysis: Bottleneck[] = stage_kpis
    .map((k) => ({
      key: k.key, label: k.label, short: k.short, color: k.color, from: k.from, to: k.to,
      avg_days: k.avg_days, sample_count: k.evaluated_count, threshold: k.threshold,
      delayed_count: k.delayed_count, delayed_pct: k.delayed_pct, priority: k.priority,
    }))
    .sort((a, b) => b.delayed_pct - a.delayed_pct);

  const summary_kpis: Record<string, number> = {
    total_exports: totalExports,
    fully_delivered: fullyDelivered,
    avg_total_days: cntTotal > 0 ? round1(sumTotal / cntTotal) : 0,
    avg_customs_days: cntCustoms > 0 ? round1(sumCustoms / cntCustoms) : 0,
    avg_dgda_to_liquid: cntDgdaLiq > 0 ? round1(sumDgdaLiq / cntDgdaLiq) : 0,
    avg_liquid_to_quittance: cntLiqQuitt > 0 ? round1(sumLiqQuitt / cntLiqQuitt) : 0,
    on_time_total: onTimeTotal,
    delayed_total: delayedTotal,
    dgda_liquid_delayed: dgdaLiqDelayed,
    liquid_quittance_delayed: liqQuittDelayed,
    ceec_delayed: ceecDelayed,
    border_exit_delayed: borderExitDelayed,
  };

  const client_delay_table: ClientRow[] = [...clientData.values()].map((cd) => {
    const r = {
      client_name: cd.client_name as string,
      total_exports: cd.total_exports as number,
      delivered_count: cd.delivered_count as number,
      on_time_count: cd.on_time_count as number,
      delayed_count: cd.delayed_count as number,
    } as unknown as ClientRow;
    for (const alias of Object.values(CLIENT_STAGE_ALIASES)) {
      const cnt = cd[`${alias}_cnt`] as number;
      r[alias] = cnt > 0 ? round1((cd[`${alias}_sum`] as number) / cnt) : null;
    }
    return r;
  }).sort((a, b) => {
    const aN = a.avg_total === null ? 1 : 0, bN = b.avg_total === null ? 1 : 0;
    if (aN !== bN) return aN - bN;
    if (a.avg_total !== b.avg_total) return (Number(b.avg_total) || 0) - (Number(a.avg_total) || 0);
    return (Number(b.total_exports) || 0) - (Number(a.total_exports) || 0);
  });

  return { stage_kpis, priority_kpis, summary_kpis, bottleneck_analysis, client_delay_table };
}

export async function getStageRecords(
  stageKey: string,
  f: ExkpiFilters,
  statusFilter: string,
): Promise<{ records: Record<string, unknown>[]; stage: string; threshold: number; today: string } | null> {
  const def: StageDef | undefined = STAGE_DEFS.find((d) => d.key === stageKey);
  if (!def) return null;
  const holidays = await getHolidaySet();
  const wd = makeWorkingDays(holidays);
  const today = todayISO();

  const res = await db.execute(sql`
    SELECT e.id, e.mca_ref,
      COALESCE(c.short_name, c.company_name, 'N/A') AS client_short,
      COALESCE(cs.clearing_status,'Pending') AS clearing_status,
      COALESCE(tm.transport_mode_name,'N/A') AS transport_mode,
      COALESCE(k.kind_name,'N/A') AS kind_name,
      COALESCE(tg.goods_type,'N/A') AS goods_type,
      COALESCE(cm.clearance_name,'N/A') AS clearance_name,
      COALESCE(l.license_number,'—') AS license_number,
      COALESCE(e.buyer,'—') AS buyer, COALESCE(e.transporter,'—') AS transporter,
      COALESCE(e.weight,0) AS weight, COALESCE(cur.currency_name,'') AS currency, COALESCE(e.fob,0) AS fob,
      to_char(e.${sql.raw(def.from)}, 'YYYY-MM-DD') AS stage_from_date,
      to_char(e.${sql.raw(def.to)}, 'YYYY-MM-DD') AS stage_to_date,
      to_char(e.loading_date,'YYYY-MM-DD') AS loading_date, to_char(e.bp_date,'YYYY-MM-DD') AS bp_date,
      to_char(e.assay_date,'YYYY-MM-DD') AS assay_date, to_char(e.ceec_in_date,'YYYY-MM-DD') AS ceec_in_date,
      to_char(e.ceec_out_date,'YYYY-MM-DD') AS ceec_out_date, to_char(e.dgda_in_date,'YYYY-MM-DD') AS dgda_in_date,
      to_char(e.dgda_out_date,'YYYY-MM-DD') AS dgda_out_date, to_char(e.liquidation_date,'YYYY-MM-DD') AS liquidation_date,
      to_char(e.quittance_date,'YYYY-MM-DD') AS quittance_date, to_char(e.dispatch_deliver_date,'YYYY-MM-DD') AS dispatch_deliver_date,
      to_char(e.border_arrival_date,'YYYY-MM-DD') AS border_arrival_date, to_char(e.exit_drc_date,'YYYY-MM-DD') AS exit_drc_date
    FROM exports_t e
    LEFT JOIN client_master_t c ON e.client_id = c.id AND c.display = 'Y'
    LEFT JOIN clearing_status_master_t cs ON e.clearing_status = cs.id AND cs.display = 'Y'
    LEFT JOIN transport_mode_master_t tm ON e.transport_mode = tm.id AND tm.display = 'Y'
    LEFT JOIN kind_master_t k ON e.kind = k.id AND k.display = 'Y'
    LEFT JOIN type_of_goods_master_t tg ON e.type_of_goods = tg.id AND tg.display = 'Y'
    LEFT JOIN clearance_master_t cm ON e.types_of_clearance = cm.id AND cm.display = 'Y'
    LEFT JOIN license_t l ON e.license_id = l.id AND l.display = 'Y'
    LEFT JOIN currency_master_t cur ON e.currency = cur.id AND cur.display = 'Y'
    WHERE ${whereFilters(f)}
    ORDER BY e.id DESC
  `);

  const th = def.threshold;
  const out: Record<string, unknown>[] = [];
  for (const row of rows<Record<string, unknown>>(res)) {
    const fromDate = s(row.stage_from_date);
    const toDate = s(row.stage_to_date);
    const hasFrom = isValidDateStr(fromDate);
    const hasTo = isValidDateStr(toDate);
    const isPending = hasFrom && !hasTo;
    const effectiveTo = hasTo ? toDate : hasFrom ? today : null;
    const days = hasFrom && effectiveTo ? wd(fromDate, effectiveTo) : null;
    const cal = hasFrom && effectiveTo ? calendarDays(fromDate, effectiveTo) : null;

    let status: 'On Time' | 'Delayed' | 'N/A';
    if (!hasFrom || days === null) status = 'N/A';
    else if (days <= th) status = 'On Time';
    else status = 'Delayed';

    if (statusFilter === 'on_time' && status !== 'On Time') continue;
    if (statusFilter === 'delayed' && status !== 'Delayed') continue;
    if (statusFilter === 'pending' && !isPending) continue;

    out.push({ ...row, total_days: cal, days_taken: days, delay_days: days !== null && days > th ? days - th : null, delay_status: status, is_pending: isPending ? 1 : 0 });
  }

  out.sort((a, b) => {
    const aD = (a.days_taken as number) ?? -1;
    const bD = (b.days_taken as number) ?? -1;
    if (bD !== aD) return bD - aD;
    return (b.id as number) - (a.id as number);
  });

  return { records: out.slice(0, 500), stage: def.label, threshold: th, today };
}
