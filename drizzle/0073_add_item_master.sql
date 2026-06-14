-- Item / service master (charges for quotations & Fiche de Calcul). Mirrors the
-- source item_master_t. Conversions: bigint->serial, enum->varchar (the app
-- validates the allowed values), category_id is a real FK to the quotation category
-- master (0072 must run first). Mojibake accents from the source dump are restored
-- to proper UTF-8 French. Seeded with explicit ids (gaps 126/137 are intentional —
-- absent in the source). Idempotent via ON CONFLICT (id).

CREATE TABLE IF NOT EXISTS "item_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_name" varchar(255) NOT NULL,
  "item_code" varchar(50),
  "category_id" integer REFERENCES "quotation_category_master_t"("id"),
  "tax_not_tax" varchar(1) NOT NULL DEFAULT 'A',
  "percentage" numeric(10,2) DEFAULT 0,
  "item_type" varchar(3) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_item_master_t_category" ON "item_master_t" ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_item_master_t_type" ON "item_master_t" ("item_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_item_master_t_display" ON "item_master_t" ("display");
--> statement-breakpoint

INSERT INTO "item_master_t"
  ("id","item_name","item_code","category_id","tax_not_tax","percentage","item_type","created_by","updated_by")
VALUES
  (1,'DGDA Import Duties / Droit de Douane a l Import (DDI)','SER',1,'J',0.00,'I',1,1),
  (2,'DGDA Import Duties / Droit de Douane a l Import (DDI) 1','SER',1,'J',0.00,'I',1,1),
  (3,'DGDA Import Duties / Droit de Douane a l Import (DDI) 3','SER',1,'J',0.00,'I',1,1),
  (4,'DGDA Import Duties / Droit de Douane a l Import (DDI) 4','SER',1,'J',0.00,'I',1,1),
  (5,'Taxe Promotion de l entreprise (TPI)','SER',1,'J',0.00,'I',1,1),
  (6,'Redevance Remuneratoire Informatique a l Import (RII)','SER',1,'J',0.00,'I',1,1),
  (7,'Commission OGEFREM (COG)','SER',1,'J',0.00,'I',1,1),
  (8,'REDEVANCE LOGISTIQUE TERRESTRE SNCC (RLS)','SER',1,'J',0.00,'I',1,1),
  (9,'Droit d Accise a l import (DCI)','SER',1,'J',0.00,'I',1,1),
  (10,'Taxe Controle Prod. Toxiques  Sopor (QPT)','SER',1,'J',0.00,'IE',1,1),
  (11,'Retribution Sur Commission Ogefrem (ROC)','SER',1,'J',0.00,'I',1,1),
  (12,'Comite de Suivi OGEFREM DGDA (CSO)','SER',1,'J',0.00,'I',1,1),
  (13,'Bivac IR','SER',1,'J',0.00,'I',1,1),
  (14,'NAC (Applicable pour les produits toxiques)','SER',1,'J',0.00,'I',1,1),
  (15,'Autres taxes/Ref Liquidation','SER',1,'J',0.00,'I',1,1),
  (16,'Frais d Agence','SER',4,'B',16.00,'IU',1,1),
  (17,'Operation DGDA','SER',3,'B',16.00,'I',1,1),
  (18,'Operation Cost','SER',3,'B',16.00,'I',1,1),
  (19,'Application License','SER',3,'B',16.00,'I',1,1),
  (20,'Frais Seguce','SER',2,'J',0.00,'I',1,1),
  (21,'Scelles Electroniques','SER',2,'J',0.00,'I',1,1),
  (22,'Frais de transite (TR8/TR1-Declarations)','SER',3,'B',16.00,'I',1,1),
  (23,'Frais Bancaires','SER',2,'J',0.00,'I',1,1),
  (24,'Laisser-Suivre','SER',3,'B',16.00,'I',1,1),
  (25,'Emergency Removal','SER',3,'B',16.00,'I',1,1),
  (26,'Technical Fee DGDA  Other Services','SER',3,'B',16.00,'I',1,1),
  (27,'Offloading Assistance','SER',3,'B',16.00,'I',1,1),
  (28,'Enlevement d urgence','SER',3,'B',16.00,'I',1,1),
  (29,'Transit and Other Charges ex-Kelsa to bond store','SER',3,'B',16.00,'I',1,1),
  (30,'IB License Closure with BCC','SER',3,'B',16.00,'I',1,1),
  (31,'Declaration with BV/IR and Modification to CRF','SER',3,'B',16.00,'I',1,1),
  (32,'Couts operationels : DGDA et Autres services','SER',3,'B',16.00,'I',1,1),
  (33,'Operations : DGDA et  Other State Services','SER',3,'B',16.00,'I',1,1),
  (34,'Scelle electronique + SEGUCE + Frais bancaires','SER',2,'J',0.00,'I',1,1),
  (35,'IB License application/BV suivi et cloture','SER',3,'B',16.00,'I',1,1),
  (36,'Border Clearance - Kelsa/Mokambo/Sakania','SER',3,'B',16.00,'I',1,1),
  (37,'NAC-PNHF','SER',2,'J',0.00,'I',1,1),
  (38,'SWIFT AIR','SER',2,'J',0.00,'I',1,1),
  (39,'LTA','SER',2,'J',0.00,'I',1,1),
  (40,'Ouverture dossier','SER',3,'B',16.00,'I',1,1),
  (41,'CONTRACTOR AGENCY FEE / FRAIS D AGENCE','SER',4,'B',16.00,'E',1,1),
  (42,'KASUMBALEA BORDER CHARGES / FORMALITES FRONTIERE KASUMBALESA','SER',3,'B',16.00,'E',1,1),
  (43,'OPERATIONS COST : OCC FEES / COUT OPERATIONNEL FRAIS OCC','SER',3,'B',16.00,'E',1,1),
  (44,'OPERATIONS COST : MINE POLICE / COUT OPERATIONNEL POLICE DES MINES','SER',3,'B',16.00,'E',1,1),
  (45,'OPERATIONS COST : ANR / COUT OPERATIONNEL ANR','SER',3,'B',16.00,'E',1,1),
  (46,'OPERATIONS COST : DGDA / COUT OPERATIONNEL DGDA','SER',3,'B',16.00,'E',1,1),
  (47,'OPERATIONS COST : PRINTING AND STATIONERY / FRAIS ADMINISTRATIFS','SER',3,'B',16.00,'E',1,1),
  (48,'OPERATIONS COST : KISANGA TOLL GATES / COUT OPERATIONNEL PEAGE','SER',3,'B',16.00,'E',1,1),
  (49,'TRANSFER FEE / FRAIS DE TRANSFERT','SER',3,'B',16.00,'E',1,1),
  (50,'MINE DIVISION /DIVISION DES MINES','SER',3,'B',16.00,'E',1,1),
  (51,'COMMERCE EXTERIOR / COMMERCE EXTERIEUR','SER',3,'B',16.00,'E',1,1),
  (52,'OCC FEES / FRAIS OCC','SER',1,'J',0.00,'E',1,1),
  (53,'FRAIS BANCAIRS','SER',2,'J',0.00,'E',1,1),
  (54,'OPERATIONS et OTHER SERVICES COST','SER',3,'B',16.00,'IE',1,1),
  (55,'OPERATIONS COST : SNCC LUBUMBASHI STATION/ COUT OPERATIONNEL','SER',3,'B',16.00,'E',1,1),
  (56,'KASUMBALEA BORDER CHARGES / FORMALITES FRONTIERE SAKANIA','SER',3,'B',16.00,'E',1,1),
  (57,'OPERATIONS COST : CEEC FEES / COUT OPERATIONNEL FRAIS CEEC','SER',3,'B',16.00,'E',1,1),
  (58,'REDEVANCE REMUNERATOIRE INFORMATIQUE A L   EXPORT (RIE)','SER',1,'J',0.00,'E',1,1),
  (59,'REDEVANCE LOGISTIQUE TERRESTRE SNCC (RLS)','SER',1,'J',0.00,'E',1,1),
  (60,'FRAIS SERVICES RENDUS PROD. MINIERS (FSR)','SER',1,'J',0.00,'E',1,1),
  (61,'FICHE ELECTRONIQUE DE RENSEIGNEMENT A L EXPORTATION','SER',1,'J',0.00,'E',1,1),
  (62,'LIGNE MARITIME CONGOLAISE (LMC)','SER',1,'J',0.00,'E',1,1),
  (63,'GOVERNORS TAX($50/MT) / TAXE VOIRIE','SER',1,'J',0.00,'E',1,1),
  (64,'OCC : SAMPLING / ECHATILLIONNAGE OCC','SER',1,'J',0.00,'E',1,1),
  (65,'OCC/CGEA : RADIO ACTIVITY TEST / RADIO ACTIVITE OCC/CGEA','SER',1,'J',0.00,'E',1,1),
  (66,'CEEC CERTIFICATE / CERTIFICAT CEEC (30MT to 60MT) - WEF 13/12/2017','SER',1,'J',0.00,'E',1,1),
  (67,'DGDA SECURITY SEALS / FRAIS DE PLOMB DGDA','SER',1,'J',0.00,'E',1,1),
  (68,'ASSAY FEE / FRAIS LABO','SER',1,'J',0.00,'E',1,1),
  (69,'FINANCE COST 1% DROIT DE DOUANE ET TAXES','SER',1,'J',0.00,'E',1,1),
  (70,'SEGUCE CHARGES','SER',1,'J',0.00,'E',1,1),
  (71,'LOCATION SCELLE ELECTRONIQUE','SER',1,'J',0.00,'E',1,1),
  (72,'ELECTRONIC SEAL ACTIVATION CHARGES','SER',1,'J',0.00,'E',1,1),
  (73,'DROIT DE DOUANE A L et EXPORT (DDE)','SER',1,'J',0.00,'E',1,1),
  (74,'OGEFREM: Conteneur 20','SER',1,'J',0.00,'E',1,1),
  (75,'OGEFREM: Conteneur 40','SER',1,'J',0.00,'E',1,1),
  (76,'CEEC CERTIFICATE / CERTIFICAT CEEC (LESS THAN 30MT)','SER',1,'J',0.00,'E',1,1),
  (77,'Frais Entreposage','SER',2,'J',0.00,'I',1,1),
  (78,'DGDA Escort/ Electronic Seal','SER',3,'B',16.00,'I',1,1),
  (79,'Direct Delivery to site/Dechargement a domicile','SER',3,'B',16.00,'I',1,1),
  (80,'Formalites de dedouanement et de transit','SER',3,'B',16.00,'I',1,1),
  (81,'Border Clearence (TR8/T1-Declarations)','SER',3,'B',16.00,'I',1,1),
  (82,'Prise en charge a et aeroport (Laisser Suivre )','SER',3,'B',16.00,'I',1,1),
  (83,'International Operations Cost','SER',4,'B',16.00,'I',1,1),
  (84,'Formalites a la frontiere et transfert','SER',3,'B',16.00,'I',1,1),
  (85,'Autorisation Temporaire - DGDA','SER',3,'B',16.00,'I',1,1),
  (86,'Frais Interne - Opérationnels','SER',3,'B',16.00,'I',1,1),
  (87,'Comite de Suivi OGEFREM (RCO)','SER',1,'J',0.00,'I',1,1),
  (88,'Retribution DGDA/ Partenaires (RET)','SER',1,'J',0.00,'I',1,1),
  (89,'Retenue ANAPI 4% de 5% TPI (RAN)','SER',1,'J',0.00,'I',1,1),
  (90,'ANAPI 96% de 5% TPI (ANA)','SER',1,'J',0.00,'I',1,1),
  (91,'Frais Labo OCC (LAB)','SER',1,'J',0.00,'I',1,1),
  (92,'Frais Labo OCC (LAB)','SER',1,'J',0.00,'I',1,1),
  (93,'Retenue 0.3% sur frais OCC (ROC)','SER',1,'J',0.00,'I',1,1),
  (94,'Redv Superv Securite fret aerien (RSF)','SER',1,'J',0.00,'I',1,1),
  (95,'Retribution sur RSF (RRS)','SER',1,'J',0.00,'I',1,1),
  (96,'Redv devel infrastructure aeroportuaire (IDF)','SER',1,'J',0.00,'I',1,1),
  (97,'Retribution sur Commission OGEFREM (RCO)','SER',1,'J',0.00,'I',1,1),
  (98,'Comite de suivi OGEFREM DGDA (CSO)','SER',1,'J',0.00,'I',1,1),
  (99,'Retribution DGDA/ Partenaires (RET)','SER',1,'J',0.00,'I',1,1),
  (100,'Formalites-Aeroport','SER',3,'B',16.00,'I',1,1),
  (101,'Frais Parking/Entreposage Amicongo','SER',3,'B',16.00,'I',1,1),
  (102,'Finance Cost et Bank Fee','SER',2,'J',0.00,'I',1,1),
  (103,'LOCATION SCELLE ELECTRONIQUE (LSE)','SER',1,'J',0.00,'E',1,1),
  (104,'OPERATIONS COST; TECHNICAL FEE DGDA, CEEC et OTHER','SER',3,'B',16.00,'E',1,1),
  (105,'OGEFREM: Conteneur 10','SER',1,'J',0.00,'E',1,1),
  (106,'MINE DIVISION/DIVISION DES MINES','SER',3,'B',16.00,'E',1,1),
  (107,'COMMERCE EXTERIOR/ COMMERCE EXTERIEUR','SER',3,'B',16.00,'E',1,1),
  (108,'OCC FEES/ FRAIS OCC','SER',3,'B',16.00,'E',1,1),
  (109,'CONCENTRATED TAX($100/MT) / TAXE CONCENTREE','SER',1,'J',0.00,'E',1,1),
  (110,'PNHF-NAC','SER',1,'J',0.00,'E',1,1),
  (111,'Frais de controle OCC (CTL)','SER',1,'J',0.00,'I',1,1),
  (112,'Fond National d Entretien Routier (FONER)','SER',1,'J',0.00,'I',1,1),
  (113,'Stock de Sécurité (SS2)','SER',1,'J',0.00,'I',1,1),
  (114,'Stock de Sécurité Est et Sud (SSE)','SER',1,'J',0.00,'I',1,1),
  (115,'Financement Marquage Moléculaire (MOL)','SER',1,'J',0.00,'I',1,1),
  (116,'Rétribution Moléculaire (RMO)','SER',1,'J',0.00,'I',1,1),
  (117,'Intervention Economique Et Autres (IEA)','SER',1,'J',0.00,'I',1,1),
  (118,'Effort reconst et Stock Stratégique (ESS)','SER',1,'J',0.00,'I',1,1),
  (119,'Frais Contrôle Compass Green World (CGW)','SER',1,'J',0.00,'I',1,1),
  (120,'Frais administratif DGDA et Autres Couts Operationnels','SER',3,'B',16.00,'I',1,1),
  (121,'DM/CE/OCC','SER',1,'J',0.00,'E',1,1),
  (122,'FINANCE COST 1.5% DROIT DE DOUANE ET TAXES','SER',1,'J',0.00,'E',1,1),
  (123,'RETENUE REDEV SUIVI CHANGE 4.5% (RRC)','SER',1,'J',0.00,'I',1,1),
  (124,'TAXE PHYTO-SANITAIRE IMPORT (PSI)','SER',1,'J',0.00,'I',1,1),
  (125,'AMENDE ABSENCE CERTIFICAT ASSURANCE','SER',1,'J',0.00,'I',1,1),
  (127,'REDEVANCE COMM. NATION. PRÉV. ROUT. (CPR)','SER',1,'J',0.00,'I',1,1),
  (128,'RETENUE 1,5 % SUR FRAIS CNPR (RPR)','SER',1,'J',0.00,'I',1,1),
  (129,'QUARANTAINE PROD. VÉGÉTAUX (QPV)','SER',1,'J',0.00,'I',1,1),
  (130,'REDEV SUR APPAR RECEPT DEMIS AUDIO (RAA)','SER',1,'J',0.00,'I',1,1),
  (131,'DGRAD FONDS PROPRES 17.5% DES AT (AT1)','SER',1,'J',0.00,'I',1,1),
  (132,'DGRAD RECEVEUR  FONDS PROPRES 5% DES AT (AT3)','SER',1,'J',0.00,'I',1,1),
  (133,'10% DES AT POUR COMMERCE EXTERIEUR (AT4)','SER',1,'J',0.00,'I',1,1),
  (134,'DGRAD INVESTISSEMENT 10% DES AT (AT5)','SER',1,'J',0.00,'I',1,1),
  (135,'DGRAD FONDS PROPRES 7.5% DES AT (AT2)','SER',1,'J',0.00,'I',1,1),
  (136,'FRAIS PENALITES OCC (PNO)','SER',1,'J',0.00,'I',1,1),
  (138,'DGRAD TRESOR 50 % DES AT (PLT)','SER',1,'J',0.00,'I',1,1),
  (139,'TVA FRAIS OCC (TVO)','SER',1,'J',0.00,'I',1,1),
  (140,'TVA COMMISSION OGEFREM (TVF)','SER',1,'J',0.00,'I',1,1),
  (141,'REDEVANCE DE SUIVI DE CHANGE (RCC)','SER',1,'J',0.00,'I',1,1),
  (142,'DGDA - Security Escort','SER',2,'J',0.00,'I',1,1),
  (143,'Frais labo OCC (LAB)','SER',1,'J',0.00,'I',1,1),
  (144,'Retenue 0.3% sur frais OCC (ROC)','SER',1,'J',0.00,'I',1,1),
  (145,'Internal/Operations Costs','SER',3,'B',16.00,'IE',1,1),
  (146,'IM4/Bon A Enlever/Representation Fees','SER',3,'B',16.00,'IE',1,1),
  (147,'DGDA Receveur Fonds Propres 7.5% des AT (AT3)','SER',1,'J',0.00,'I',1,1),
  (148,'10% des AT pour Commerce Exterieur (AT4)','SER',1,'J',0.00,'I',1,1),
  (149,'Taxe de promotion de la Sante (TPS)','SER',1,'J',0.00,'I',1,1),
  (150,'Retribution sur TPS','SER',1,'J',0.00,'I',1,1)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

SELECT setval(pg_get_serial_sequence('item_master_t', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 1) FROM "item_master_t"), 1));
--> statement-breakpoint

-- Sidebar menu entry under "Masters" (mirrors 0037) + Super Admin CRUD.
DO $$
DECLARE
  parent_id    INT;
  next_order   INT;
  new_menu_id  INT;
  child_level  INT;
BEGIN
  SELECT id INTO parent_id FROM "menu_master_t"
   WHERE LOWER("menu_name") IN ('masters','master','master data') AND "menu_id" IS NULL
   ORDER BY "menu_order" LIMIT 1;
  child_level := CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END;

  SELECT COALESCE(MAX("menu_order"), 0) + 1 INTO next_order
    FROM "menu_master_t" WHERE "menu_id" IS NOT DISTINCT FROM parent_id;

  SELECT id INTO new_menu_id FROM "menu_master_t"
   WHERE LOWER("menu_name") = 'items' AND "menu_id" IS NOT DISTINCT FROM parent_id LIMIT 1;

  IF new_menu_id IS NULL THEN
    INSERT INTO "menu_master_t" ("menu_id","menu_order","menu_level","menu_name","url","display","created_by","updated_by")
    VALUES (parent_id, next_order, child_level, 'Items', '/masters/items', 'Y', 1, 1)
    RETURNING id INTO new_menu_id;
  END IF;

  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 1) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id","menu_id","can_view","can_add","can_edit","can_delete","can_approve","created_by","updated_by")
    VALUES (1, new_menu_id, true, true, true, true, false, 1, 1)
    ON CONFLICT ("role_id","menu_id") DO NOTHING;
  END IF;
END $$;
