-- Append-only appointment lifecycle evidence shared by bot-created and merchant-updated requests.
CREATE TABLE tenancy.appointment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  appointment_request_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN (
    'requested', 'pending_confirmation', 'confirmed', 'completed', 'cancelled', 'rejected', 'no_show'
  )),
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, appointment_request_id)
    REFERENCES tenancy.appointment_requests(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX tenancy_appointment_status_history_timeline_idx
  ON tenancy.appointment_status_history (tenant_id, appointment_request_id, changed_at, id);

CREATE FUNCTION tenancy.record_appointment_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO tenancy.appointment_status_history (
      tenant_id, appointment_request_id, from_status, to_status
    ) VALUES (
      NEW.tenant_id, NEW.id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenancy_appointment_status_history_capture
  AFTER INSERT OR UPDATE OF status ON tenancy.appointment_requests
  FOR EACH ROW EXECUTE FUNCTION tenancy.record_appointment_status_history();

INSERT INTO tenancy.appointment_status_history (
  tenant_id, appointment_request_id, from_status, to_status, changed_at
)
SELECT request.tenant_id, request.id, NULL, request.status, request.created_at
FROM tenancy.appointment_requests request
ON CONFLICT DO NOTHING;

CREATE TRIGGER tenancy_appointment_status_history_immutable
  BEFORE UPDATE OR DELETE ON tenancy.appointment_status_history
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

ALTER TABLE tenancy.appointment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.appointment_status_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.appointment_status_history
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.appointment_status_history FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.record_appointment_status_history() FROM PUBLIC;
GRANT SELECT ON tenancy.appointment_status_history TO djay_runtime;
