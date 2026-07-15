BEGIN;

INSERT INTO identity.users (id, display_name, status, locale) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Browser Owner', 'active', 'en'),
  ('10000000-0000-4000-8000-000000000002', 'Browser Operator', 'active', 'en');

INSERT INTO identity.email_addresses (
  id, user_id, email, email_normalized, is_primary, verified_at
) VALUES
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001',
   'browser-owner@example.test', 'browser-owner@example.test', true, now()),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002',
   'browser-operator@example.test', 'browser-operator@example.test', true, now());

INSERT INTO tenancy.tenants (
  id, slug, business_name, status, locale, timezone
) VALUES (
  '20000000-0000-4000-8000-000000000001', 'browser-workspace',
  'Browser Test Workspace', 'active', 'en', 'Asia/Bangkok'
);

INSERT INTO tenancy.memberships (
  id, tenant_id, user_id, role, status, accepted_at
) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'tenant_master_admin', 'active', now()),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', 'tenant_operator', 'active', now());

INSERT INTO tenancy.tenant_onboarding (tenant_id, stage)
VALUES ('20000000-0000-4000-8000-000000000001', 'business_profile');

INSERT INTO identity.auth_sessions (
  id, user_id, token_hash, family_id, selected_tenant_id,
  reauthenticated_at, mfa_verified_at, idle_expires_at, absolute_expires_at
) VALUES (
  '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  digest('tenant-browser-session-token-0000000000000000', 'sha256'),
  '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
  now(), now(), now() + interval '12 hours', now() + interval '1 day'
);

COMMIT;
