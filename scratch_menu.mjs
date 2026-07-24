import { config } from 'dotenv'; config({ path: '.env.local' });
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const PARENT = 183; // Invoice Management
async function menu(name, url, order, icon) {
  const ex = await c.query(`SELECT id FROM menu_master_t WHERE url=$1 LIMIT 1`, [url]);
  if (ex.rows[0]) {
    await c.query(`UPDATE menu_master_t SET menu_name=$1, menu_id=$2, menu_order=$3, menu_level=1, icon=$4, display='Y' WHERE id=$5`,
      [name, PARENT, order, icon, ex.rows[0].id]);
    return ex.rows[0].id;
  }
  const r = await c.query(`INSERT INTO menu_master_t (menu_id, menu_order, menu_level, menu_name, url, text, icon, display, created_by)
    VALUES ($1,$2,1,$3,$4,$3,$5,'Y',1) RETURNING id`, [PARENT, order, name, url, icon]);
  return r.rows[0].id;
}
async function grant(menuId) {
  // Super Admin(1) full; Manager(3) + Accounts Officer(5) all but delete.
  const rows = [
    [1, true, true, true, true, true],
    [3, true, true, true, false, true],
    [5, true, true, true, false, true],
  ];
  for (const [role, v, a, e, d, ap] of rows) {
    const ex = await c.query(`SELECT id FROM role_menu_mapping_t WHERE role_id=$1 AND menu_id=$2 LIMIT 1`, [role, menuId]);
    if (ex.rows[0]) {
      await c.query(`UPDATE role_menu_mapping_t SET can_view=$1,can_add=$2,can_edit=$3,can_delete=$4,can_approve=$5 WHERE id=$6`,
        [v, a, e, d, ap, ex.rows[0].id]);
    } else {
      await c.query(`INSERT INTO role_menu_mapping_t (role_id,menu_id,can_view,can_add,can_edit,can_delete,can_approve,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,1)`, [role, menuId, v, a, e, d, ap]);
    }
  }
}
try {
  await c.query('BEGIN');
  const em = await menu('Export Invoice', '/export-invoices', 3, 'ti ti-file-invoice');
  const im = await menu('Import Invoice', '/import-invoices', 4, 'ti ti-file-invoice');
  await grant(em); await grant(im);
  await c.query('COMMIT');
  const r = await c.query(`SELECT id, menu_name, url, menu_id, menu_order FROM menu_master_t WHERE url IN ('/export-invoices','/import-invoices') ORDER BY menu_order`);
  console.table(r.rows);
} catch(e){ await c.query('ROLLBACK'); console.error('FAILED', e.code, e.message); process.exitCode=1; }
await c.end();
