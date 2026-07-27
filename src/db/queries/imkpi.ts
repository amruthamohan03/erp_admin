// Import Delay KPI aggregation (§ tracking). Ported from main's ImkpiController:
// fetch the import milestone dates, compute working-day spans per stage
// (weekends + DRC holidays excluded, pending aged to today), and roll up into
// summary / priority / stage / bottleneck / client-comparison shapes.
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { STAGE_DEFS, CLIENT_STAGE_ALIASES, type StageDef } from '@/lib/imkpi/stages';
import { makeWorkingDays, calendarDays, isValidDateStr } from '@/lib/imkpi/workingDays';

export interface ImkpiFilters {
  client_id: string; // 'all' | numeric string
  clearance_type: string; // '' | numeric string
  start_date: string;
  end_date: string;
}

function rows<T>(res: unknown): T[] {
  return (res as { rows: T[] }).rows;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Weekday DRC holidays as a Set of 'YYYY-MM-DD' (weekend holidays are moot).
export async function getHolidaySet(): Promise<Set<string>> {
  const res = await db.execute(sql`
    SELECT to_char(holiday_date, 'YYYY-MM-DD') AS d
    FROM drc_holidays_t
    WHERE display = 'Y' AND EXTRACT(ISODOW FROM holiday_date) <= 5
  `);
  return new Set(rows<{ d: string }>(res).map((r) => r.d));
}

export async function getHolidayRows(): Promise<Array<{ holiday_date: string; name_en: string; name_fr: string | null; holiday_type: string }>> {
  const res = await db.execute(sql`
    SELECT to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date, name_en, name_fr, holiday_type
    FROM drc_holidays_t WHERE display = 'Y' ORDER BY holiday_date ASC
  `);
  return rows(res);
}

export async function getFilterOptions(): Promise<{
  clients_list: Array<{ id: number; short_name: string }>;
  clearance_types: Array<{ id: number; clearance_name: string }>;
}> {
  const [cl, ct] = await Promise.all([
    db.execute(sql`SELECT id, COALESCE(short_name, company_name, 'Unknown') AS short_name FROM client_master_t WHERE display='Y' ORDER BY short_name ASC`),
    db.execute(sql`SELECT id, clearance_name FROM clearance_master_t WHERE display='Y' ORDER BY id ASC`),
  ]);
  return { clients_list: rows(cl), clearance_types: rows(ct) };
}

function whereFilters(f: ImkpiFilters): SQL {
  const conds: SQL[] = [sql`i.display = 'Y'`, sql`i.transport_mode = 1`];
  if (f.client_id !== 'all' && /^\d+$/.test(f.client_id)) conds.push(sql`i.client_id = ${Number(f.client_id)}`);
  if (f.clearance_type && /^\d+$/.test(f.clearance_type)) conds.push(sql`i.types_of_clearance = ${Number(f.clearance_type)}`);
  if (isValidDateStr(f.start_date) && isValidDateStr(f.end_date) && f.start_date <= f.end_date) {
    conds.push(sql`i.created_at::date BETWEEN ${f.start_date} AND ${f.end_date}`);
  }
  return sql.join(conds, sql` AND `);
}

// Raw milestone rows for the aggregate.
interface MasterRow {
  id: number;
  client_id: number | null;
  company_name: string;
  [col: string]: unknown;
}

async function fetchMasterData(f: ImkpiFilters): Promise<MasterRow[]> {
  // to_char every date so db.execute (raw pg) yields 'YYYY-MM-DD' strings, not
  // Date objects — the working-days engine parses strings.
  const res = await db.execute(sql`
    SELECT i.id, i.client_id, COALESCE(c.company_name,'Unknown') AS company_name,
           to_char(i.pre_alert_date,'YYYY-MM-DD') AS pre_alert_date,
           to_char(i.arrival_date_zambia,'YYYY-MM-DD') AS arrival_date_zambia,
           to_char(i.dispatch_from_zambia,'YYYY-MM-DD') AS dispatch_from_zambia,
           to_char(i.drc_entry_date,'YYYY-MM-DD') AS drc_entry_date,
           to_char(i.border_warehouse_arrival_date,'YYYY-MM-DD') AS border_warehouse_arrival_date,
           to_char(i.dispatch_from_border,'YYYY-MM-DD') AS dispatch_from_border,
           to_char(i.dispatch_deliver_date,'YYYY-MM-DD') AS dispatch_deliver_date,
           to_char(i.dgda_in_date,'YYYY-MM-DD') AS dgda_in_date,
           to_char(i.dgda_out_date,'YYYY-MM-DD') AS dgda_out_date,
           to_char(i.liquidation_date,'YYYY-MM-DD') AS liquidation_date,
           to_char(i.quittance_date,'YYYY-MM-DD') AS quittance_date,
           to_char(i.warehouse_arrival_date,'YYYY-MM-DD') AS warehouse_arrival_date
    FROM imports_t i
    LEFT JOIN client_master_t c ON i.client_id = c.id AND c.display = 'Y'
    WHERE ${whereFilters(f)}
  `);
  return rows<MasterRow>(res);
}

// ---- aggregate shapes --------------------------------------------------------

export interface StageKpi extends StageDef {
  total_records: number; evaluated_count: number; on_time_count: number; delayed_count: number;
  avg_days: number; on_time_pct: number; delayed_pct: number;
}
export interface ClientRow {
  client_name: string; total_imports: number; delivered_count: number; on_time_count: number; delayed_count: number;
  [alias: string]: string | number | null;
}
export interface Bottleneck {
  key: string; label: string; short: string; color: string; from: string; to: string;
  avg_days: number; sample_count: number; threshold: number; delayed_count: number; delayed_pct: number; priority: boolean;
}
export interface ImkpiAggregate {
  stage_kpis: StageKpi[];
  priority_kpis: StageKpi[];
  summary_kpis: Record<string, number>;
  bottleneck_analysis: Bottleneck[];
  client_delay_table: ClientRow[];
}

const s = (v: unknown) => (v == null ? '' : String(v));

export async function getImkpiAggregate(f: ImkpiFilters): Promise<ImkpiAggregate> {
  const holidays = await getHolidaySet();
  const master = await fetchMasterData(f);
  const wd = makeWorkingDays(holidays);
  const today = todayISO();

  const stageAcc = STAGE_DEFS.map((def) => ({
    def, total_records: 0, evaluated_count: 0, on_time_count: 0, delayed_count: 0, sum_days: 0,
  }));

  let totalImports = 0, fullyDelivered = 0;
  let sumTotal = 0, cntTotal = 0, sumCustoms = 0, cntCustoms = 0;
  let sumDgdaLiq = 0, cntDgdaLiq = 0, sumLiqQuitt = 0, cntLiqQuitt = 0;
  let dgdaLiqDelayed = 0, liqQuittDelayed = 0, drcWhDelayed = 0, drcDeliverDelayed = 0;
  let onTimeTotal = 0, delayedTotal = 0;

  const clientData = new Map<number, ClientRow & Record<string, number>>();

  for (const row of master) {
    totalImports++;
    const subId = row.client_id ?? 0;
    const delivered = isValidDateStr(s(row.dispatch_deliver_date));
    if (delivered) fullyDelivered++;

    let cd = clientData.get(subId);
    if (!cd) {
      cd = { client_name: row.company_name || 'Unknown', total_imports: 0, delivered_count: 0, on_time_count: 0, delayed_count: 0 } as ClientRow & Record<string, number>;
      for (const alias of Object.values(CLIENT_STAGE_ALIASES)) { cd[`${alias}_sum`] = 0; cd[`${alias}_cnt`] = 0; }
      clientData.set(subId, cd);
    }
    cd.total_imports = (cd.total_imports as number) + 1;
    if (delivered) cd.delivered_count = (cd.delivered_count as number) + 1;

    for (const acc of stageAcc) {
      const { from, to, threshold, key } = acc.def;
      const fVal = s(row[from]);
      const tVal = s(row[to]);
      const hasFrom = isValidDateStr(fVal);
      const hasTo = isValidDateStr(tVal);
      acc.total_records++;
      const effectiveTo = hasTo ? tVal : (hasFrom ? today : null);
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

    // Summary counters (pending aged to today).
    const val = (k: string) => s(row[k]);
    const span = (fromK: string, endK: string): number | null => {
      const from = val(fromK);
      if (!isValidDateStr(from)) return null;
      const end = isValidDateStr(val(endK)) ? val(endK) : today;
      return wd(from, end);
    };

    const wdTotal = span('pre_alert_date', 'dispatch_deliver_date');
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
    const wdDW = span('drc_entry_date', 'warehouse_arrival_date');
    if (wdDW !== null && wdDW > 3) drcWhDelayed++;
    const wdDD = span('drc_entry_date', 'dispatch_deliver_date');
    if (wdDD !== null && wdDD > 5) drcDeliverDelayed++;
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
    total_imports: totalImports,
    fully_delivered: fullyDelivered,
    avg_total_days: cntTotal > 0 ? round1(sumTotal / cntTotal) : 0,
    avg_customs_days: cntCustoms > 0 ? round1(sumCustoms / cntCustoms) : 0,
    avg_dgda_to_liquid: cntDgdaLiq > 0 ? round1(sumDgdaLiq / cntDgdaLiq) : 0,
    avg_liquid_to_quittance: cntLiqQuitt > 0 ? round1(sumLiqQuitt / cntLiqQuitt) : 0,
    on_time_total: onTimeTotal,
    delayed_total: delayedTotal,
    dgda_liquid_delayed: dgdaLiqDelayed,
    liquid_quittance_delayed: liqQuittDelayed,
    drc_border_delayed: drcWhDelayed,
    drc_deliver_delayed: drcDeliverDelayed,
  };

  const client_delay_table: ClientRow[] = [...clientData.values()].map((cd) => {
    const r: ClientRow = {
      client_name: cd.client_name as string,
      total_imports: cd.total_imports as number,
      delivered_count: cd.delivered_count as number,
      on_time_count: cd.on_time_count as number,
      delayed_count: cd.delayed_count as number,
    };
    for (const alias of Object.values(CLIENT_STAGE_ALIASES)) {
      const cnt = cd[`${alias}_cnt`] as number;
      r[alias] = cnt > 0 ? round1((cd[`${alias}_sum`] as number) / cnt) : null;
    }
    return r;
  }).sort((a, b) => {
    const aN = a.avg_total === null ? 1 : 0, bN = b.avg_total === null ? 1 : 0;
    if (aN !== bN) return aN - bN;
    if (a.avg_total !== b.avg_total) return (Number(b.avg_total) || 0) - (Number(a.avg_total) || 0);
    return (b.total_imports as number) - (a.total_imports as number);
  });

  return { stage_kpis, priority_kpis, summary_kpis, bottleneck_analysis, client_delay_table };
}

// ---- stage drill-down records -----------------------------------------------

export async function getStageRecords(
  stageKey: string,
  f: ImkpiFilters,
  statusFilter: string,
): Promise<{ records: Record<string, unknown>[]; stage: string; threshold: number; today: string } | null> {
  const def = STAGE_DEFS.find((d) => d.key === stageKey);
  if (!def) return null;
  const holidays = await getHolidaySet();
  const wd = makeWorkingDays(holidays);
  const today = todayISO();

  const res = await db.execute(sql`
    SELECT i.id, i.mca_ref,
      COALESCE(c.short_name, c.company_name, 'N/A') AS client_short,
      COALESCE(cs.clearing_status,'Pending') AS clearing_status,
      COALESCE(tm.transport_mode_name,'N/A') AS transport_mode,
      COALESCE(k.kind_name,'N/A') AS kind_name,
      COALESCE(tg.goods_type,'N/A') AS goods_type,
      COALESCE(cm.clearance_name,'N/A') AS clearance_name,
      COALESCE(l.license_number,'—') AS license_number,
      COALESCE(mo.main_location_name,'—') AS declaration_office,
      COALESCE(i.supplier,'—') AS supplier,
      COALESCE(i.weight,0) AS weight, COALESCE(cur.currency_name,'') AS currency, COALESCE(i.fob,0) AS fob,
      to_char(i.${sql.raw(def.from)}, 'YYYY-MM-DD') AS stage_from_date,
      to_char(i.${sql.raw(def.to)}, 'YYYY-MM-DD') AS stage_to_date,
      to_char(i.pre_alert_date,'YYYY-MM-DD') AS pre_alert_date, to_char(i.arrival_date_zambia,'YYYY-MM-DD') AS arrival_date_zambia,
      to_char(i.dispatch_from_zambia,'YYYY-MM-DD') AS dispatch_from_zambia, to_char(i.drc_entry_date,'YYYY-MM-DD') AS drc_entry_date,
      to_char(i.border_warehouse_arrival_date,'YYYY-MM-DD') AS border_warehouse_arrival_date, to_char(i.dispatch_from_border,'YYYY-MM-DD') AS dispatch_from_border,
      to_char(i.kanyaka_arrival_date,'YYYY-MM-DD') AS kanyaka_arrival_date, to_char(i.kanyaka_dispatch_date,'YYYY-MM-DD') AS kanyaka_dispatch_date,
      to_char(i.warehouse_arrival_date,'YYYY-MM-DD') AS warehouse_arrival_date, to_char(i.warehouse_departure_date,'YYYY-MM-DD') AS warehouse_departure_date,
      to_char(i.dispatch_deliver_date,'YYYY-MM-DD') AS dispatch_deliver_date, to_char(i.dgda_in_date,'YYYY-MM-DD') AS dgda_in_date,
      to_char(i.dgda_out_date,'YYYY-MM-DD') AS dgda_out_date, to_char(i.liquidation_date,'YYYY-MM-DD') AS liquidation_date,
      to_char(i.quittance_date,'YYYY-MM-DD') AS quittance_date
    FROM imports_t i
    LEFT JOIN client_master_t c ON i.client_id = c.id AND c.display = 'Y'
    LEFT JOIN clearing_status_master_t cs ON i.clearing_status = cs.id AND cs.display = 'Y'
    LEFT JOIN transport_mode_master_t tm ON i.transport_mode = tm.id AND tm.display = 'Y'
    LEFT JOIN kind_master_t k ON i.kind = k.id AND k.display = 'Y'
    LEFT JOIN type_of_goods_master_t tg ON i.type_of_goods = tg.id AND tg.display = 'Y'
    LEFT JOIN clearance_master_t cm ON i.types_of_clearance = cm.id AND cm.display = 'Y'
    LEFT JOIN license_t l ON i.license_id = l.id AND l.display = 'Y'
    LEFT JOIN main_office_master_t mo ON i.declaration_office_id = mo.id AND mo.display = 'Y'
    LEFT JOIN currency_master_t cur ON i.currency = cur.id AND cur.display = 'Y'
    WHERE ${whereFilters(f)}
    ORDER BY i.id DESC
  `);

  const th = def.threshold;
  const out: Record<string, unknown>[] = [];
  for (const row of rows<Record<string, unknown>>(res)) {
    const fromDate = s(row.stage_from_date);
    const toDate = s(row.stage_to_date);
    const hasFrom = isValidDateStr(fromDate);
    const hasTo = isValidDateStr(toDate);
    const isPending = hasFrom && !hasTo;
    const effectiveTo = hasTo ? toDate : (hasFrom ? today : null);
    const days = hasFrom && effectiveTo ? wd(fromDate, effectiveTo) : null;
    const cal = hasFrom && effectiveTo ? calendarDays(fromDate, effectiveTo) : null;

    let status: 'On Time' | 'Delayed' | 'N/A';
    if (!hasFrom || days === null) status = 'N/A';
    else if (days <= th) status = 'On Time';
    else status = 'Delayed';

    if (statusFilter === 'on_time' && status !== 'On Time') continue;
    if (statusFilter === 'delayed' && status !== 'Delayed') continue;
    if (statusFilter === 'pending' && !isPending) continue;

    out.push({
      ...row,
      total_days: cal,
      days_taken: days,
      delay_days: days !== null && days > th ? days - th : null,
      delay_status: status,
      is_pending: isPending ? 1 : 0,
    });
  }

  out.sort((a, b) => {
    const aD = (a.days_taken as number) ?? -1;
    const bD = (b.days_taken as number) ?? -1;
    if (bD !== aD) return bD - aD;
    return (b.id as number) - (a.id as number);
  });

  return { records: out.slice(0, 500), stage: def.label, threshold: th, today };
}
