-- ============================================================
-- Seed menu_master_t
-- Uses DEFERRED FK so out-of-order parent references work.
-- ============================================================

BEGIN;

-- Make the self-FK deferrable for this transaction
ALTER TABLE public.menu_master_t
    DROP CONSTRAINT IF EXISTS menu_master_t_parent_fkey;
ALTER TABLE public.menu_master_t
    ADD CONSTRAINT menu_master_t_parent_fkey FOREIGN KEY (menu_id)
        REFERENCES public.menu_master_t (id) ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED;

SET CONSTRAINTS menu_master_t_parent_fkey DEFERRED;

-- NOTE: rows where menu_id = 0 in the source data are converted to NULL
-- (PostgreSQL FK requires either NULL or an existing parent id).

INSERT INTO public.menu_master_t
(id, menu_id, menu_order, menu_level, menu_name, url, text, icon, badge, created_by, updated_by, display) VALUES
(1,  NULL, 1, 0, 'Dashboard', 'home/index', 'Dashboard', 'ti ti-dashboard', 'New', 1, 1, 'Y'),
(2,  NULL, 3, 0, 'Client Management', '#', 'License Management', 'ti ti-user-circle', ' ', 1, 1, 'Y'),
(3,  NULL, 2, 0, 'Masters', '#', 'Masters', 'ti ti-layout', ' ', 1, 1, 'Y'),
(4,  3,    1, 1, 'Menu Management', 'menu/index', 'Menu Management', '', '', 1, 1, 'Y'),
(5,  3,    2, 1, 'Banklist', 'banklist/index', 'Banklist', '', '', 1, 1, 'Y'),
(6,  NULL, 5, 0, 'Export License', '#', 'License Management', 'ti ti-file-certificate', '', 1, 1, 'Y'),
(7,  3,    4, 1, 'Clearance', 'clearance/index', 'Clearance', '  ', '  ', 1, 1, 'Y'),
(8,  3,    5, 1, 'Clearing Status', 'clearingstatus/index', 'Clearing Status', '  ', '  ', 1, 1, 'Y'),
(12, 3,    6, 1, 'Kind', 'kind/index', 'Kind', '', '', 1, 1, 'Y'),
(13, 3,    7, 1, 'Transit Point', 'transitpoint/index', 'Transit Point', '', '', 1, 1, 'Y'),
(14, 3,    8, 1, 'Department', 'department/index', 'Department', '', '', 1, 1, 'Y'),
(20, 3,    9, 1, 'Expense', 'expense/index', 'Expense', '', '', 1, 1, 'Y'),
(21, 3,    10, 1, 'Feetcontainer', 'feetcontainer', 'Feetcontainer', '', '', 1, 1, 'Y'),
(22, 3,    11, 1, 'Role', 'role/index', 'Role', '', '', 1, 1, 'Y'),
(27, 3,    12, 1, 'Type Of Goods', 'typeofgoods/index', 'Type Of Goods', '', '', 1, 1, 'Y'),
(28, 3,    13, 1, 'Regime', 'regime', 'Regime', '', '', 1, 1, 'Y'),
(29, 3,    14, 1, 'Hscode', 'hscode/index', 'Hscode', '', '', 1, 1, 'Y'),
(30, 2,    1, 1, 'Clients', 'client/index', 'Clients', '', '', 1, 1, 'Y'),
(31, 3,    15, 1, 'Users', 'user/index', 'Users', '', '', 1, 1, 'Y'),
(32, 3,    16, 1, 'Phase', 'phase/index', 'Phase', '', '', 1, 1, 'Y'),
(33, 3,    17, 1, 'Province', 'province/index', 'Province', '', '', 1, 1, 'Y'),
(34, 3,    18, 1, 'Final warehouse', 'finalbondedwarehouse/index', 'Final warehouse', '', '', 1, 1, 'Y'),
(35, 3,    19, 1, 'Incoterm', 'incoterm/index', 'Incoterm', '', '', 1, 1, 'Y'),
(36, 3,    20, 1, 'Industry', 'industry/index', 'Industry', '', '', 1, 1, 'Y'),
(37, 3,    21, 1, 'Item', 'item/index', 'Item', '', '', 1, 1, 'Y'),
(38, 3,    22, 1, 'Origin', 'origin/index', 'Origin', '', '', 1, 1, 'Y'),
(39, 3,    23, 1, 'Payment Method', 'paymentmethod/index', 'Payment Method', '', '', 1, 1, 'Y'),
(40, 3,    24, 1, 'Payment Type', 'paymenttype/index', 'Payment Type', '', '', 1, 1, 'Y'),
(41, 3,    25, 1, 'Refferer', 'refferer/index', 'Refferer', '', '', 1, 1, 'Y'),
(42, 3,    26, 1, 'Currency', 'currency/index', 'Currency', '', '', 1, 1, 'Y'),
(43, 3,    27, 1, 'Invoice', 'invoice/index', 'Invoice', '', '', 1, 1, 'Y'),
(44, 3,    28, 1, 'Transport', 'transport/index', 'Transport Mode', '', '', 1, 1, 'Y'),
(45, 3,    29, 1, 'Truck Status', 'truckstatus/index', 'Truck Status', '', '', 1, 1, 'Y'),
(46, 3,    30, 1, 'Unit', 'unit/index', 'Unit', '', '', 1, 1, 'Y'),
(47, 3,    31, 1, 'Document Status', 'documentstatus/index', 'Document Status', '', '', 1, 1, 'Y'),
(48, 3,    32, 1, 'Payment Subtype', 'paymentsubtype/index', 'Payment Subtype', '', '', 1, 1, 'Y'),
(49, 3,    33, 1, 'Perdiem', 'perdiem/index', 'Perdiem', '', '', 1, 1, 'Y'),
(50, 3,    34, 1, 'Seal', 'seal/index', 'Seal', '', '', 1, 1, 'Y'),
(51, 3,    35, 1, 'Sub Office', 'suboffice/index', 'Sub Office', '', '', 1, 1, 'Y'),
(52, 3,    36, 1, 'Main Office', 'mainoffice/index', 'Main Office', '', '', 1, 1, 'Y'),
(53, 6,    1, 1, 'Create Licenses', 'license/index', 'Create Licenses', '', '', 1, 1, 'Y'),
(55, NULL, 6, 0, 'Tracking Management', '#', 'Tracking Management', 'ti ti-truck', '', 1, 1, 'Y'),
(56, 55,   37, 1, 'Local Tracking', 'local/index', 'Local Tracking', '', '', 1, 1, 'Y'),
(57, 3,    38, 1, 'Language Translation', 'language/index', 'Language Translation', '', '', 1, 1, 'Y'),
(58, 55,   39, 1, 'Import Tracking', 'import/index', 'Import Tracking', '', '', 1, 1, 'Y'),
(59, NULL, 7, 0, 'Payment', '#', 'Payment', 'ti ti-cash', '', 1, 1, 'Y'),
(60, 55,   40, 1, 'Export Tracking', 'export/index', 'Export Tracking', '', '', 1, 1, 'Y'),
(61, NULL, 8, 0, 'Sydonia', '#', 'Sydonia Import', 'ti ti-file', '', 1, 1, 'Y'),
(62, 61,   41, 1, 'Import Sydonia', 'importsydonia/index', 'Import Sydonia', '', 'import', 1, 1, 'Y'),
(63, 61,   42, 1, 'Export Sydonia', 'exportsydonia/index', 'Export Sydonia', '', 'Export', 1, 1, 'Y'),
(64, 59,   43, 1, 'Payment Request', 'payment/index', 'Payment Request', '', '', 1, 1, 'Y'),
(65, NULL, 8, 0, 'Fiche De Calcul', '#', 'Fiche De Calcul', 'ti ti-file', '', 1, 1, 'Y'),
(66, 65,   44, 1, 'Fiche De Calcul', 'fiche/index', 'Fiche De Calcul', '', '', 1, 1, 'Y'),
(67, NULL, 9, 0, 'Quotation Management', '#', 'Quotation Management', 'ti ti-cash', '', 1, 1, 'Y'),
(68, NULL, 10, 0, 'Invoice Management', '#', 'Invoice Management', 'ti ti-invoice', '', 1, 1, 'Y'),
(69, 67,   45, 1, 'Invoice Quotation', 'quotation/index', 'Invoice Quotation', 'ti ti-quotation', '', 1, 1, 'Y'),
(70, 68,   46, 1, 'FV IMP Clearing Service', 'importinvoice/index', 'Import Inovice', '', '', 1, 1, 'Y'),
(71, 2,    47, 1, 'Client Dashboard', 'clientdashboard/index', 'Client Dashboard', 'ti ti-pie', '', 1, 1, 'Y'),
(72, 6,    48, 1, 'License Dashbaord', 'licensedashboard/index', 'License Dashbaord', '', '', 1, 1, 'Y'),
(73, 55,   49, 1, 'Local Dashboard', 'localdashboard/index', 'Local Dashboard', '', '', 1, 1, 'Y'),
(74, 80,   12, 1, 'Role Menu Mapping', 'rolemenumapping/index', 'Role Menu Mapping', '', '', 1, 1, 'Y'),
(75, NULL, 11, 0, 'Seal Tracker', '#', 'Seal Tracker', 'ti ti-lock', '', 1, 1, 'Y'),
(76, 75,   50, 1, 'Seal Tracker', 'seal/index', 'Seal Tracker', '', '', 1, 1, 'Y'),
(77, 6,    51, 1, 'License HS Code', 'licensehscode/index', 'License HS Code', '', '', 1, 1, 'Y'),
(78, 6,    52, 1, 'License Modification', 'licensemodification/index', 'License Modification', '', '', 1, 1, 'Y'),
(79, 55,   53, 1, 'Import Dashboard', 'importdashboard/index', 'Import Dashboard', '', '', 1, 1, 'Y'),
(80, NULL, 4, 0, 'Mapping', '#', 'Mapping', 'ti ti-layout-grid', '  ', 1, 1, 'Y'),
(81, 80,   2, 1, 'Client to Bank', 'clientbankmapping/index', 'Client to Bank', '', '', 1, 1, 'Y'),
(82, 75,   2, 1, 'Seal Nos', 'sealno/index', 'Seal Nos', '', '', 1, 1, 'N'),
(83, NULL, 82, 0, 'Advance Payment', '#', 'Advance Payment', 'ti ti-wallet', '', 1, 1, 'Y'),
(84, 83,   84, 1, 'CEEC Payment', 'ceec/index', 'CEEC Payment', '', '', 1, 1, 'Y'),
(85, 83,   85, 1, 'CGEA Payment', 'cgea/index', 'CGEA Payment', '', '', 1, 1, 'Y'),
(86, 68,   86, 1, 'FV EXP Clearing Service', 'exportinvoice/index', 'Export Invoice', '', '', 1, 1, 'Y'),
(87, 68,   87, 1, 'FV Other Service', 'otherinvoice/index', 'Local Invoice', '', '', 1, 1, 'Y'),
(88, 110,  88, 1, 'Bivac', 'bivac/index', 'Bivac', '', '', 1, 1, 'Y'),
(89, 3,    89, 1, 'Quotation Description', 'description/index', 'Quotation Description', '', '', 1, 1, 'Y'),
(90, 83,   90, 1, 'OCC Payment', 'occ/index', 'OCC Payment', '', '', 1, 1, 'Y'),
(91, 83,   91, 1, 'LMC Payment', 'lmc/index', 'LMC Payment', '', '', 1, 1, 'Y'),
(92, 3,    3, 1, 'Bank Exchange Rates', 'bankExchangeRate/index', 'Bank Exchange Rates', '', '', 1, 1, 'Y'),
(93, 83,   92, 1, 'OGEFREM Payment', 'ogefrem/index', 'OGEFREM Payment', '', '', 1, 1, 'Y'),
(94, NULL, 94, 0, 'DGI Reports', '#', 'DGI Reports', 'ti ti-report', '', 1, 1, 'Y'),
(95, 94,   95, 1, 'X Report(Current Session)', 'xreport/index', 'X Report(Current Session)', '', '', 1, 1, 'Y'),
(96, 94,   96, 1, 'Z Report(Closed Session)', 'zreport/index', 'Z Report(Closed Session)', '', '', 1, 1, 'Y'),
(97, 94,   97, 1, 'A Report(Articles)', 'areport/index', 'A Report(Articles)', '', '', 1, 1, 'Y'),
(98, 80,   3, 1, 'Dashboard Cards Mapping', 'roleDashboardCard', 'Dashboard Cards Mapping', '', '', 1, 1, 'Y'),
(99, 3,    25, 1, 'Dashboard Cards', 'dashboardCard/index', 'Dashboard Cards', '', '', 1, 1, 'Y'),
(100, NULL, 68, 0, 'CREDIT NOTE (FA)', '#', 'CREDIT NOTE', '', '', 1, 1, 'N'),
(101, 68,  101, 1, 'FA IMP Clearing Service', 'importcredit/index', 'IMPORT FA', '', '', 1, 1, 'Y'),
(102, 68,  102, 1, 'FA EXP Clearing Service', 'exportcredit/index', 'EXPORT FA', '', '', 1, 1, 'Y'),
(103, 110, 103, 1, 'IMPORT APURMENT', 'importapurment/index', 'IMPORT APURMENT', '', '', 1, 1, 'Y'),
(104, 6,   104, 1, 'EXPORT APURMENT', 'exportapurment/index', 'EXPORT APURMENT', '', '', 1, 1, 'Y'),
(105, 68,  102, 1, 'FA Other Services', 'othercredit/index', 'FA Other Services', '', '', 1, 1, 'Y'),
(106, 55,  106, 1, 'Export Dashboard', 'exportdashboard/index', 'Export Dashboard', '', '', 1, 1, 'Y'),
(107, 3,   107, 1, 'Invoice Bank', '107', 'Invoice Bank', 'invoice/index', '', 1, 1, 'Y'),
(108, 68,  108, 1, 'Import Invoice Dashboard', 'iidashboard/index', 'Import Invoice Dashboard', '', '', 1, 1, 'Y'),
(109, 110, 109, 1, 'Import Synthesis', 'is/index', 'Import Synthesis', '', '', 1, 1, 'Y'),
(110, NULL, 5, 0, 'Import License', '#', 'Import License', 'ti ti-file-certificate', '', 1, 1, 'Y'),
(111, 110, 1, 1, 'Create Import License', 'license/index', 'Create Import License', '', '', 1, 1, 'Y'),
(112, 110, 2, 1, 'License Dashboard', 'licensedashboard/index', 'License Dashboard', '', '', 1, 1, 'Y'),
(113, 55,  113, 1, 'Import KPI', 'imkpi/index', '', '', '', 1, 1, 'Y'),
(114, 55,  114, 1, 'Tracking Dashboard', 'trackingdashboard/index', 'Tracking Dashboard', '', '', 1, 1, 'Y'),
(115, 55,  115, 1, 'Client Import Dashboard', 'clientimport/index', 'Client Import Dashboard', '', '', 1, 1, 'Y'),
(116, 55,  116, 1, 'Export KPI', 'exkpi/index', 'Export KPI', '', '', 1, 1, 'Y')
ON CONFLICT (id) DO NOTHING;

-- Advance the sequence past the explicitly inserted IDs.
SELECT setval('menu_master_t_id_seq', (SELECT MAX(id) FROM public.menu_master_t));

COMMIT;
