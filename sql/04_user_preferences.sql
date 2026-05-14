-- ============================================================
-- Migration: 04 - User preferences + profile bio
-- Adds optional preference columns to users_t. Safe to re-run.
-- ============================================================

ALTER TABLE public.users_t
    ADD COLUMN IF NOT EXISTS bio text,
    ADD COLUMN IF NOT EXISTS theme_preference varchar(16) DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS locale_preference varchar(8)  DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS email_notifications char(1)   DEFAULT 'Y',
    ADD COLUMN IF NOT EXISTS compact_mode char(1)          DEFAULT 'N';

-- Sanity checks
ALTER TABLE public.users_t
    DROP CONSTRAINT IF EXISTS users_t_theme_preference_check;
ALTER TABLE public.users_t
    ADD CONSTRAINT users_t_theme_preference_check
        CHECK (theme_preference IN ('light', 'dark', 'system'));

ALTER TABLE public.users_t
    DROP CONSTRAINT IF EXISTS users_t_email_notifications_check;
ALTER TABLE public.users_t
    ADD CONSTRAINT users_t_email_notifications_check
        CHECK (email_notifications IN ('Y', 'N'));

ALTER TABLE public.users_t
    DROP CONSTRAINT IF EXISTS users_t_compact_mode_check;
ALTER TABLE public.users_t
    ADD CONSTRAINT users_t_compact_mode_check
        CHECK (compact_mode IN ('Y', 'N'));
