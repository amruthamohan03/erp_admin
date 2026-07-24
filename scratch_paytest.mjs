import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  // sample data if empty
  const { rows:[cnt] } = await c.query(`SELECT count(*)::int n FROM payment_request_t`);
  if (cnt.n === 0) {
    const { rows:[dep] } = await c.query(`SELECT id FROM department_master_t LIMIT 1`);
    const { rows:[loc] } = await c.query(`SELECT id FROM main_office_master_t LIMIT 1`);
    const { rows:[cur] } = await c.query(`SELECT id FROM currency_master_t LIMIT 1`);
    const { rows:[ex] } = await c.query(`SELECT id FROM expense_type_master_t LIMIT 1`);
    const { rows:[cl] } = await c.query(`SELECT id FROM client_master_t WHERE display='Y' LIMIT 1`);
    const mca = JSON.stringify([{mca_ref:'MCA-001', amount:500},{mca_ref:'MCA-002', amount:500}]);
    // pending-dept cash
    await c.query(`INSERT INTO payment_request_t (beneficiary, requestee, department, location_id, client_id, pay_for, currency, amount, payment_type, expense_type, motif, mca_ref, mca_data, created_by)
      VALUES ('Acme Ltd','Test User',$1,$2,$3,0,$4,1000,'Cash',$5,'Office supplies for Q3','MCA-001',$6::jsonb,1)`, [dep.id, loc.id, cl?.id ?? null, cur.id, ex.id, mca]);
    // fully paid bank
    await c.query(`INSERT INTO payment_request_t (beneficiary, requestee, department, location_id, client_id, pay_for, currency, amount, payment_type, expense_type, motif, created_by, dept_approval, finance_approval, management_approval, under_process, paid_approval, cash_collector)
      VALUES ('Beta SARL','Test User',$1,$2,$3,1,$4,2500,'Bank',$5,'Freight settlement',1,1,1,1,1,1,'J. Cashier')`, [dep.id, loc.id, cl?.id ?? null, cur.id, ex.id]);
    console.log('seeded 2 sample payments');
  }
  // test status counts (visibility=all)
  const sc = await c.query(`
    SELECT COUNT(*)::int total,
      SUM(CASE WHEN pr.dept_approval IS NULL AND COALESCE(pr.finance_approval,0)!=-1 AND COALESCE(pr.management_approval,0)!=-1 AND COALESCE(pr.under_process,0)!=-1 AND COALESCE(pr.paid_approval,0)!=-1 THEN 1 ELSE 0 END)::int waiting_dept,
      SUM(CASE WHEN pr.paid_approval=1 THEN 1 ELSE 0 END)::int paid
    FROM payment_request_t pr WHERE TRUE`);
  console.log('status counts:', sc.rows[0]);
  // test list join + mca_count
  const li = await c.query(`SELECT pr.id, pr.requestee, c.short_name client_name, ex.expense_type_name, COALESCE(jsonb_array_length(pr.mca_data),0)::int mca_count, pr.paid_approval
    FROM payment_request_t pr LEFT JOIN client_master_t c ON c.id=pr.client_id LEFT JOIN expense_type_master_t ex ON ex.id=pr.expense_type ORDER BY pr.id DESC`);
  console.table(li.rows);
  // dashboard monthly + status
  const st = await c.query(`SELECT label status_name, COUNT(*)::int count FROM (
    SELECT CASE WHEN paid_approval=1 THEN 'Paid' WHEN dept_approval=1 THEN 'Pending Finance' ELSE 'Pending Dept' END label FROM payment_request_t) s GROUP BY label`);
  console.log('status cards:', st.rows);
  console.log('ALL PAYMENT SQL OK');
} catch(e){ console.error('FAILED', e.code, e.message); process.exitCode=1; }
await c.end();
