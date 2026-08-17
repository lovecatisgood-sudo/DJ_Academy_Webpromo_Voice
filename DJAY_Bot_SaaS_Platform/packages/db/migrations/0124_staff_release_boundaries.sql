CREATE OR REPLACE FUNCTION tenancy.resume_ai_session_after_staff_release(target_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  target_tenant_id uuid := tenancy.current_tenant_id();
  target_membership_id uuid := NULLIF(current_setting('app.membership_id', true), '')::uuid;
  resumed boolean := false;
BEGIN
  IF target_tenant_id IS NULL OR target_membership_id IS NULL THEN
    RAISE EXCEPTION 'tenant_context_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = target_tenant_id
      AND conversation.id = target_conversation_id
      AND conversation.product_key = 'ai_chat'
      AND conversation.automation_mode = 'human'
      AND conversation.status <> 'closed'
  ) THEN
    RETURN false;
  END IF;

  UPDATE tenancy.ai_sessions session
  SET status = 'active', updated_at = now()
  WHERE session.tenant_id = target_tenant_id
    AND session.conversation_id = target_conversation_id
    AND session.status = 'handover'
    AND session.expires_at > now();
  resumed := FOUND;
  RETURN resumed;
END
$$;

REVOKE ALL ON FUNCTION tenancy.resume_ai_session_after_staff_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.resume_ai_session_after_staff_release(uuid) TO djay_runtime;
