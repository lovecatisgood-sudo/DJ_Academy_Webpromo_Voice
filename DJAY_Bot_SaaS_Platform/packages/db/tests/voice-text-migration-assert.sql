DO $$
DECLARE
  target_run uuid;
  imported_conversations integer;
  imported_messages integer;
  imported_orphan_leads integer;
  fabricated_sessions integer;
  leaked_terms integer;
BEGIN
  SELECT id INTO target_run FROM migration.runs
  WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'
    AND source_system = 'voice_text_v2' AND status = 'validated';
  IF target_run IS NULL THEN RAISE EXCEPTION 'validated migration run missing'; END IF;

  SELECT count(*) INTO imported_conversations FROM migration.legacy_id_map
  WHERE run_id = target_run AND target_entity_type = 'conversation';
  SELECT count(*) INTO imported_messages FROM migration.legacy_id_map
  WHERE run_id = target_run AND target_entity_type = 'message';
  SELECT count(*) INTO imported_orphan_leads FROM migration.legacy_id_map
  WHERE run_id = target_run AND source_entity_type = 'lead'
    AND source_id = '73000000-0000-4000-8000-000000000002';
  IF imported_conversations <> 2 OR imported_messages <> 4 OR imported_orphan_leads <> 1 THEN
    RAISE EXCEPTION 'migration reconciliation failed: conversations %, messages %, orphan leads %',
      imported_conversations, imported_messages, imported_orphan_leads;
  END IF;

  SELECT count(*) INTO fabricated_sessions
  FROM tenancy.voice_sessions session
  JOIN migration.legacy_id_map mapping
    ON mapping.run_id = target_run AND mapping.target_entity_type = 'conversation'
   AND mapping.target_id = session.conversation_id;
  IF fabricated_sessions <> 0 THEN RAISE EXCEPTION 'historical import fabricated Voice sessions'; END IF;

  SELECT count(*) INTO leaked_terms FROM (
    SELECT row_to_json(contact)::text AS value FROM tenancy.contacts contact
    WHERE contact.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'
    UNION ALL
    SELECT row_to_json(conversation)::text FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'
    UNION ALL
    SELECT row_to_json(metadata)::text FROM tenancy.legacy_conversation_imports metadata
    WHERE metadata.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'
  ) tenant_rows WHERE value LIKE '%must-never-cross-boundary%';
  IF leaked_terms <> 0 THEN RAISE EXCEPTION 'restricted source field crossed tenant boundary'; END IF;

  IF EXISTS (
    SELECT 1 FROM migration.validations
    WHERE run_id = target_run AND validation_key = 'voice_text_entity_reconciliation'
      AND (passed = false OR actual_json->>'reconciled' <> expected_json->>'sourceEntities')
  ) THEN RAISE EXCEPTION 'migration validation evidence failed'; END IF;
END
$$;
