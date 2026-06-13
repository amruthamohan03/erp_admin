-- §4.12 transactional page for exports_t (Export Tracking). 6 accordions mirror
-- the legacy export form's field groups; EDIT granted to Super Admin (1) +
-- Developer (52). Idempotent via ON CONFLICT against the unique indexes from 0039.
-- Conditions (transport-mode show/hide, date bounds) are seeded in 0066; derives
-- (license auto-fill, MCA ref, charge auto-calc) in 0067 / 0069.

DO $$
DECLARE
  v_page_id     INT;
  acc_doc       INT;
  acc_transport INT;
  acc_dates     INT;
  acc_charges   INT;
  acc_decl      INT;
  acc_logi      INT;
BEGIN
  -- ====== Page ======
  INSERT INTO "master_page_t" ("slug","title","route","target_table","display_order","display","created_by","updated_by")
  VALUES ('export','Export Tracking','/export','exports_t',4,'Y',1,1)
  ON CONFLICT ("slug") DO UPDATE
    SET "title"=EXCLUDED."title","route"=EXCLUDED."route",
        "target_table"=EXCLUDED."target_table","updated_by"=EXCLUDED."updated_by","updated_at"=now()
  RETURNING id INTO v_page_id;

  -- ====== Accordions ======
  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'documentation','Documentation','ti ti-file-text',1,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_doc;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'transport','Transport','ti ti-truck',2,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_transport;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'shipment-dates','Shipment Dates & Seals','ti ti-calendar',3,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_dates;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'charges','Charges','ti ti-coin',4,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_charges;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'declaration','Declaration','ti ti-file-certificate',5,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_decl;

  INSERT INTO "master_page_accordion_t" ("page_id","slug","title","icon","display_order","display","created_by","updated_by")
  VALUES (v_page_id,'logistics','Logistics','ti ti-map-pin',6,'Y',1,1)
  ON CONFLICT ("page_id","slug") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon" RETURNING id INTO acc_logi;

  -- ====== Role grants: Super Admin (1) + Developer (52) EDIT everywhere ======
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 1) THEN
    INSERT INTO "master_page_accordion_role_t" ("accordion_id","role_id","permission","created_by","updated_by")
    VALUES
      (acc_doc,1,'edit',1,1),(acc_transport,1,'edit',1,1),(acc_dates,1,'edit',1,1),
      (acc_charges,1,'edit',1,1),(acc_decl,1,'edit',1,1),(acc_logi,1,'edit',1,1)
    ON CONFLICT ("accordion_id","role_id") DO UPDATE SET "permission"=EXCLUDED."permission";
  ELSE
    RAISE WARNING 'role_master_t has no id=1 (Super Admin); grant export accordions manually.';
  END IF;

  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 52) THEN
    INSERT INTO "master_page_accordion_role_t" ("accordion_id","role_id","permission","created_by","updated_by")
    VALUES
      (acc_doc,52,'edit',1,1),(acc_transport,52,'edit',1,1),(acc_dates,52,'edit',1,1),
      (acc_charges,52,'edit',1,1),(acc_decl,52,'edit',1,1),(acc_logi,52,'edit',1,1)
    ON CONFLICT ("accordion_id","role_id") DO UPDATE SET "permission"=EXCLUDED."permission";
  ELSE
    RAISE WARNING 'role_master_t has no id=52 (Developer); grant export accordions manually.';
  END IF;

  -- ====== Fields: Documentation ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_doc,'client_id','Client','select',true,'clients','short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_doc,'license_id','License Number','select',true,'licenses','license_number',NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_doc,'kind','Kind','select',false,'kinds','kind_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,3),
    (acc_doc,'type_of_goods','Type of Goods','select',false,'type-of-goods','goods_type',NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_doc,'transport_mode','Transport Mode','select',false,'transport-modes','transport_mode_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,5),
    (acc_doc,'mca_ref','MCA Reference','text',true,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,6),
    (acc_doc,'currency','Currency','select',false,'currencies','currency_short_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,7),
    (acc_doc,'buyer','Buyer','text',false,NULL,NULL,NULL,'{"maxLength":255,"colSpan":"5-per-row"}'::jsonb,8),
    (acc_doc,'regime','Regime','select',true,'regimes','regime_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,9),
    (acc_doc,'types_of_clearance','Types of Clearance','select',true,'clearances','clearance_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,10),
    (acc_doc,'bp_no','BP Number','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,11),
    (acc_doc,'invoice','Invoice','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,12),
    (acc_doc,'po_ref','PO Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,13),
    (acc_doc,'weight','Weight (MT)','number',true,NULL,NULL,NULL,'{"min":0,"step":"0.001","colSpan":"5-per-row"}'::jsonb,14),
    (acc_doc,'fob','FOB','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,15),
    (acc_doc,'transporter','Transporter','text',false,NULL,NULL,NULL,'{"maxLength":255,"colSpan":"5-per-row"}'::jsonb,16)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Transport ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_transport,'horse','Horse','text',false,NULL,NULL,NULL,'{"maxLength":50,"colSpan":"5-per-row"}'::jsonb,1),
    (acc_transport,'trailer_1','Trailer 1','text',false,NULL,NULL,NULL,'{"maxLength":50,"colSpan":"5-per-row"}'::jsonb,2),
    (acc_transport,'trailer_2','Trailer 2','text',false,NULL,NULL,NULL,'{"maxLength":50,"colSpan":"5-per-row"}'::jsonb,3),
    (acc_transport,'feet_container','Feet Container','select',false,'feet-containers','feet_container_size',NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_transport,'wagon_ref','Wagon Reference','text',false,NULL,NULL,NULL,'{"maxLength":50,"colSpan":"5-per-row"}'::jsonb,5),
    (acc_transport,'container','Container','text',false,NULL,NULL,NULL,'{"maxLength":50,"colSpan":"5-per-row"}'::jsonb,6),
    (acc_transport,'site_of_loading_id','Site of Loading','select',false,'transit-points','transit_point_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,7),
    (acc_transport,'destination','Destination','text',false,NULL,NULL,NULL,'{"maxLength":255,"colSpan":"5-per-row"}'::jsonb,8)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Shipment Dates & Seals ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_dates,'loading_date','Loading Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_dates,'pv_date','PV Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_dates,'bp_date','BP Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,3),
    (acc_dates,'demande_attestation_date','Demande d''Attestation','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_dates,'assay_date','Assay Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,5),
    (acc_dates,'lot_number','Lot Number','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,6),
    (acc_dates,'dgda_seal_no','DGDA Seal No','text',false,NULL,NULL,NULL,'{"maxLength":255,"colSpan":"5-per-row"}'::jsonb,7),
    (acc_dates,'number_of_seals','No. of Seals','number',false,NULL,NULL,NULL,'{"min":0,"colSpan":"5-per-row"}'::jsonb,8),
    (acc_dates,'number_of_bags','Number of Bags','number',false,NULL,NULL,NULL,'{"min":0,"colSpan":"5-per-row"}'::jsonb,9),
    (acc_dates,'archive_reference','Archive Reference','text',false,NULL,NULL,NULL,'{"maxLength":255,"colSpan":"5-per-row"}'::jsonb,10)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Charges (auto-calc derive added in 0069) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_charges,'ceec_amount','CEEC Amount (USD)','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,1),
    (acc_charges,'cgea_amount','CGEA Amount (USD)','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,2),
    (acc_charges,'occ_amount','OCC Amount (USD)','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,3),
    (acc_charges,'lmc_amount','LMC Amount (USD)','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,4),
    (acc_charges,'ogefrem_amount','OGEFREM Amount (USD)','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,5)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Declaration ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_decl,'ceec_in_date','CEEC In','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_decl,'ceec_out_date','CEEC Out','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_decl,'min_div_in_date','Min Div In','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,3),
    (acc_decl,'min_div_out_date','Min Div Out','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_decl,'cgea_doc_ref','CGEA Doc Ref','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,5),
    (acc_decl,'segues_rcv_ref','Segues RCV Ref','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,6),
    (acc_decl,'segues_payment_date','Segues Payment Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,7),
    (acc_decl,'document_status','Document Status','select',false,'document-statuses','document_status',NULL,'{"colSpan":"5-per-row"}'::jsonb,8),
    (acc_decl,'customs_clearing_code','Customs Clearing Code','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,9),
    (acc_decl,'dgda_in_date','DGDA In Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,10),
    (acc_decl,'declaration_reference','Declaration Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,11),
    (acc_decl,'liquidation_reference','Liquidation Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,12),
    (acc_decl,'liquidation_date','Liquidation Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,13),
    (acc_decl,'liquidation_paid_by','Liquidation Paid By','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,14),
    (acc_decl,'liquidation_amount','Liquidation Amount','number',false,NULL,NULL,NULL,'{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb,15),
    (acc_decl,'quittance_reference','Quittance Reference','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,16),
    (acc_decl,'quittance_date','Quittance Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,17),
    (acc_decl,'dgda_out_date','DGDA Out Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,18),
    (acc_decl,'gov_docs_in_date','Gov Docs In','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,19),
    (acc_decl,'gov_docs_out_date','Gov Docs Out','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,20),
    (acc_decl,'clearing_status','Declaration Status','select',false,'clearing-statuses','clearing_status',NULL,'{"colSpan":"5-per-row"}'::jsonb,21)
  ON CONFLICT ("accordion_id","name") DO NOTHING;

  -- ====== Fields: Logistics ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id","name","label","field_type","required","options_source","options_label_field","options_static","props","display_order")
  VALUES
    (acc_logi,'dispatch_deliver_date','Dispatch/Deliver Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,1),
    (acc_logi,'kanyaka_arrival_date','Kanyaka Arrival Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,2),
    (acc_logi,'kanyaka_departure_date','Kanyaka Departure Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,3),
    (acc_logi,'border_arrival_date','Border Arrival','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,4),
    (acc_logi,'exit_drc_date','Exit DRC Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,5),
    (acc_logi,'exit_point_id','Exit Point','select',false,'transit-points','transit_point_name',NULL,'{"colSpan":"5-per-row"}'::jsonb,6),
    (acc_logi,'end_of_formalities_date','End of Formalities Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,7),
    (acc_logi,'truck_status','Truck Status','select',false,'truck-statuses','truck_status',NULL,'{"colSpan":"5-per-row"}'::jsonb,8),
    (acc_logi,'lmc_id','LMC ID','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,9),
    (acc_logi,'ogefrem_inv_ref','OGEFREM Inv.Ref.','text',false,NULL,NULL,NULL,'{"maxLength":100,"colSpan":"5-per-row"}'::jsonb,10),
    (acc_logi,'loading_to_dispatch_date','Loading to Dispatch Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,11),
    (acc_logi,'lmc_date','LMC Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,12),
    (acc_logi,'ogefrem_date','OGEFREM Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,13),
    (acc_logi,'audited_date','Audited Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,14),
    (acc_logi,'archived_date','Archived Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}'::jsonb,15),
    (acc_logi,'remarks','Remarks','textarea',false,NULL,NULL,NULL,'{"maxLength":2000,"rows":3,"colSpan":"12"}'::jsonb,16)
  ON CONFLICT ("accordion_id","name") DO NOTHING;
END $$;
