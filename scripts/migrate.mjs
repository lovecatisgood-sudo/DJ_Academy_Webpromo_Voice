import { neon } from "@neondatabase/serverless";
import { redactError, requireDatabaseUrl } from "./env-utils.mjs";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv();

const legacyKnowledgeMarkdown = `# DJAI Academy Voice Agent Knowledge

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

## Website Packages Published On The Landing Page

### Landing Page
- Promotional price: 5,000 THB.
- Original listed price: 10,000 THB.
- Promotion is valid for July and August 2026.
- Best for a single product, campaign, lead generation, ads, promotions, menus, portfolios, and simple business launches.
- Includes: 1 custom-designed page, SEO optimization, AI Chat Bot (Auto CTA) 1-month free trial, first-year hosting, mobile responsive layout, and fast turnaround.
- Renewal note: 3,000 THB/year after the first year.

### Additional Page
- Promotional price: 3,000 THB/page.
- Original listed price: 5,000 THB/page.
- Best for expanding an existing website with extra pages.
- Includes: design consistency, SEO optimization, AI Chat Bot 1-month free trial, quick turnaround, and mobile responsive layout.
- Renewal note: covered under the customer's maintenance plan.

### Complete Website
- Promotional price: 10,000 THB.
- Original listed price: 20,000 THB.
- Best for a full 5-page business website.
- Includes: 5 custom-designed pages, responsive design, SEO-ready structure, professional UI, contact page, gallery, business information, contact form, social media integration, first-year hosting, mobile responsive layout, and priority support.
- Landing page comparison states that buying 5 pages individually would be 15,000 THB, the bundle price is 10,000 THB, and the customer saves 5,000 THB.
- Renewal note: 3,000 THB/year after the first year.

## AI Sales Chatbot
- Acts like a professional salesperson on the website.
- Can answer questions, recommend products or services, handle objections, collect leads, qualify prospects, and help book appointments.
- Available 24/7.
- Supports multiple languages.
- Useful when paid traffic is being lost, visitors have questions before buying, or staff cannot respond instantly.

## AI Voice Agent
- Works like an AI receptionist or AI phone sales assistant.
- Can answer calls, handle FAQs, qualify customers, book appointments, transfer leads, and collect information.
- Supports multiple languages.
- Useful when the business misses calls, needs faster first response, needs multilingual reception, or wants to qualify leads before a human call.

## Custom Development And Automation Signals
- Investigate further if the visitor mentions Excel, paper, manual work, inventory, POS, CRM, scheduling, membership, booking, reports, multiple branches, internal systems, many employees, or repetitive tasks.
- Custom development, apps, games, automation, and voice agents are quotation-based unless a specific package is listed here.
- Do not immediately pitch software. First ask how they do the process today and what the business impact is.

## Trust And Included-Service Claims
- The landing page states: no hidden fees, money-back guarantee, and free revisions.
- Every package includes custom web design, SEO optimization, AI Chat Bot (Auto CTA) 1-month free trial, and first-year hosting where the package states hosting is included.
- Hosting after the first year is listed as 3,000 THB/year where the package states that renewal note.

## Pricing Posture
- Only state prices that are explicitly listed in this knowledge document.
- If the visitor asks for a price that is not listed here, say a human will confirm after reviewing the scope.
- Custom software, apps, games, automation, and voice agents are quotation-based unless a specific package is listed here.

## Course Info
- DJAI Academy offers in-person vibe-coding courses in Bangkok.
- Course details, schedules, and prices must be confirmed by the DJAI team unless listed here.

## Contact Policy
- When a visitor shows meaningful interest, collect their name, company or business name if available, one or more usable contact methods, project need, and preferred callback or consultation time.
- Tell visitors the DJAI consultant will review their business context before the consultation so the call can focus on specific opportunities.
- Do not claim a booking is fully confirmed.
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

  await sql`alter table settings alter column model_id set default 'gpt-realtime-2.1'`;
  await sql`alter table settings alter column transcription_model set default 'gpt-realtime-whisper'`;

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
      'gpt-realtime-2.1',
      'gpt-realtime-whisper'
    )
    on conflict (id) do nothing
  `;

  await sql`
    update settings set
      model_id = case when model_id = 'gpt-realtime' then 'gpt-realtime-2.1' else model_id end,
      transcription_model = case when transcription_model = 'gpt-4o-mini-transcribe' then 'gpt-realtime-whisper' else transcription_model end,
      greeting = case
        when greeting = 'Hi, this is DJAI Academy. Tell me what you want to build, and I will help you choose the right next step.'
          then 'Hi, I am DJ from DJAI Academy. What kind of business are you running, and what are you trying to improve right now?'
        else greeting
      end,
      knowledge_md = case when knowledge_md = ${legacyKnowledgeMarkdown} then ${initialKnowledgeMarkdown} else knowledge_md end,
      updated_at = now()
    where id = 1
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
