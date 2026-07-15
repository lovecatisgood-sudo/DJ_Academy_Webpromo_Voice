CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer,
  language text,
  transcript jsonb,
  summary text,
  business_type text,
  main_problem text,
  business_goal text,
  interest_level text,
  concern_or_objection text,
  recommended_service text,
  next_action text,
  starred boolean DEFAULT false,
  deleted_at timestamptz,
  channel text NOT NULL,
  interaction_mode text NOT NULL,
  last_message_at timestamptz,
  provider text,
  model_id text
);

CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  channel text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE leads (
  id uuid PRIMARY KEY,
  conversation_id uuid REFERENCES conversations(id),
  name text,
  contact text,
  contact_type text,
  need text,
  preferred_time text,
  status text,
  client_name text,
  company_name text,
  phone text,
  email text,
  line_id text,
  whatsapp text,
  other_contact text,
  preferred_contact_method text,
  preferred_meeting_day text,
  preferred_meeting_time text,
  admin_notes text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz,
  source_channel text,
  source_mode text,
  assigned_admin_id uuid
);

INSERT INTO conversations (
  id, started_at, ended_at, duration_seconds, language, summary,
  business_type, main_problem, business_goal, interest_level,
  recommended_service, next_action, channel, interaction_mode,
  last_message_at, provider, model_id
) VALUES
  ('71000000-0000-4000-8000-000000000001', '2026-06-01T01:00:00Z', '2026-06-01T01:02:00Z', 120, 'th',
   'Qualified Voice enquiry', 'Retail', 'Slow response', 'More consultations', 'high',
   'AI sales assistant', 'Call back', 'voice_widget', 'voice', '2026-06-01T01:02:00Z',
   'must-never-cross-boundary', 'must-never-cross-boundary'),
  ('71000000-0000-4000-8000-000000000002', '2026-06-02T01:00:00Z', '2026-06-02T01:01:00Z', NULL, 'en',
   'Chat enquiry', 'Services', 'Manual qualification', 'Book a consultation', 'medium',
   'AI chat', 'Email details', 'text_widget', 'text', '2026-06-02T01:01:00Z',
   'must-never-cross-boundary', 'must-never-cross-boundary'),
  ('71000000-0000-4000-8000-000000000003', '2026-06-03T01:00:00Z', '2026-06-03T01:01:00Z', 60, 'en',
   'Deleted conversation', NULL, NULL, NULL, NULL, NULL, NULL,
   'voice_widget', 'voice', '2026-06-03T01:01:00Z', 'must-never-cross-boundary',
   'must-never-cross-boundary');

UPDATE conversations SET deleted_at = '2026-06-04T01:00:00Z'
WHERE id = '71000000-0000-4000-8000-000000000003';

INSERT INTO conversation_messages (id, conversation_id, channel, role, content, created_at) VALUES
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'voice_widget', 'user', 'สนใจระบบช่วยขาย', '2026-06-01T01:00:10Z'),
  ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'voice_widget', 'assistant', 'ยินดีช่วยประเมินความต้องการ', '2026-06-01T01:00:20Z'),
  ('72000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002', 'text_widget', 'user', 'Can you help qualify website leads?', '2026-06-02T01:00:10Z'),
  ('72000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000002', 'text_widget', 'assistant', 'Yes. Let us review your sales process.', '2026-06-02T01:00:20Z');

INSERT INTO leads (
  id, conversation_id, status, client_name, company_name, phone, email,
  need, preferred_contact_method, preferred_meeting_day,
  preferred_meeting_time, created_at, updated_at, source_channel, source_mode
) VALUES
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
   'appointment_set', 'สมชาย', 'Example Retail', '+66 81 234 5678', 'somchai@example.test',
   'Improve lead response', 'phone', 'Friday', '10:00',
   '2026-06-01T01:01:00Z', '2026-06-01T01:02:00Z', 'voice_widget', 'voice'),
  ('73000000-0000-4000-8000-000000000002', NULL,
   'pending_follow_up', 'Orphan Lead', 'Example Services', NULL, 'orphan@example.test',
   'Review automation options', 'email', NULL, NULL,
   '2026-06-05T01:00:00Z', '2026-06-05T01:00:00Z', 'text_widget', 'text');
