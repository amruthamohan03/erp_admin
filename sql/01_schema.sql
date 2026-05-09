-- ============================================================
-- Admin Dashboard - Database Schema
-- Run this on a fresh database. Order matters because of FKs.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.role_master_t_id_seq
    INCREMENT 1 START 1 MINVALUE 1 NO MAXVALUE CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.users_t_id_seq
    INCREMENT 1 START 1 MINVALUE 1 NO MAXVALUE CACHE 1;

-- role_master_t (created first; FKs to users_t added later) ----
CREATE TABLE IF NOT EXISTS public.role_master_t
(
    id integer NOT NULL DEFAULT nextval('role_master_t_id_seq'::regclass),
    role_name character varying(100) NOT NULL,
    parent_role_id integer,
    approval_level smallint,
    department smallint DEFAULT 0,
    management smallint DEFAULT 0,
    finance smallint DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer,
    display character(1) DEFAULT 'Y'::bpchar,
    CONSTRAINT role_master_t_pkey PRIMARY KEY (id),
    CONSTRAINT role_master_t_parent_role_id_fkey FOREIGN KEY (parent_role_id)
        REFERENCES public.role_master_t (id),
    CONSTRAINT role_master_t_display_check CHECK (display = ANY (ARRAY['Y'::bpchar, 'N'::bpchar]))
);

-- users_t -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users_t
(
    id integer NOT NULL DEFAULT nextval('users_t_id_seq'::regclass),
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    email character varying(100) NOT NULL,
    mobile character varying(15),
    full_name character varying(255) NOT NULL,
    role_id integer NOT NULL,
    display character(1) DEFAULT 'Y'::bpchar,
    created_by integer,
    updated_by integer,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    profile_image character varying(255) DEFAULT 'default.jpg'::character varying,
    signature_image character varying(150),
    location_id character varying(100),
    dept_id character varying(100),
    CONSTRAINT users_t_pkey PRIMARY KEY (id),
    CONSTRAINT users_t_username_unique UNIQUE (username),
    CONSTRAINT users_t_email_unique UNIQUE (email),
    CONSTRAINT users_t_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.users_t (id),
    CONSTRAINT users_t_role_id_fkey FOREIGN KEY (role_id)
        REFERENCES public.role_master_t (id),
    CONSTRAINT users_t_updated_by_fkey FOREIGN KEY (updated_by)
        REFERENCES public.users_t (id),
    CONSTRAINT users_t_display_check CHECK (display = ANY (ARRAY['Y'::bpchar, 'N'::bpchar]))
);

-- Add FKs from role_master_t to users_t ------------------------
ALTER TABLE public.role_master_t
    DROP CONSTRAINT IF EXISTS role_master_t_created_by_fkey;
ALTER TABLE public.role_master_t
    ADD CONSTRAINT role_master_t_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.users_t (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE public.role_master_t
    DROP CONSTRAINT IF EXISTS role_master_t_updated_by_fkey;
ALTER TABLE public.role_master_t
    ADD CONSTRAINT role_master_t_updated_by_fkey FOREIGN KEY (updated_by)
        REFERENCES public.users_t (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

-- Indexes -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_role_master_created_by ON public.role_master_t (created_by);
CREATE INDEX IF NOT EXISTS idx_role_master_updated_by ON public.role_master_t (updated_by);
CREATE INDEX IF NOT EXISTS idx_role_master_parent ON public.role_master_t (parent_role_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users_t (role_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users_t (username);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users_t (email);

-- Roles seed ---------------------------------------------------
INSERT INTO public.role_master_t (role_name, parent_role_id, approval_level, department, management, finance, display)
VALUES
    ('Super Admin', NULL, 99, 1, 1, 1, 'Y'),
    ('Admin',       1,    50, 1, 1, 0, 'Y'),
    ('Manager',     2,    20, 1, 1, 0, 'Y'),
    ('User',        2,    1,  0, 0, 0, 'Y')
ON CONFLICT DO NOTHING;
