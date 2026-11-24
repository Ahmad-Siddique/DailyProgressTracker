-- Re-applies allowlist after db reset. Match ALLOWED_OWNER_EMAIL in .env / .env.test.
-- Default test owner: owner@dayboard.test (override in CI by editing before reset).
update public.app_singleton
set allowed_owner_email = 'owner@dayboard.test'
where id = 1;