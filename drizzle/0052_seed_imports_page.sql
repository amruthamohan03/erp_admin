-- §4.12 transactional page for imports_t (Import Tracking). 9 accordions mirror
-- the source form's field groups; EDIT granted to Super Admin (1) + Developer (52).
-- Idempotent via ON CONFLICT against the unique indexes from 0039.
--
-- Limitations vs source: the shared runtime renders a static form — no
-- transport-mode-based show/hide (air/road/rail groups), no MCA auto-generation,
-- no stat cards / bulk update (deferred). The internal `inv_export_disabled` flag
-- + remark are omitted from the form (columns still exist on imports_t).

DO $$
DECLARE
  v_page_id    INT;
  acc_basic    INT;
  acc_fin      INT;
  acc_crf      INT;
  acc_doc      INT;
  acc_customs  INT;
  acc_liq      INT;
  acc_air      INT;
  acc_route    INT;
  acc_status   INT;
BEGIN
  -- ====== Page ======
  INSERT INTO "master_page_t" ("slug", "title", "route", "target_table", "display_order", "display", "created_by", "updated_by")
  VALUES ('import', 'Import Tracking', '/import', 'imports_t', 3, 'Y', 1, 1)
  ON CONFLICT ("slug") DO UPDATE
    SET "title" = EXCLUDED."title", "route" = EXCLUDED."route",
        "target_table" = EXCLUDED."target_table", "updated_by" = EXCLUDED."updated_by", "updated_at" = now()
  RETURNING id INTO v_page_id;

  -- ====== Accordions ======
  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'basic','Basic Information','ti ti-info-circle',1,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_basic;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'financial','Financial Information','ti ti-currency-dollar',2,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_fin;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'crf-declaration','CRF & Declaration','ti ti-file-certificate',3,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_crf;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'transport-documents','Transport Documents','ti ti-truck-delivery',4,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_doc;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'customs-dgda','Customs / DGDA','ti ti-building-bank',5,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_customs;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'liquidation-quittance','Liquidation & Quittance','ti ti-receipt',6,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_liq;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'air-transport','Air Transport','ti ti-plane',7,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_air;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'routing-warehouse','Routing & Warehouse','ti ti-map-pin',8,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_route;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'status-remarks','Status & Remarks','ti ti-flag',9,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_status;

  -- ====== Role grants: Super Admin (1) + Developer (52) EDIT everywhere ======
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 1) THEN
    INSERT INTO "master_page_accordion_role_t" ("accordion_id","role_id","permission","created_by","updated_by")
    VALUES
      (acc_basic,1,'edit',1,1),(acc_fin,1,'edit',1,1),(acc_crf,1,'edit',1,1),(acc_doc,1,'edit',1,1),
      (acc_customs,1,'edit',1,1),(acc_liq,1,'edit',1,1),(acc_air,1,'edit',1,1),(acc_route,1,'edit',1,1),(acc_status,1,'edit',1,1)
    ON CONFLICT ("accordion_id","role_id") DO UPDATE SET "permission"=EXCLUDED."permission";
  ELSE
    RAISE WARNING 'role_master_t has no id=1 (Super Admin); grant import accordions manually.';
  END IF;

  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 52) THEN
    INSERT INTO "master_page_accordion_role_t" ("accordion_id","role_id","permission","created_by","updated_by")
    VALUES
      (acc_basic,52,'edit',1,1),(acc_fin,52,'edit',1,1),(acc_crf,52,'edit',1,1),(acc_doc,52,'edit',1,1),
      (acc_customs,52,'edit',1,1),(acc_liq,52,'edit',1,1),(acc_air,52,'edit',1,1),(acc_route,52,'edit',1,1),(acc_status,52,'edit',1,1)
    ON CONFLICT ("accordion_id","role_id") DO UPDATE SET "permission"=EXCLUDED."permission";
  ELSE
    RAISE WARNING 'role_master_t has no id=52 (Developer); grant import accordions manually.';
  END IF;

  -- ====== Fields: Basic Information ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_basic,'client_id','Client','select',true,'clients','short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_basic,'license_id','License','select',true,'licenses','license_number',NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_basic,'partial_id','Partial','select',false,'partials','partial_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,3),
    (acc_basic,'kind','Kind','select',false,'kinds','kind_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_basic,'type_of_goods','Type of Goods','select',false,'type-of-goods','goods_type',NULL,'{"colSpan":"5-per-row"}'::jsonb,5),
    (acc_basic,'transport_mode','Transport Mode','select',false,'transport-modes','transport_mode_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,6),
    (acc_basic,'mca_ref','MCA Reference','text',true,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,7),
    (acc_basic,'currency','Currency','select',false,'currencies','currency_short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,8),
    (acc_basic,'license_invoice_number','License Invoice Number','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,9),
    (acc_basic,'supplier','Supplier','text',false,NULL,NULL,NULL,'{"maxLength":255,"colSpan":"5-per-row"}'::jsonb,10),
    (acc_basic,'regime','Regime','select',false,'regimes','regime_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,11),
    (acc_basic,'types_of_clearance','Type of Clearance','select',false,'clearances','clearance_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,12),
    (acc_basic,'declaration_office_id','Declaration Office','select',false,'sub-offices','sub_office_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,13),
    (acc_basic,'pre_alert_date','Pre-Alert Date','date',true,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,14),
    (acc_basic,'invoice','Invoice Number','text',true,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,15),
    (acc_basic,'commodity','Commodity','select',false,'commodities','commodity_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,16),
    (acc_basic,'po_ref','PO Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,17)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Financial ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_fin,'fret','Fret','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,1),
    (acc_fin,'fret_currency','Fret Currency','select',false,'currencies','currency_short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_fin,'other_charges','Other Charges','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,3),
    (acc_fin,'other_charges_currency','Other Charges Currency','select',false,'currencies','currency_short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_fin,'weight','Weight','number',true,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,5),
    (acc_fin,'rem_weight','Remaining Weight','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,6),
    (acc_fin,'m3','M3','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,7),
    (acc_fin,'cession_date','Cession Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,8),
    (acc_fin,'fob','FOB','number',true,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,9),
    (acc_fin,'r_fob','R FOB','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,10),
    (acc_fin,'r_fob_currency','R FOB Currency','select',false,'currencies','currency_short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,11),
    (acc_fin,'fob_currency','FOB Currency','select',false,'currencies','currency_short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,12),
    (acc_fin,'insurance_date','Insurance Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,13),
    (acc_fin,'insurance_amount','Insurance Amount','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,14),
    (acc_fin,'insurance_amount_currency','Insurance Currency','select',false,'currencies','currency_short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,15),
    (acc_fin,'insurance_reference','Insurance Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,16)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: CRF & Declaration ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_crf,'crf_reference','CRF Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,1),
    (acc_crf,'crf_received_date','CRF Received Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_crf,'clearing_based_on','Clearing Based On','text',false,NULL,NULL,NULL,'{"maxLength":50,"colSpan":"5-per-row"}'::jsonb,3),
    (acc_crf,'ad_date','AD Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_crf,'inspection_reports','Inspection Reports','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,5),
    (acc_crf,'archive_reference','Archive Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,6),
    (acc_crf,'audited_date','Audited Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,7),
    (acc_crf,'archived_date','Archived Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,8)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Transport Documents ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_doc,'road_manif','Road Manifest','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,1),
    (acc_doc,'airway_bill','Airway Bill','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,2),
    (acc_doc,'container','Container','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,3),
    (acc_doc,'entry_point_id','Entry Point','select',false,'transit-points','transit_point_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_doc,'wagon','Wagon','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,5),
    (acc_doc,'airway_bill_weight','Airway Bill Weight','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,6),
    (acc_doc,'horse','Horse','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,7),
    (acc_doc,'trailer_1','Trailer 1','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,8),
    (acc_doc,'trailer_2','Trailer 2','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,9)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Customs / DGDA ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_customs,'dgda_in_date','DGDA In Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_customs,'declaration_reference','Declaration Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,2),
    (acc_customs,'segues_rcv_ref','SEGUCE Received Ref','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,3),
    (acc_customs,'segues_payment_date','SEGUCE Payment Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_customs,'customs_manifest_number','Customs Manifest Number','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,5),
    (acc_customs,'customs_manifest_date','Customs Manifest Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,6),
    (acc_customs,'customs_clearance_code','Customs Clearance Code','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,7),
    (acc_customs,'dgda_out_date','DGDA Out Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,8),
    (acc_customs,'document_status','Document Status','select',false,'document-statuses','document_status',NULL,'{"colSpan":"5-per-row"}'::jsonb,9),
    (acc_customs,'declaration_validity','Declaration Validity','text',false,NULL,NULL,NULL,'{"maxLength":50,"colSpan":"5-per-row"}'::jsonb,10),
    (acc_customs,'t1_number','T1 Number','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,11),
    (acc_customs,'t1_date','T1 Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,12)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Liquidation & Quittance ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_liq,'liquidation_reference','Liquidation Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,1),
    (acc_liq,'liquidation_date','Liquidation Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_liq,'liquidation_paid_by','Liquidation Paid By','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,3),
    (acc_liq,'liquidation_amount','Liquidation Amount','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,4),
    (acc_liq,'quittance_reference','Quittance Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,5),
    (acc_liq,'quittance_date','Quittance Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,6)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Air Transport ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_air,'airport_arrival_date','Airport Arrival Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_air,'dispatch_from_airport','Dispatch From Airport','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_air,'operating_company','Operating Company','text',false,NULL,NULL,NULL,'{"maxLength":50,"colSpan":"5-per-row"}'::jsonb,3),
    (acc_air,'operating_days','Operating Days','number',false,NULL,NULL,NULL,'{"min":0,"colSpan":"5-per-row"}'::jsonb,4),
    (acc_air,'operating_amount','Operating Amount','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,5)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Routing & Warehouse ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_route,'arrival_date_zambia','Arrival Date (Zambia)','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_route,'dispatch_from_zambia','Dispatch From Zambia','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_route,'drc_entry_date','DRC Entry Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,3),
    (acc_route,'border_warehouse_arrival_date','Border Warehouse Arrival','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_route,'dispatch_from_border','Dispatch From Border','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,5),
    (acc_route,'kanyaka_arrival_date','Kanyaka Arrival Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,6),
    (acc_route,'kanyaka_dispatch_date','Kanyaka Dispatch Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,7),
    (acc_route,'warehouse_arrival_date','Warehouse Arrival Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,8),
    (acc_route,'warehouse_departure_date','Warehouse Departure Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,9),
    (acc_route,'dispatch_deliver_date','Dispatch/Deliver Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,10),
    (acc_route,'ibs_coupon_reference','IBS Coupon Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,11),
    (acc_route,'border_warehouse_id','Border Warehouse','select',false,'transit-points','transit_point_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,12),
    (acc_route,'entry_coupon','Entry Coupon','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,13),
    (acc_route,'bonded_warehouse_id','Bonded Warehouse','select',false,'transit-points','transit_point_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,14),
    (acc_route,'truck_status','Truck Status','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,15)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Status & Remarks ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_status,'clearing_status','Clearing Status','select',true,'clearing-statuses','clearing_status',NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_status,'remarks','Remarks','textarea',false,NULL,NULL,NULL,'{"maxLength":2000,"rows":3,"colSpan":"12"}'::jsonb,2)
  ON CONFLICT ("accordion_id","name") DO NOTHING;
END $$;
