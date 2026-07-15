BEGIN;

INSERT INTO identity.users (id, display_name, status, locale) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Owner A', 'active', 'en'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Owner B', 'active', 'en'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Admin A', 'active', 'en');

INSERT INTO identity.email_addresses
  (id, user_id, email, email_normalized, is_primary, verified_at) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'owner-a@example.test', 'owner-a@example.test', true, now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbe1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'owner-b@example.test', 'owner-b@example.test', true, now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'admin-a@example.test', 'admin-a@example.test', true, now());

INSERT INTO tenancy.tenants (id, slug, business_name, status) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'tenant-a', 'Tenant A', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10', 'tenant-b', 'Tenant B', 'active');

INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'tenant_master_admin', 'active', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'tenant_master_admin', 'active', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'tenant_admin', 'active', now());

INSERT INTO tenancy.tenant_onboarding (tenant_id, stage) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'business_profile'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10', 'account_created');

COMMIT;

