DO $$
DECLARE
  target_run uuid;
BEGIN
  SELECT id INTO target_run FROM migration.runs
  WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'
    AND source_system = 'voice_text_v2' AND status = 'rolled_back';
  IF target_run IS NULL THEN RAISE EXCEPTION 'rolled-back migration run missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM tenancy.legacy_conversation_imports
    WHERE migration_run_id = target_run
      AND (cutover_state <> 'rolled_back' OR rolled_back_at IS NULL)
  ) THEN RAISE EXCEPTION 'imported conversations were not hidden by traffic rollback'; END IF;
  IF (SELECT count(*) FROM tenancy.messages message
      JOIN migration.legacy_id_map mapping ON mapping.run_id = target_run
        AND mapping.target_entity_type = 'message' AND mapping.target_id = message.id) <> 4 THEN
    RAISE EXCEPTION 'rollback destructively changed immutable history';
  END IF;
END
$$;
