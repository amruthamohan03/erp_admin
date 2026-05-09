-- ============================================================
-- menu_master_t  (PostgreSQL port of the MySQL DDL)
-- Run AFTER 01_schema.sql so that users_t already exists.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.menu_master_t_id_seq
    INCREMENT 1 START 1 MINVALUE 1 NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.menu_master_t
(
    id integer NOT NULL DEFAULT nextval('menu_master_t_id_seq'::regclass),
    menu_id integer,                              -- self-FK, NULL or 0 = top level
    menu_order integer NOT NULL DEFAULT 1,
    menu_level integer,
    menu_name varchar(255),
    url varchar(255),
    text varchar(100),
    icon varchar(100) DEFAULT '  ',
    badge varchar(50) DEFAULT '  ',
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer,
    display char(1) DEFAULT 'Y',
    CONSTRAINT menu_master_t_pkey PRIMARY KEY (id),
    CONSTRAINT menu_master_t_display_check CHECK (display IN ('Y','N')),
    CONSTRAINT menu_master_t_parent_fkey FOREIGN KEY (menu_id)
        REFERENCES public.menu_master_t (id) ON DELETE SET NULL,
    CONSTRAINT menu_master_t_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.users_t (id) ON DELETE SET NULL,
    CONSTRAINT menu_master_t_updated_by_fkey FOREIGN KEY (updated_by)
        REFERENCES public.users_t (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_menu_parent  ON public.menu_master_t (menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_level   ON public.menu_master_t (menu_level);
CREATE INDEX IF NOT EXISTS idx_menu_display ON public.menu_master_t (display);
CREATE INDEX IF NOT EXISTS idx_menu_order   ON public.menu_master_t (menu_order);

-- After seeding rows whose IDs are inserted explicitly, advance the sequence
-- so the next auto-generated ID doesn't collide.
-- (Run this AFTER 03_menu_seed.sql.)
-- SELECT setval('menu_master_t_id_seq', (SELECT MAX(id) FROM menu_master_t));
