-- Export + Import invoice tables (mirrors exportInvoices.ts + importInvoices.ts).
CREATE TABLE IF NOT EXISTS export_invoices_t (
  id serial PRIMARY KEY,
  client_id integer REFERENCES client_master_t(id),
  license_id integer REFERENCES license_t(id),
  kind_id integer, goods_type_id integer, transport_mode_id integer,
  invoice_ref varchar(100), invoice_date date,
  fob_usd numeric(15,2) DEFAULT 0, total_weight numeric(15,3) DEFAULT 0, total_duty_cdf numeric(18,2) DEFAULT 0,
  quotation_id integer, quotation_sub_total numeric(15,2), quotation_vat_amount numeric(15,2), quotation_total_amount numeric(15,2),
  arsp varchar(20) DEFAULT 'Disabled', dgi_code varchar(100), dgi_amount numeric(15,2) DEFAULT 0, normalized_by integer,
  validated integer NOT NULL DEFAULT 0, display varchar(1) NOT NULL DEFAULT 'Y',
  created_by integer REFERENCES users_t(id) ON DELETE SET NULL, updated_by integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_export_invoices_t_client ON export_invoices_t(client_id);
CREATE INDEX IF NOT EXISTS idx_export_invoices_t_validated ON export_invoices_t(validated);
CREATE INDEX IF NOT EXISTS idx_export_invoices_t_created_by ON export_invoices_t(created_by);

CREATE TABLE IF NOT EXISTS export_invoice_mca_details_t (
  id serial PRIMARY KEY, export_invoice_id integer NOT NULL, mca_id integer, display_order integer DEFAULT 0,
  lot_number varchar(255), declaration_no varchar(255), declaration_date date,
  liquidation_no varchar(255), liquidation_date date, liquidation_amount numeric(18,2) DEFAULT 0, liquidation_usd numeric(15,2) DEFAULT 0,
  quittance_no varchar(255), quittance_date date,
  horse varchar(100), trailer_1 varchar(100), trailer_2 varchar(100), container varchar(100), feet_container_id integer,
  weight numeric(15,3) DEFAULT 0, bcc_rate numeric(15,4) DEFAULT 0, buyer varchar(200),
  ceec_amount numeric(18,2) DEFAULT 0, cgea_amount numeric(18,2) DEFAULT 0, occ_amount numeric(18,2) DEFAULT 0,
  lmc_amount numeric(18,2) DEFAULT 0, ogefrem_amount numeric(18,2) DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eimd_invoice ON export_invoice_mca_details_t(export_invoice_id);
CREATE INDEX IF NOT EXISTS idx_eimd_mca ON export_invoice_mca_details_t(mca_id);

CREATE TABLE IF NOT EXISTS export_invoice_items_t (
  id serial PRIMARY KEY, export_invoice_id integer NOT NULL, quotation_item_id integer,
  category_id integer, category_name varchar(255), category_header varchar(255), display_order integer DEFAULT 999,
  item_id integer, item_name varchar(500), unit_id integer, unit_text varchar(100),
  quantity numeric(15,3) DEFAULT 1, taux_usd numeric(15,4) DEFAULT 0, cost_usd numeric(15,4) DEFAULT 0,
  currency_id integer, has_tva integer DEFAULT 0, tva_usd numeric(15,2) DEFAULT 0,
  subtotal_usd numeric(15,2) DEFAULT 0, total_usd numeric(15,2) DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eii_invoice ON export_invoice_items_t(export_invoice_id);

CREATE TABLE IF NOT EXISTS import_invoices_t (
  id serial PRIMARY KEY, client_id integer REFERENCES client_master_t(id),
  license_id integer, license_ids varchar(255), mca_id integer, mca_ids varchar(500),
  kind_id integer, goods_type_id integer, transport_mode_id integer,
  invoice_ref varchar(100), tally_ref varchar(100), dgi_amount numeric(15,2) DEFAULT 0, normalized_by integer,
  payment_method varchar(30) DEFAULT 'CREDIT',
  fob_currency_id integer, fob_usd numeric(15,2) DEFAULT 0, fret_currency_id integer, fret_usd numeric(15,2) DEFAULT 0,
  assurance_currency_id integer, assurance_usd numeric(15,2) DEFAULT 0, autres_charges_currency_id integer, autres_charges_usd numeric(15,2) DEFAULT 0,
  rate_cdf_inv numeric(15,6) DEFAULT 2500, rate_cdf_usd_bcc numeric(15,6) DEFAULT 2500, rate_cdf_client34 numeric(15,6),
  cif_usd numeric(15,2) DEFAULT 0, cif_cdf numeric(18,2) DEFAULT 0, total_duty_cdf numeric(18,2) DEFAULT 0,
  poids_kg numeric(15,2) DEFAULT 0, m3 numeric(15,2),
  tariff_code_client varchar(100), horse varchar(100), trailer_1 varchar(100), trailer_2 varchar(100), container varchar(100),
  wagon varchar(100), airway_bill varchar(100), airway_bill_weight numeric(15,2),
  facture_pfi_no varchar(100), po_ref varchar(100), bivac_inspection varchar(100), produit varchar(255), exoneration_code varchar(100),
  declaration_no varchar(100), declaration_date date, liquidation_no varchar(100), liquidation_date date,
  quittance_no varchar(100), quittance_date date, dispatch_deliver_date date,
  bank_id integer, quotation_id integer, quotation_sub_total numeric(15,2), quotation_vat_amount numeric(15,2), quotation_total_amount numeric(15,2),
  calculated_sub_total numeric(15,2) DEFAULT 0, calculated_vat_amount numeric(15,2) DEFAULT 0, calculated_total_amount numeric(15,2) DEFAULT 0, calculated_total_cdf numeric(18,2) DEFAULT 0,
  items_manually_edited integer DEFAULT 0, first_categoty_edited varchar(1) DEFAULT 'H', invoice_template varchar(5),
  arsp varchar(20) DEFAULT 'Disabled', hidden_categories text DEFAULT '[]',
  is_debited integer DEFAULT 0, is_invoiced integer DEFAULT 0,
  validated integer NOT NULL DEFAULT 0, display varchar(1) NOT NULL DEFAULT 'Y',
  created_by integer REFERENCES users_t(id) ON DELETE SET NULL, updated_by integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_invoices_t_client ON import_invoices_t(client_id);
CREATE INDEX IF NOT EXISTS idx_import_invoices_t_validated ON import_invoices_t(validated);
CREATE INDEX IF NOT EXISTS idx_import_invoices_t_created_by ON import_invoices_t(created_by);

CREATE TABLE IF NOT EXISTS import_invoice_items_t (
  id serial PRIMARY KEY, invoice_id integer NOT NULL, quotation_item_id integer,
  category_id integer, category_name varchar(255), category_header varchar(255),
  item_id integer, item_name varchar(500), item_description text,
  unit_id integer, unit_name varchar(100), unit_text varchar(100),
  quantity numeric(15,3) DEFAULT 1, taux_usd numeric(15,4) DEFAULT 0, cost_usd numeric(15,4) DEFAULT 0,
  currency_id integer, currency_short_name varchar(20), has_tva integer DEFAULT 0,
  tva_usd numeric(15,2) DEFAULT 0, subtotal_usd numeric(15,2) DEFAULT 0, total_usd numeric(15,2) DEFAULT 0,
  cif_split numeric(18,2) DEFAULT 0, percentage numeric(12,4) DEFAULT 0, rate_cdf numeric(18,2) DEFAULT 0,
  vat_cdf numeric(18,2) DEFAULT 0, total_cdf numeric(18,2) DEFAULT 0,
  sort_order integer DEFAULT 0, display varchar(1) NOT NULL DEFAULT 'Y',
  created_by integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iii_invoice ON import_invoice_items_t(invoice_id);
