CREATE INDEX tenancy_voice_sessions_analytics
  ON tenancy.voice_sessions(tenant_id, deployment_id, created_at DESC, id);

CREATE INDEX tenancy_voice_turns_analytics
  ON tenancy.voice_turns(tenant_id, session_id, started_at DESC, id);

CREATE INDEX tenancy_voice_connections_analytics
  ON tenancy.voice_session_connections(tenant_id, session_id, connected_at, id);

CREATE INDEX tenancy_voice_outcomes_analytics
  ON tenancy.voice_call_outcomes(tenant_id, session_id, created_at DESC, id);

CREATE INDEX tenancy_voice_callbacks_analytics
  ON tenancy.voice_callback_requests(tenant_id, session_id, created_at DESC, id);

CREATE INDEX tenancy_appointment_requests_conversation_analytics
  ON tenancy.appointment_requests(tenant_id, conversation_id, created_at DESC, id)
  WHERE conversation_id IS NOT NULL;
