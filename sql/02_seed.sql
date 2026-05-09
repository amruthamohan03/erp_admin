-- ============================================================
-- Seed initial roles and admin user
-- ============================================================
-- Default admin password: Admin@123
-- Hash below is bcrypt (10 rounds) of 'Admin@123'
-- ============================================================

-- Insert base roles
INSERT INTO public.role_master_t (role_name, parent_role_id, approval_level, department, management, finance, display)
VALUES
    ('Super Admin', NULL, 99, 1, 1, 1, 'Y'),
    ('Admin',       1,    50, 1, 1, 0, 'Y'),
    ('Manager',     2,    20, 1, 1, 0, 'Y'),
    ('User',        2,    1,  0, 0, 0, 'Y')
ON CONFLICT DO NOTHING;

-- Insert default admin user (password: Admin@123)
INSERT INTO public.users_t
    (username, password, email, mobile, full_name, role_id, display, profile_image)
VALUES
    ('admin',
     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
     'admin@example.com',
     '9999999999',
     'System Administrator',
     1,
     'Y',
     'default.jpg')
ON CONFLICT (username) DO NOTHING;
