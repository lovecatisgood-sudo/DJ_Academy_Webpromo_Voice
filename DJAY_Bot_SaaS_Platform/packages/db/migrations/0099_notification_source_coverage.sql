-- Extend the tenant notification center from customer operations to setup, deployment,
-- privacy, ownership, and support-access lifecycle facts. Existing events remain immutable.
CREATE FUNCTION tenancy.capture_setup_security_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE category_value text; severity_value text; link_value text; kind_value text;
  entity_value uuid; occurred_value timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'tenant_onboarding' THEN
    IF TG_OP <> 'UPDATE' OR (NEW.stage = OLD.stage AND NEW.preferences_completed_at IS NOT DISTINCT FROM OLD.preferences_completed_at) THEN RETURN NEW; END IF;
    category_value := CASE WHEN NEW.stage = 'ready' THEN 'completed' ELSE 'action_needed' END;
    severity_value := CASE WHEN NEW.stage = 'ready' THEN 'success' ELSE 'info' END;
    link_value := '/workspace/setup'; entity_value := NEW.tenant_id; occurred_value := NEW.updated_at;
    kind_value := CASE WHEN NEW.stage = 'ready' THEN 'onboarding.ready'
      WHEN NEW.preferences_completed_at IS DISTINCT FROM OLD.preferences_completed_at THEN 'onboarding.preferences_saved'
      ELSE 'onboarding.' || NEW.stage END;
  ELSIF TG_TABLE_NAME IN ('flow_deployments','ai_deployments','voice_deployments') THEN
    IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
    category_value := 'product_health';
    severity_value := CASE WHEN NEW.status = 'active' THEN 'success' WHEN NEW.status = 'disabled' THEN 'warning' ELSE 'critical' END;
    link_value := CASE TG_TABLE_NAME WHEN 'flow_deployments' THEN '/workspace/flowbot'
      WHEN 'ai_deployments' THEN '/workspace/ai-chat' ELSE '/workspace/voice' END;
    entity_value := NEW.id;
    IF TG_TABLE_NAME = 'voice_deployments' THEN occurred_value := NEW.updated_at;
    ELSE occurred_value := COALESCE(NEW.rotated_at, NEW.revoked_at, NEW.created_at); END IF;
    kind_value := 'deployment.' || CASE TG_TABLE_NAME WHEN 'flow_deployments' THEN 'flowbot'
      WHEN 'ai_deployments' THEN 'ai_chat' ELSE 'voice' END || '_' || NEW.status;
  ELSIF TG_TABLE_NAME = 'privacy_jobs' THEN
    IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
    category_value := CASE WHEN NEW.status IN ('completed','cancelled') THEN 'completed' ELSE 'action_needed' END;
    severity_value := CASE WHEN NEW.status = 'completed' THEN 'success' WHEN NEW.status = 'failed' THEN 'critical'
      WHEN NEW.status = 'cancelled' THEN 'warning' ELSE 'info' END;
    link_value := '/workspace/data'; entity_value := NEW.id;
    occurred_value := CASE WHEN TG_OP = 'INSERT' THEN NEW.requested_at ELSE COALESCE(NEW.completed_at, now()) END;
    kind_value := 'privacy.' || NEW.job_type || '_' || NEW.status;
  ELSIF TG_TABLE_NAME = 'ownership_transfers' THEN
    IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
    category_value := 'team_security';
    severity_value := CASE WHEN NEW.status = 'accepted' THEN 'success' WHEN NEW.status IN ('cancelled','expired') THEN 'warning' ELSE 'info' END;
    link_value := '/workspace/team'; entity_value := NEW.id; occurred_value := COALESCE(NEW.accepted_at, NEW.created_at);
    kind_value := 'team.ownership_' || NEW.status;
  ELSE
    IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
    category_value := 'team_security';
    severity_value := CASE WHEN NEW.status = 'active' THEN 'warning' WHEN NEW.status IN ('revoked','expired') THEN 'success' ELSE 'info' END;
    link_value := '/workspace/security'; entity_value := NEW.id;
    occurred_value := COALESCE(NEW.revoked_at, NEW.starts_at, NEW.created_at);
    kind_value := 'support_access.' || CASE WHEN NEW.status IN ('active','approved') AND NEW.expires_at <= now()
      THEN 'expired' ELSE NEW.status END;
  END IF;
  PERFORM tenancy.queue_tenant_notification(NEW.tenant_id,
    TG_TABLE_NAME || ':' || entity_value::text || ':' || kind_value,
    category_value, severity_value, kind_value, TG_TABLE_NAME, entity_value, link_value, occurred_value);
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenancy_onboarding_notification_center
  AFTER UPDATE OF stage, preferences_completed_at ON tenancy.tenant_onboarding
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_setup_security_notification();
CREATE TRIGGER tenancy_flow_deployment_notification_center
  AFTER INSERT OR UPDATE OF status ON tenancy.flow_deployments
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_setup_security_notification();
CREATE TRIGGER tenancy_ai_deployment_notification_center
  AFTER INSERT OR UPDATE OF status ON tenancy.ai_deployments
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_setup_security_notification();
CREATE TRIGGER tenancy_voice_deployment_notification_center
  AFTER INSERT OR UPDATE OF status ON tenancy.voice_deployments
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_setup_security_notification();
CREATE TRIGGER tenancy_privacy_job_notification_center
  AFTER INSERT OR UPDATE OF status ON tenancy.privacy_jobs
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_setup_security_notification();
CREATE TRIGGER tenancy_ownership_transfer_notification_center
  AFTER INSERT OR UPDATE OF status ON tenancy.ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_setup_security_notification();
CREATE TRIGGER tenancy_support_access_notification_center
  AFTER INSERT OR UPDATE OF status ON tenancy.support_access_grants
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_setup_security_notification();

REVOKE ALL ON FUNCTION tenancy.capture_setup_security_notification() FROM PUBLIC;
