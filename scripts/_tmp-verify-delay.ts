import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
async function main(): Promise<void> {
  const r = async (q: string): Promise<unknown[]> => (await db.execute(sql.raw(q))).rows;
  console.log('OUT rules:', JSON.stringify(await r(
    `SELECT rule_key, module, transport_letter, start_field, end_field, target_days, day_basis, notify_days_before
       FROM delay_rule_master_t ORDER BY module, rule_key`)));
  console.log('OUT stage counts:', JSON.stringify(await r(
    `SELECT r.rule_key, count(s.id)::int AS stages FROM delay_rule_master_t r
       LEFT JOIN delay_rule_stage_t s ON s.rule_id = r.id GROUP BY r.rule_key ORDER BY r.rule_key`)));
  console.log('OUT events:', JSON.stringify(await r(
    `SELECT event_key, priority FROM notification_event_master_t WHERE event_key LIKE 'delay.%'`)));
  console.log('OUT menus:', JSON.stringify(await r(
    `SELECT m.menu_name, m.url, p.menu_name AS parent FROM menu_master_t m
       LEFT JOIN menu_master_t p ON p.id = m.menu_id
      WHERE m.url IN ('/delay-tracker','/masters/delay-rules')`)));
  console.log('OUT grants:', JSON.stringify(await r(
    `SELECT m.url, count(*)::int AS roles FROM role_menu_mapping_t rm
       JOIN menu_master_t m ON m.id = rm.menu_id
      WHERE m.url IN ('/delay-tracker','/masters/delay-rules') GROUP BY m.url`)));
  process.exit(0);
}
void main();
