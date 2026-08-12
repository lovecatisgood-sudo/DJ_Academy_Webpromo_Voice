CREATE OR REPLACE FUNCTION platform.get_tenant_360(target_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, tenancy, catalog
AS $$
DECLARE
  actor_id uuid := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role text := NULLIF(current_setting('app.platform_role', true), '');
  request_id_value text := NULLIF(current_setting('app.request_id', true), '');
  result jsonb;
BEGIN
  IF session_user <> 'djay_platform' OR actor_id IS NULL
    OR actor_role NOT IN ('platform_owner', 'platform_support', 'platform_finance') THEN
    RAISE EXCEPTION 'platform_tenant_read_required';
  END IF;

  SELECT jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', tenant.id, 'businessName', tenant.business_name, 'slug', tenant.slug,
      'status', tenant.status, 'createdAt', tenant.created_at,
      'activeMembers', (SELECT count(*) FROM tenancy.memberships member WHERE member.tenant_id = tenant.id AND member.status = 'active'),
      'openLeads', (SELECT count(*) FROM tenancy.leads lead WHERE lead.tenant_id = tenant.id AND lead.status NOT IN ('closed_deal','disqualified')),
      'openConversations', (SELECT count(*) FROM tenancy.conversations conversation WHERE conversation.tenant_id = tenant.id AND conversation.status IN ('bot_active','human_active','waiting'))
    ),
    'subscriptions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', subscription.id, 'productKey', subscription.product_key, 'planKey', plan.plan_key,
      'status', subscription.status, 'periodStart', subscription.period_start,
      'periodEnd', subscription.period_end, 'updatedAt', subscription.updated_at
    ) ORDER BY subscription.updated_at DESC, subscription.id)
      FROM tenancy.product_subscriptions subscription
      JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id
      WHERE subscription.tenant_id = tenant.id), '[]'::jsonb),
    'entitlements', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'productKey', snapshot.product_key, 'accessMode', snapshot.access_mode,
      'subscriptionStatus', snapshot.subscription_status, 'createdAt', snapshot.created_at
    ) ORDER BY snapshot.product_key)
      FROM (SELECT DISTINCT ON (product_key) product_key, access_mode, subscription_status, created_at
        FROM tenancy.entitlement_snapshots WHERE tenant_id = tenant.id
        ORDER BY product_key, created_at DESC, id DESC) snapshot), '[]'::jsonb),
    'usage', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'productKey', account.product_key, 'unit', account.customer_unit,
      'included', account.included_quantity, 'reserved', account.reserved_quantity,
      'settled', account.settled_quantity, 'periodStart', account.period_start,
      'periodEnd', account.period_end, 'updatedAt', account.updated_at
    ) ORDER BY account.period_end DESC, account.product_key)
      FROM tenancy.quota_accounts account WHERE account.tenant_id = tenant.id
        AND account.period_end > now() - interval '32 days'), '[]'::jsonb),
    'deployments', COALESCE((SELECT jsonb_agg(deployment ORDER BY deployment->>'createdAt' DESC)
      FROM (SELECT jsonb_build_object('kind','flowbot','id',id,'name',name,'status',status,'createdAt',created_at) deployment FROM tenancy.flow_deployments WHERE tenant_id = tenant.id
        UNION ALL SELECT jsonb_build_object('kind','ai_chat','id',id,'name',name,'status',status,'createdAt',created_at) FROM tenancy.ai_deployments WHERE tenant_id = tenant.id
        UNION ALL SELECT jsonb_build_object('kind','voice','id',id,'name',name,'status',status,'createdAt',created_at) FROM tenancy.voice_deployments WHERE tenant_id = tenant.id) all_deployments), '[]'::jsonb),
    'support', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', ticket.id, 'category', ticket.category, 'priority', ticket.priority,
      'status', ticket.status, 'lastActivityAt', ticket.last_activity_at
    ) ORDER BY ticket.last_activity_at DESC, ticket.id DESC)
      FROM (SELECT * FROM tenancy.support_tickets WHERE tenant_id = tenant.id ORDER BY last_activity_at DESC, id DESC LIMIT 50) ticket), '[]'::jsonb),
    'privacyJobs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', job.id, 'jobType', job.job_type, 'status', job.status,
      'requestedAt', job.requested_at, 'completedAt', job.completed_at
    ) ORDER BY job.requested_at DESC, job.id DESC)
      FROM (SELECT * FROM tenancy.privacy_jobs WHERE tenant_id = tenant.id ORDER BY requested_at DESC, id DESC LIMIT 50) job), '[]'::jsonb),
    'auditReferences', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', audit.id, 'action', audit.action, 'targetType', audit.target_type,
      'targetId', audit.target_id, 'result', audit.audit_result, 'createdAt', audit.created_at
    ) ORDER BY audit.created_at DESC, audit.id DESC)
      FROM (SELECT tenant_audit.id, tenant_audit.action, tenant_audit.target_type, tenant_audit.target_id,
          tenant_audit.result AS audit_result, tenant_audit.created_at
        FROM tenancy.audit_logs tenant_audit WHERE tenant_audit.tenant_id = tenant.id
        ORDER BY tenant_audit.created_at DESC, tenant_audit.id DESC LIMIT 100) audit), '[]'::jsonb)
  ) INTO result
  FROM tenancy.tenants tenant WHERE tenant.id = target_tenant_id;

  IF result IS NULL THEN RETURN NULL; END IF;
  INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
  VALUES (actor_id, 'tenant_360.viewed', 'tenant', target_tenant_id::text, request_id_value, 'succeeded', jsonb_build_object('role', actor_role));
  RETURN result;
END
$$;

REVOKE ALL ON FUNCTION platform.get_tenant_360(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.get_tenant_360(uuid) TO djay_platform;
