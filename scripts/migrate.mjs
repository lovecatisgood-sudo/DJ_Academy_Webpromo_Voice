import { neon } from "@neondatabase/serverless";
import { redactError, requireDatabaseUrl } from "./env-utils.mjs";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv();

const initialKnowledgeMarkdown = `# DJAI Academy Voice Agent Knowledge

## Services
- Landing pages
- Business websites
- AI chatbots
- AI voice agents
- Custom software
- Mobile and web apps
- Games
- Automation workflows
- In-person vibe-coding courses

## Pricing Posture
- Only state prices that are explicitly listed in this knowledge document.
- If the visitor asks for a price that is not listed here, say a human will confirm after reviewing the scope.
- Custom software, apps, games, automation, and voice agents are quotation-based unless a specific package is listed here.

## Course Info
- DJAI Academy offers in-person vibe-coding courses in Bangkok.
- Course details, schedules, and prices must be confirmed by the DJAI team unless listed here.

## Contact Policy
- When a visitor shows meaningful interest, collect their name, one usable contact method, project need, and preferred callback time.
- Tell visitors the DJAI team will contact them. Do not claim a booking is confirmed.
`;

async function migrate() {
  const sql = neon(requireDatabaseUrl());

  await sql`create extension if not exists pgcrypto`;

  await sql`
    create table if not exists settings (
      id int primary key default 1,
      agent_enabled boolean default true,
      greeting text,
      voice text default 'marin',
      language_mode text default 'auto_th_en',
      knowledge_md text,
      knowledge_version int default 1,
      max_call_seconds int default 600,
      daily_session_cap int default 100,
      model_id text default 'gpt-realtime',
      transcription_model text default 'gpt-4o-mini-transcribe',
      updated_at timestamptz default now()
    )
  `;

  await sql`
    alter table settings
    add column if not exists transcription_model text default 'gpt-4o-mini-transcribe'
  `;

  await sql`
    create table if not exists conversations (
      id uuid primary key default gen_random_uuid(),
      started_at timestamptz default now(),
      ended_at timestamptz,
      duration_seconds int,
      language text,
      page_url text,
      transcript jsonb,
      had_lead boolean default false
    )
  `;

  await sql`
    create table if not exists leads (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid references conversations(id),
      created_at timestamptz default now(),
      name text,
      contact text,
      contact_type text,
      need text,
      preferred_time text,
      status text default 'new'
    )
  `;

  await sql`
    create unique index if not exists leads_conversation_contact_unique
    on leads (conversation_id, contact)
  `;

  await sql`
    create index if not exists conversations_started_at_idx
    on conversations (started_at desc)
  `;

  await sql`
    create index if not exists conversations_had_lead_idx
    on conversations (had_lead)
  `;

  await sql`
    create index if not exists leads_created_at_idx
    on leads (created_at desc)
  `;

  await sql`
    create index if not exists leads_status_idx
    on leads (status)
  `;

  await sql`
    insert into settings (
      id,
      agent_enabled,
      greeting,
      voice,
      language_mode,
      knowledge_md,
      knowledge_version,
      max_call_seconds,
      daily_session_cap,
      model_id,
      transcription_model
    )
    values (
      1,
      true,
      'Hi, this is DJAI Academy. Tell me what you want to build, and I will help you choose the right next step.',
      'marin',
      'auto_th_en',
      ${initialKnowledgeMarkdown},
      1,
      600,
      100,
      'gpt-realtime',
      'gpt-4o-mini-transcribe'
    )
    on conflict (id) do nothing
  `;
}

migrate()
  .then(() => {
    console.log("Migrations applied and settings row seeded.");
  })
  .catch((error) => {
    console.error(`Migration failed: ${redactError(error)}`);
    process.exit(1);
  });
