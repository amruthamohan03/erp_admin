import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

const rows = (r: unknown): Array<Record<string, unknown>> =>
  (r as { rows?: Array<Record<string, unknown>> }).rows ?? [];

async function main(): Promise<void> {
  console.log('HEADERS', rows(await db.execute(sql`
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE display = 'Y')::int AS live,
           count(DISTINCT client_id)::int AS clients,
           count(DISTINCT kind_id)::int AS kinds,
           min(quotation_date)::text AS min_date,
           max(quotation_date)::text AS max_date,
           count(*) FILTER (WHERE quotation_date IS NULL)::int AS no_date,
           count(*) FILTER (WHERE arsp = 'Enabled')::int AS arsp_on,
           count(*) FILTER (WHERE total_amount_cdf IS NOT NULL)::int AS has_cdf,
           round(sum(total_amount)::numeric, 2)::text AS total_usd
      FROM quotations_t`))[0]);

  console.log('ITEMS', rows(await db.execute(sql`
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE display = 'Y')::int AS live,
           count(DISTINCT quotation_id)::int AS quotations,
           count(DISTINCT category_id)::int AS categories,
           count(DISTINCT item_id)::int AS items,
           count(*) FILTER (WHERE has_tva)::int AS with_tva
      FROM quotation_items_t`))[0]);

  console.log('--- categories');
  for (const r of rows(await db.execute(sql`
    SELECT c.id, c.category_name, c.is_customs, c.display,
           (SELECT count(*) FROM quotation_items_t i WHERE i.category_id = c.id)::int AS lines
      FROM quotation_category_master_t c ORDER BY c.id`))) console.log('   ', r);

  console.log('--- sample quotations');
  for (const r of rows(await db.execute(sql`
    SELECT q.id, q.quotation_ref, q.quotation_date, c.short_name AS client,
           k.kind_name, tm.transport_mode_name, tg.goods_type,
           q.sub_total, q.vat_amount, q.arsp_amount, q.total_amount, q.total_amount_cdf, q.arsp
      FROM quotations_t q
      LEFT JOIN client_master_t c ON c.id = q.client_id
      LEFT JOIN kind_master_t k ON k.id = q.kind_id
      LEFT JOIN transport_mode_master_t tm ON tm.id = q.transport_mode_id
      LEFT JOIN type_of_goods_master_t tg ON tg.id = q.goods_type_id
     WHERE q.display = 'Y' ORDER BY q.id DESC LIMIT 8`))) console.log('   ', r);

  // Is a quotation linked onward to an invoice? That would make a conversion KPI.
  console.log('--- columns referencing quotation');
  for (const r of rows(await db.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE column_name ILIKE '%quotation%' AND table_schema = 'public'
     ORDER BY table_name, column_name`))) console.log('   ', r.table_name, r.column_name);

  process.exit(0);
}

void main();
