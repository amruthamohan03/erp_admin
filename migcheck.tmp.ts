import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
(async () => {
  const m = await db.execute(sql`
    SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`);
  console.log('applied migrations:', (m as never as { rows: { applied: number }[] }).rows[0]?.applied);
  const f = await db.execute(sql`
    SELECT f.derive->>'editable' AS editable, f.props->>'readOnly' AS read_only,
           f.props->>'readonly' AS dead_key
      FROM master_page_accordion_field_t f
      JOIN master_page_accordion_t a ON a.id = f.accordion_id
      JOIN master_page_t p ON p.id = a.page_id
     WHERE p.slug = 'payment' AND f.name = 'requestee'`);
  console.log('requestee now:', JSON.stringify((f as never as { rows: unknown[] }).rows[0]));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message); process.exit(1); });
