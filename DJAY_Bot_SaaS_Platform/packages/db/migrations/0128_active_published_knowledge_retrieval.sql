CREATE OR REPLACE FUNCTION tenancy.assert_publishable_knowledge_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.knowledge_source_revisions revision
    JOIN tenancy.knowledge_sources source
      ON source.tenant_id = revision.tenant_id AND source.id = revision.source_id
    JOIN tenancy.ai_playbook_versions version
      ON version.tenant_id = NEW.tenant_id AND version.agent_id = NEW.agent_id
      AND version.id = NEW.playbook_version_id
    WHERE revision.tenant_id = NEW.tenant_id AND revision.id = NEW.source_revision_id
      AND revision.status = 'ready' AND source.status = 'active' AND version.status = 'published'
  ) THEN RAISE EXCEPTION 'knowledge_revision_not_publishable'; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_ai_playbook_knowledge_publishable
BEFORE INSERT ON tenancy.ai_playbook_knowledge
FOR EACH ROW EXECUTE FUNCTION tenancy.assert_publishable_knowledge_revision();

DO $migration$
DECLARE item record; definition text;
  old_join text := E'JOIN tenancy.knowledge_chunks chunk\n        ON chunk.tenant_id = pin.tenant_id AND chunk.source_revision_id = pin.source_revision_id';
  active_join text := E'JOIN tenancy.knowledge_source_revisions revision\n        ON revision.tenant_id = pin.tenant_id AND revision.id = pin.source_revision_id AND revision.status = ''ready''\n      JOIN tenancy.knowledge_sources source\n        ON source.tenant_id = revision.tenant_id AND source.id = revision.source_id AND source.status = ''active''\n      JOIN tenancy.knowledge_chunks chunk\n        ON chunk.tenant_id = pin.tenant_id AND chunk.source_revision_id = pin.source_revision_id';
BEGIN
  FOR item IN SELECT procedure.oid, procedure.proname FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'tenancy' AND procedure.proname IN ('begin_ai_turn', 'begin_ai_social_turn')
  LOOP
    definition := pg_get_functiondef(item.oid);
    IF position(old_join IN definition) = 0 THEN
      RAISE EXCEPTION 'active_knowledge_join_not_found:%', item.proname;
    END IF;
    definition := replace(definition, old_join, active_join);
    EXECUTE definition;
  END LOOP;
END
$migration$;

REVOKE ALL ON FUNCTION tenancy.assert_publishable_knowledge_revision() FROM PUBLIC;
