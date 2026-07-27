import { randomBytes, scryptSync } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { readEnv, redactError, requireDatabaseUrl } from "./env-utils.mjs";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv();

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${key}`;
}

const seedAdminUsername = readEnv("ADMIN_USERNAME");
const seedAdminPassword = readEnv("ADMIN_PASSWORD");
const seedAdminName = seedAdminUsername || "Master Admin";
const seedAdminPasswordHash = seedAdminPassword ? hashPassword(seedAdminPassword) : "";

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

const initialKnowledgeMarkdown = `# คลังความรู้สำหรับผู้ช่วย AI ของ DJAI Academy

## บริการ
- Landing Page และเว็บไซต์ธุรกิจ
- แชตบอต AI และผู้ช่วยสนทนาด้วยเสียง AI
- ซอฟต์แวร์ตามความต้องการ แอปมือถือ เว็บแอป เกม และระบบอัตโนมัติ
- คอร์ส vibe coding แบบเรียนในสถานที่

## แพ็กเกจเว็บไซต์ที่เผยแพร่บนหน้าเว็บไซต์

### Landing Page
- ราคาโปรโมชัน 5,000 บาท จากราคาปกติ 10,000 บาท โปรโมชันใช้ได้ในเดือนกรกฎาคมและสิงหาคม 2026
- เหมาะกับสินค้าเดี่ยว แคมเปญ การเก็บข้อมูลผู้สนใจ โฆษณา โปรโมชัน เมนู พอร์ตโฟลิโอ และการเริ่มธุรกิจด้วยเว็บหน้าเดียว
- รวมหน้าเว็บที่ออกแบบเฉพาะธุรกิจ 1 หน้า การวางโครงสร้าง SEO ทดลองใช้ AI Chat Bot (Auto CTA) ฟรี 1 เดือน โฮสติ้งปีแรก การแสดงผลที่รองรับมือถือ และการส่งมอบงานรวดเร็ว
- ค่าต่ออายุหลังปีแรก 3,000 บาทต่อปี

### หน้าเพิ่มเติม
- ราคาโปรโมชัน 3,000 บาทต่อหน้า จากราคาปกติ 5,000 บาทต่อหน้า
- เหมาะสำหรับเพิ่มหน้าใหม่ให้เว็บไซต์เดิม โดยรวมการออกแบบให้สอดคล้องกับเว็บไซต์เดิม การวางโครงสร้าง SEO ทดลองใช้ AI Chat Bot ฟรี 1 เดือน การส่งมอบงานรวดเร็ว และการแสดงผลที่รองรับมือถือ
- ค่าดูแลรวมอยู่ในแผนดูแลเว็บไซต์ของลูกค้า

### Complete Website
- ราคาโปรโมชัน 10,000 บาท จากราคาปกติ 20,000 บาท
- เหมาะสำหรับเว็บไซต์ธุรกิจครบชุด 5 หน้า
- รวมหน้าเว็บที่ออกแบบเฉพาะธุรกิจ 5 หน้า ดีไซน์ที่รองรับทุกขนาดหน้าจอ โครงสร้างพร้อมสำหรับ SEO ส่วนติดต่อผู้ใช้ระดับมืออาชีพ หน้าติดต่อ แกลเลอรี ข้อมูลธุรกิจ ฟอร์มติดต่อ การเชื่อมต่อโซเชียลมีเดีย โฮสติ้งปีแรก และสิทธิ์รับบริการก่อน
- ค่าต่ออายุหลังปีแรก 3,000 บาทต่อปี

## แชตบอตฝ่ายขาย AI
- ทำหน้าที่เสมือนพนักงานขายบนเว็บไซต์ ตอบคำถาม แนะนำบริการ รับมือข้อกังวล เก็บและคัดกรองข้อมูลผู้สนใจ รวมถึงช่วยนัดหมายได้ตลอด 24 ชั่วโมงและรองรับหลายภาษา
- เหมาะเมื่อธุรกิจสูญเสียผู้เข้าชมจากโฆษณา ลูกค้ามีคำถามก่อนซื้อ หรือทีมงานตอบกลับไม่ได้ทันที

## ผู้ช่วยสนทนาด้วยเสียง AI
- ทำหน้าที่เสมือนพนักงานต้อนรับหรือผู้ช่วยฝ่ายขายทางโทรศัพท์ รับสาย ตอบคำถามที่พบบ่อย คัดกรองลูกค้า นัดหมาย ส่งต่อข้อมูลผู้สนใจ และเก็บข้อมูลได้
- รองรับหลายภาษา เหมาะเมื่อธุรกิจพลาดสาย ต้องการตอบกลับเร็วขึ้น หรือต้องการคัดกรองผู้สนใจก่อนให้ทีมงานติดต่อ

## ซอฟต์แวร์และระบบอัตโนมัติ
- ถามรายละเอียดเพิ่มเมื่อผู้เข้าชมกล่าวถึง Excel เอกสารกระดาษ งานที่ทำด้วยมือ สินค้าคงคลัง POS, CRM, ตารางนัดหมาย สมาชิก การจอง รายงาน หลายสาขา ระบบภายใน พนักงานจำนวนมาก หรืองานซ้ำ ๆ
- ซอฟต์แวร์ แอป เกม ระบบอัตโนมัติ และผู้ช่วยเสียง AI ที่พัฒนาตามความต้องการต้องประเมินราคาเป็นรายงาน เว้นแต่เอกสารนี้ระบุแพ็กเกจไว้ชัดเจน
- อย่ารีบเสนอขายซอฟต์แวร์ ให้ถามก่อนว่าปัจจุบันลูกค้าทำขั้นตอนนั้นอย่างไรและส่งผลต่อธุรกิจอย่างไร

## ข้อความรับรองและหลักการแจ้งราคา
- หน้าเว็บไซต์ระบุว่าไม่มีค่าธรรมเนียมแอบแฝง รับประกันคืนเงิน และแก้ไขงานฟรี
- ทุกแพ็กเกจรวมการออกแบบเว็บไซต์เฉพาะธุรกิจ การวางโครงสร้าง SEO และทดลองใช้ AI Chat Bot (Auto CTA) ฟรี 1 เดือน ส่วนโฮสติ้งปีแรกให้ยึดตามรายละเอียดแต่ละแพ็กเกจ
- แจ้งเฉพาะราคาที่ระบุในเอกสารนี้ หากไม่มีราคา ให้แจ้งว่าทีมงานจะยืนยันหลังตรวจสอบขอบเขตงาน

## ข้อมูลคอร์ส
- DJAI Academy มีคอร์ส vibe coding แบบเรียนในสถานที่ในกรุงเทพฯ
- รายละเอียด กำหนดการ และราคาคอร์สต้องให้ทีม DJAI ยืนยัน เว้นแต่จะระบุไว้ในเอกสารนี้

## แนวทางเก็บข้อมูลติดต่อ
- เมื่อผู้เข้าชมแสดงความสนใจชัดเจน ให้เก็บชื่อ ชื่อบริษัทหรือธุรกิจถ้ามี ช่องทางติดต่อที่ใช้งานได้ ความต้องการของโครงการ และวันหรือเวลาที่สะดวกให้ติดต่อกลับหรือนัดปรึกษา
- แจ้งว่าที่ปรึกษา DJAI จะศึกษาบริบทธุรกิจก่อนการนัดหมาย และห้ามแจ้งว่าการนัดหมายได้รับการยืนยันจนกว่าระบบหรือทีมงานจะยืนยัน
`;

async function migrate() {
  const sql = neon(requireDatabaseUrl());

  await sql.transaction((tx) => [
    tx`create extension if not exists pgcrypto`,
    tx`
      create table if not exists admin_users (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        username text unique not null,
        email text unique,
        password_hash text not null,
        role text not null default 'admin',
        is_active boolean not null default true,
        last_login_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        deleted_at timestamptz
      )
    `,
    tx`alter table admin_users add column if not exists name text`,
    tx`alter table admin_users add column if not exists username text`,
    tx`alter table admin_users add column if not exists email text`,
    tx`alter table admin_users add column if not exists password_hash text`,
    tx`alter table admin_users add column if not exists role text not null default 'admin'`,
    tx`alter table admin_users add column if not exists is_active boolean not null default true`,
    tx`alter table admin_users add column if not exists last_login_at timestamptz`,
    tx`alter table admin_users add column if not exists created_at timestamptz not null default now()`,
    tx`alter table admin_users add column if not exists updated_at timestamptz not null default now()`,
    tx`alter table admin_users add column if not exists deleted_at timestamptz`,
    tx`alter table admin_users alter column role set default 'admin'`,
    tx`alter table admin_users alter column is_active set default true`,
    tx`alter table admin_users alter column created_at set default now()`,
    tx`alter table admin_users alter column updated_at set default now()`,
    tx`
      insert into admin_users (name, username, password_hash, role, is_active)
      select ${seedAdminName}, ${seedAdminUsername}, ${seedAdminPasswordHash}, 'master_admin', true
      where ${seedAdminUsername} <> ''
        and ${seedAdminPasswordHash} <> ''
        and not exists (select 1 from admin_users where deleted_at is null)
    `,
    tx`
      create table if not exists settings (
        id int primary key default 1,
        agent_enabled boolean default true,
        greeting text,
        voice text default 'marin',
        voice_provider text default 'openai',
        language_mode text default 'thai_first',
        knowledge_md text,
        knowledge_version int default 1,
        max_call_seconds int default 600,
        daily_session_cap int default 100,
        model_id text default 'gpt-realtime-2.1',
        transcription_model text default 'gpt-realtime-whisper',
        analysis_enabled boolean default true,
        analysis_model_id text default 'gpt-4o-mini',
        booking_enabled boolean default true,
        active_booking_admin_id uuid references admin_users(id),
        active_booking_link_id uuid,
        default_timezone text default 'Asia/Bangkok',
        require_booking_confirmation boolean default true,
        default_booking_window_days int default 30,
        updated_at timestamptz default now()
      )
    `,
    tx`
      alter table settings
      add column if not exists transcription_model text default 'gpt-realtime-whisper'
    `,
    tx`
      alter table settings
      add column if not exists voice_provider text default 'openai'
    `,
    tx`
      alter table settings
      add column if not exists analysis_enabled boolean default true
    `,
    tx`
      alter table settings
      add column if not exists analysis_model_id text default 'gpt-4o-mini'
    `,
    tx`
      alter table settings
      add column if not exists booking_enabled boolean default true
    `,
    tx`
      alter table settings
      add column if not exists active_booking_admin_id uuid references admin_users(id)
    `,
    tx`
      alter table settings
      add column if not exists active_booking_link_id uuid
    `,
    tx`
      alter table settings
      add column if not exists default_timezone text default 'Asia/Bangkok'
    `,
    tx`
      alter table settings
      add column if not exists require_booking_confirmation boolean default true
    `,
    tx`
      alter table settings
      add column if not exists default_booking_window_days int default 30
    `,
    tx`
      alter table settings
      add column if not exists text_chat_enabled boolean default true
    `,
    tx`
      alter table settings
      add column if not exists text_chat_model_id text default 'gpt-5-mini'
    `,
    tx`
      alter table settings
      add column if not exists text_chat_greeting text
    `,
    tx`
      alter table settings
      add column if not exists text_chat_max_messages int default 40
    `,
    tx`
      alter table settings
      add column if not exists text_chat_daily_session_cap int default 200
    `,
    tx`alter table settings alter column model_id set default 'gpt-realtime-2.1'`,
    tx`alter table settings alter column transcription_model set default 'gpt-realtime-whisper'`,
    tx`alter table settings alter column analysis_enabled set default true`,
    tx`alter table settings alter column analysis_model_id set default 'gpt-4o-mini'`,
    tx`alter table settings alter column booking_enabled set default true`,
    tx`alter table settings alter column default_timezone set default 'Asia/Bangkok'`,
    tx`alter table settings alter column require_booking_confirmation set default true`,
    tx`alter table settings alter column default_booking_window_days set default 30`,
    tx`alter table settings alter column text_chat_enabled set default true`,
    tx`alter table settings alter column text_chat_model_id set default 'gpt-5-mini'`,
    tx`alter table settings alter column text_chat_max_messages set default 40`,
    tx`alter table settings alter column text_chat_daily_session_cap set default 200`,
    tx`
      create table if not exists conversations (
        id uuid primary key default gen_random_uuid(),
        started_at timestamptz default now(),
        ended_at timestamptz,
        duration_seconds int,
        language text,
        page_url text,
        transcript jsonb,
        had_lead boolean default false,
        summary text,
        business_type text,
        main_problem text,
        business_goal text,
        interest_level text default 'unknown',
        concern_or_objection text,
        recommended_service text,
        next_action text,
        analysis_status text default 'pending',
        analysis_error text,
        analysis_model_id text,
        analysis_updated_at timestamptz,
        starred boolean default false,
        deleted_at timestamptz,
        assigned_admin_id uuid references admin_users(id),
        channel text not null default 'voice_widget',
        interaction_mode text not null default 'voice',
        provider text,
        model_id text,
        last_message_at timestamptz,
        message_count int not null default 0
      )
    `,
    tx`alter table conversations add column if not exists summary text`,
    tx`alter table conversations add column if not exists business_type text`,
    tx`alter table conversations add column if not exists main_problem text`,
    tx`alter table conversations add column if not exists business_goal text`,
    tx`alter table conversations add column if not exists interest_level text default 'unknown'`,
    tx`alter table conversations add column if not exists concern_or_objection text`,
    tx`alter table conversations add column if not exists recommended_service text`,
    tx`alter table conversations add column if not exists next_action text`,
    tx`alter table conversations add column if not exists analysis_status text default 'pending'`,
    tx`alter table conversations add column if not exists analysis_error text`,
    tx`alter table conversations add column if not exists analysis_model_id text`,
    tx`alter table conversations add column if not exists analysis_updated_at timestamptz`,
    tx`alter table conversations add column if not exists starred boolean default false`,
    tx`alter table conversations add column if not exists deleted_at timestamptz`,
    tx`alter table conversations add column if not exists assigned_admin_id uuid references admin_users(id)`,
    tx`alter table conversations add column if not exists channel text not null default 'voice_widget'`,
    tx`alter table conversations add column if not exists interaction_mode text not null default 'voice'`,
    tx`alter table conversations add column if not exists provider text`,
    tx`alter table conversations add column if not exists model_id text`,
    tx`alter table conversations add column if not exists last_message_at timestamptz`,
    tx`alter table conversations add column if not exists message_count int not null default 0`,
    tx`alter table conversations alter column interest_level set default 'unknown'`,
    tx`alter table conversations alter column analysis_status set default 'pending'`,
    tx`alter table conversations alter column starred set default false`,
    tx`alter table conversations alter column channel set default 'voice_widget'`,
    tx`alter table conversations alter column interaction_mode set default 'voice'`,
    tx`alter table conversations alter column message_count set default 0`,
    tx`
      create table if not exists conversation_messages (
        id uuid primary key default gen_random_uuid(),
        conversation_id uuid not null references conversations(id),
        channel text not null,
        role text not null,
        content text not null,
        token_count int,
        metadata jsonb,
        created_at timestamptz not null default now()
      )
    `,
    tx`
      create table if not exists leads (
        id uuid primary key default gen_random_uuid(),
        conversation_id uuid references conversations(id),
        created_at timestamptz default now(),
        name text,
        contact text,
        contact_type text,
        need text,
        preferred_time text,
        status text default 'pending_follow_up',
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
        assigned_admin_id uuid references admin_users(id),
        updated_at timestamptz default now(),
        source_channel text default 'voice_widget',
        source_mode text default 'voice'
      )
    `,
    tx`alter table leads add column if not exists client_name text`,
    tx`alter table leads add column if not exists company_name text`,
    tx`alter table leads add column if not exists phone text`,
    tx`alter table leads add column if not exists email text`,
    tx`alter table leads add column if not exists line_id text`,
    tx`alter table leads add column if not exists whatsapp text`,
    tx`alter table leads add column if not exists other_contact text`,
    tx`alter table leads add column if not exists preferred_contact_method text`,
    tx`alter table leads add column if not exists preferred_meeting_day text`,
    tx`alter table leads add column if not exists preferred_meeting_time text`,
    tx`alter table leads add column if not exists admin_notes text`,
    tx`alter table leads add column if not exists assigned_admin_id uuid references admin_users(id)`,
    tx`alter table leads add column if not exists updated_at timestamptz default now()`,
    tx`alter table leads add column if not exists source_channel text default 'voice_widget'`,
    tx`alter table leads add column if not exists source_mode text default 'voice'`,
    tx`alter table leads alter column status set default 'pending_follow_up'`,
    tx`alter table leads alter column updated_at set default now()`,
    tx`alter table leads alter column source_channel set default 'voice_widget'`,
    tx`alter table leads alter column source_mode set default 'voice'`,
    tx`
      create table if not exists admin_calendar_profiles (
        id uuid primary key default gen_random_uuid(),
        admin_user_id uuid not null references admin_users(id),
        display_name text not null,
        booking_slug text unique not null,
        timezone text not null default 'Asia/Bangkok',
        meeting_title text not null default 'ปรึกษากับ DJAI',
        meeting_location text,
        default_duration_minutes int not null default 30,
        buffer_before_minutes int not null default 0,
        buffer_after_minutes int not null default 0,
        minimum_notice_minutes int not null default 240,
        max_bookings_per_day int,
        booking_window_days int not null default 30,
        is_active boolean not null default true,
        allow_admin_self_edit boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `,
    tx`
      create table if not exists booking_links (
        id uuid primary key default gen_random_uuid(),
        owner_admin_id uuid not null references admin_users(id),
        name text not null,
        slug text unique not null,
        title text not null,
        description text,
        meeting_location text,
        duration_minutes int not null,
        buffer_before_minutes int not null default 0,
        buffer_after_minutes int not null default 0,
        minimum_notice_minutes int not null default 240,
        max_bookings_per_day int,
        booking_window_days int not null default 30,
        require_confirmation boolean not null default true,
        is_active boolean not null default true,
        is_ai_active boolean not null default false,
        deleted_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `,
    tx`alter table booking_links add column if not exists owner_admin_id uuid references admin_users(id)`,
    tx`alter table booking_links add column if not exists name text`,
    tx`alter table booking_links add column if not exists slug text`,
    tx`alter table booking_links add column if not exists title text`,
    tx`alter table booking_links add column if not exists description text`,
    tx`alter table booking_links add column if not exists meeting_location text`,
    tx`alter table booking_links add column if not exists duration_minutes int not null default 30`,
    tx`alter table booking_links add column if not exists buffer_before_minutes int not null default 0`,
    tx`alter table booking_links add column if not exists buffer_after_minutes int not null default 0`,
    tx`alter table booking_links add column if not exists minimum_notice_minutes int not null default 240`,
    tx`alter table booking_links add column if not exists max_bookings_per_day int`,
    tx`alter table booking_links add column if not exists booking_window_days int not null default 30`,
    tx`alter table booking_links add column if not exists require_confirmation boolean not null default true`,
    tx`alter table booking_links add column if not exists is_active boolean not null default true`,
    tx`alter table booking_links add column if not exists is_ai_active boolean not null default false`,
    tx`alter table booking_links add column if not exists deleted_at timestamptz`,
    tx`alter table booking_links add column if not exists created_at timestamptz not null default now()`,
    tx`alter table booking_links add column if not exists updated_at timestamptz not null default now()`,
    tx`alter table booking_links alter column duration_minutes set default 30`,
    tx`alter table booking_links alter column buffer_before_minutes set default 0`,
    tx`alter table booking_links alter column buffer_after_minutes set default 0`,
    tx`alter table booking_links alter column minimum_notice_minutes set default 240`,
    tx`alter table booking_links alter column booking_window_days set default 30`,
    tx`alter table booking_links alter column require_confirmation set default true`,
    tx`alter table booking_links alter column is_active set default true`,
    tx`alter table booking_links alter column is_ai_active set default false`,
    tx`
      create table if not exists availability_rules (
        id uuid primary key default gen_random_uuid(),
        admin_user_id uuid not null references admin_users(id),
        weekday int not null,
        start_time time not null,
        end_time time not null,
        timezone text not null default 'Asia/Bangkok',
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `,
    tx`
      create table if not exists availability_overrides (
        id uuid primary key default gen_random_uuid(),
        admin_user_id uuid not null references admin_users(id),
        override_type text not null,
        starts_at timestamptz not null,
        ends_at timestamptz not null,
        reason text,
        created_by_admin_id uuid references admin_users(id),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `,
    tx`
      create table if not exists meeting_types (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        description text,
        duration_minutes int not null default 30,
        is_default boolean not null default false,
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `,
    tx`
      create table if not exists appointments (
        id uuid primary key default gen_random_uuid(),
        lead_id uuid references leads(id),
        conversation_id uuid references conversations(id),
        assigned_admin_id uuid references admin_users(id),
        assigned_admin_name_snapshot text,
        meeting_type_id uuid references meeting_types(id),
        booking_link_id uuid references booking_links(id),
        status text not null default 'pending_confirmation',
        source text not null default 'voice_agent',
        start_at timestamptz not null,
        end_at timestamptz not null,
        timezone text not null default 'Asia/Bangkok',
        duration_minutes int not null,
        client_name text not null,
        company_name text,
        email text not null,
        phone text,
        line_id text,
        whatsapp text,
        note text,
        meeting_location text,
        admin_notes text,
        confirmed_at timestamptz,
        rejected_at timestamptz,
        cancelled_at timestamptz,
        completed_at timestamptz,
        no_show_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        deleted_at timestamptz
      )
    `,
    tx`alter table appointments add column if not exists booking_link_id uuid references booking_links(id)`,
    /*
     * Server-side booking context store.
     *
     * Booking context used to travel in the `?context=` query parameter of the booking URL as
     * a signed-but-unencrypted payload containing the customer's name, company, email, phone,
     * LINE ID, and WhatsApp number. A signature prevents tampering; it does not provide
     * confidentiality. That PII therefore leaked into browser history, server and proxy access
     * logs, analytics referrers, and any screenshot or shared link.
     *
     * The URL now carries only an opaque random token. The PII lives here, server-side, with a
     * short expiry and single-use semantics on the mutation that consumes it.
     */
    tx`
      create table if not exists booking_contexts (
        token text primary key,
        payload jsonb not null,
        lead_id uuid references leads(id),
        conversation_id uuid references conversations(id),
        expires_at timestamptz not null,
        consumed_at timestamptz,
        created_at timestamptz not null default now()
      )
    `,
    tx`create index if not exists booking_contexts_expires_at_idx on booking_contexts (expires_at)`,
    /*
     * Retention: contexts are disposable and hold PII, so purge aggressively rather than
     * accumulating them. Anything past expiry has no remaining use.
     */
    tx`delete from booking_contexts where expires_at < now() - interval '7 days'`,
    tx`
      insert into meeting_types (name, description, duration_minutes, is_default, is_active)
      select 'ปรึกษาเบื้องต้นฟรี', 'พูดคุยเบื้องต้นสำหรับผู้สนใจบริการของ DJAI', 30, true, true
      where not exists (select 1 from meeting_types where is_default = true)
    `,
    tx`
      insert into admin_calendar_profiles (
        admin_user_id,
        display_name,
        booking_slug,
        timezone,
        meeting_title,
        default_duration_minutes
      )
      select
        au.id,
        au.name,
        lower(regexp_replace(au.username, '[^a-zA-Z0-9]+', '-', 'g')),
        'Asia/Bangkok',
        'ปรึกษากับ DJAI',
        30
      from admin_users au
      where au.role = 'master_admin'
        and au.deleted_at is null
        and not exists (
          select 1 from admin_calendar_profiles acp where acp.admin_user_id = au.id
        )
      order by au.created_at asc
      limit 1
    `,
    tx`
      insert into booking_links (
        owner_admin_id,
        name,
        slug,
        title,
        description,
        meeting_location,
        duration_minutes,
        buffer_before_minutes,
        buffer_after_minutes,
        minimum_notice_minutes,
        max_bookings_per_day,
        booking_window_days,
        require_confirmation,
        is_active,
        is_ai_active
      )
      select
        acp.admin_user_id,
        'ปรึกษาเบื้องต้นฟรี',
        acp.booking_slug,
        acp.meeting_title,
        'พูดคุยเบื้องต้นเกี่ยวกับธุรกิจและบริการที่เหมาะสมกับทีม DJAI',
        acp.meeting_location,
        acp.default_duration_minutes,
        acp.buffer_before_minutes,
        acp.buffer_after_minutes,
        acp.minimum_notice_minutes,
        acp.max_bookings_per_day,
        acp.booking_window_days,
        true,
        acp.is_active,
        false
      from admin_calendar_profiles acp
      where acp.booking_slug is not null
        and not exists (
          select 1 from booking_links bl where bl.slug = acp.booking_slug
        )
    `,
    tx`
      create unique index if not exists leads_conversation_contact_unique
      on leads (conversation_id, contact)
    `,
    tx`
      create index if not exists conversations_started_at_idx
      on conversations (started_at desc)
    `,
    tx`
      create index if not exists conversations_had_lead_idx
      on conversations (had_lead)
    `,
    tx`
      create index if not exists leads_created_at_idx
      on leads (created_at desc)
    `,
    tx`
      create index if not exists leads_status_idx
      on leads (status)
    `,
    tx`
      create index if not exists admin_users_role_idx
      on admin_users (role)
    `,
    tx`
      create index if not exists admin_users_deleted_at_idx
      on admin_users (deleted_at)
    `,
    tx`
      create index if not exists conversations_assigned_admin_idx
      on conversations (assigned_admin_id)
    `,
    tx`
      create index if not exists conversations_channel_started_idx
      on conversations (channel, started_at desc)
      where deleted_at is null
    `,
    tx`
      create index if not exists conversations_channel_interest_idx
      on conversations (channel, interest_level, started_at desc)
      where deleted_at is null
    `,
    tx`
      create index if not exists leads_assigned_admin_idx
      on leads (assigned_admin_id)
    `,
    tx`
      create index if not exists leads_status_channel_updated_idx
      on leads (status, source_channel, updated_at desc)
    `,
    tx`
      create unique index if not exists admin_calendar_profiles_admin_unique
      on admin_calendar_profiles (admin_user_id)
    `,
    tx`
      create unique index if not exists booking_links_slug_unique
      on booking_links (slug)
    `,
    tx`
      create index if not exists booking_links_owner_idx
      on booking_links (owner_admin_id)
    `,
    tx`
      create index if not exists booking_links_active_idx
      on booking_links (is_active, deleted_at)
    `,
    tx`
      create unique index if not exists booking_links_single_ai_active_idx
      on booking_links (is_ai_active)
      where is_ai_active = true
    `,
    tx`
      create index if not exists admin_calendar_profiles_admin_idx
      on admin_calendar_profiles (admin_user_id)
    `,
    tx`
      create index if not exists availability_rules_admin_weekday_idx
      on availability_rules (admin_user_id, weekday)
    `,
    tx`
      create index if not exists availability_overrides_admin_time_idx
      on availability_overrides (admin_user_id, starts_at, ends_at)
    `,
    tx`
      create index if not exists appointments_assigned_admin_time_idx
      on appointments (assigned_admin_id, start_at)
    `,
    tx`
      create index if not exists appointments_lead_idx
      on appointments (lead_id)
    `,
    tx`
      create index if not exists appointments_conversation_idx
      on appointments (conversation_id)
    `,
    tx`
      create index if not exists appointments_booking_link_idx
      on appointments (booking_link_id)
    `,
    tx`
      create index if not exists appointments_status_idx
      on appointments (status)
    `,
    tx`
      create index if not exists appointments_source_start_idx
      on appointments (source, start_at desc)
      where deleted_at is null
    `,
    tx`
      create unique index if not exists appointments_active_slot_uidx
      on appointments (booking_link_id, start_at)
      where deleted_at is null
        and booking_link_id is not null
        and status in ('pending_confirmation', 'confirmed')
    `,
    tx`
      create index if not exists conversation_messages_conversation_time_idx
      on conversation_messages (conversation_id, created_at asc)
    `,
    tx`
      create index if not exists conversation_messages_channel_time_idx
      on conversation_messages (channel, created_at desc)
    `,
    tx`
      create index if not exists conversations_starred_idx
      on conversations (starred)
    `,
    tx`
      create index if not exists conversations_deleted_at_idx
      on conversations (deleted_at)
    `,
    tx`
      create index if not exists conversations_analysis_status_idx
      on conversations (analysis_status)
    `,
    tx`
      create index if not exists leads_updated_at_idx
      on leads (updated_at desc)
    `,
    tx`
      insert into settings (
        id,
        agent_enabled,
        greeting,
        voice,
        voice_provider,
        language_mode,
        knowledge_md,
        knowledge_version,
        max_call_seconds,
        daily_session_cap,
        model_id,
        transcription_model,
        analysis_enabled,
        analysis_model_id,
        booking_enabled,
        default_timezone,
        require_booking_confirmation,
        default_booking_window_days,
        text_chat_enabled,
        text_chat_model_id,
        text_chat_greeting,
        text_chat_max_messages,
        text_chat_daily_session_cap
      )
      values (
        1,
        true,
        'สวัสดี เราคือ DJ ผู้ช่วยด้านการเติบโตทางธุรกิจจาก DJAI Academy ตอนนี้คุณทำธุรกิจอะไร และอยากพัฒนาเรื่องใดมากที่สุด',
        'marin',
        'openai',
        'thai_first',
        ${initialKnowledgeMarkdown},
        1,
        600,
        100,
        'gpt-realtime-2.1',
        'gpt-realtime-whisper',
        true,
        'gpt-4o-mini',
        true,
        'Asia/Bangkok',
        true,
        30,
        true,
        'gpt-5-mini',
        'สวัสดี เราคือ DJ ผู้ช่วยด้านการเติบโตทางธุรกิจจาก DJAI Academy ตอนนี้คุณทำธุรกิจอะไร และอยากพัฒนาเรื่องใดมากที่สุด',
        40,
        200
      )
      on conflict (id) do nothing
    `,
    tx`
      update settings set
        language_mode = case
          when language_mode in ('auto_th_en', 'auto', '') or language_mode is null then 'thai_first'
          when language_mode = 'en' then 'english_only'
          else language_mode
        end,
        voice_provider = case when voice_provider is null or voice_provider not in ('openai', 'gemini') then 'openai' else voice_provider end,
        model_id = case when model_id = 'gpt-realtime' then 'gpt-realtime-2.1' else model_id end,
        transcription_model = case when transcription_model = 'gpt-4o-mini-transcribe' then 'gpt-realtime-whisper' else transcription_model end,
        analysis_enabled = coalesce(analysis_enabled, true),
        analysis_model_id = coalesce(nullif(analysis_model_id, ''), 'gpt-4o-mini'),
        booking_enabled = coalesce(booking_enabled, true),
        active_booking_admin_id = coalesce(
          active_booking_admin_id,
          (select id from admin_users where role = 'master_admin' and is_active = true and deleted_at is null order by created_at asc limit 1)
        ),
        active_booking_link_id = coalesce(
          active_booking_link_id,
          (
            select bl.id
            from booking_links bl
            where bl.owner_admin_id = coalesce(
                active_booking_admin_id,
                (select id from admin_users where role = 'master_admin' and is_active = true and deleted_at is null order by created_at asc limit 1)
              )
              and bl.is_active = true
              and bl.deleted_at is null
            order by bl.created_at asc
            limit 1
          ),
          (
            select bl.id
            from booking_links bl
            join admin_users au on au.id = bl.owner_admin_id
            where au.role = 'master_admin'
              and au.is_active = true
              and au.deleted_at is null
              and bl.is_active = true
              and bl.deleted_at is null
            order by bl.created_at asc
            limit 1
          )
        ),
        default_timezone = coalesce(nullif(default_timezone, ''), 'Asia/Bangkok'),
        require_booking_confirmation = coalesce(require_booking_confirmation, true),
        default_booking_window_days = coalesce(default_booking_window_days, 30),
        text_chat_enabled = coalesce(text_chat_enabled, true),
        text_chat_model_id = case
          when text_chat_model_id is null or text_chat_model_id = '' or text_chat_model_id = 'gpt-4o-mini'
            then 'gpt-5-mini'
          else text_chat_model_id
        end,
        text_chat_greeting = case
          when text_chat_greeting is null or text_chat_greeting = '' or text_chat_greeting = 'Hi, I am DJ from DJAI Academy. What kind of business are you running, and what are you trying to improve right now?'
            then 'สวัสดี เราคือ DJ ผู้ช่วยด้านการเติบโตทางธุรกิจจาก DJAI Academy ตอนนี้คุณทำธุรกิจอะไร และอยากพัฒนาเรื่องใดมากที่สุด'
          else text_chat_greeting
        end,
        text_chat_max_messages = coalesce(text_chat_max_messages, 40),
        text_chat_daily_session_cap = coalesce(text_chat_daily_session_cap, 200),
        greeting = case
          when greeting in (
            'Hi, this is DJAI Academy. Tell me what you want to build, and I will help you choose the right next step.',
            'Hi, I am DJ from DJAI Academy. What kind of business are you running, and what are you trying to improve right now?'
          ) then 'สวัสดี เราคือ DJ ผู้ช่วยด้านการเติบโตทางธุรกิจจาก DJAI Academy ตอนนี้คุณทำธุรกิจอะไร และอยากพัฒนาเรื่องใดมากที่สุด'
          else greeting
        end,
        knowledge_version = case
          when knowledge_version = 1 and knowledge_md like '# DJAI Academy Voice Agent Knowledge%'
            then 2
          else knowledge_version
        end,
        knowledge_md = replace(
          case
            when knowledge_md = ${legacyKnowledgeMarkdown}
              or (knowledge_version = 1 and knowledge_md like '# DJAI Academy Voice Agent Knowledge%')
              then ${initialKnowledgeMarkdown}
            else knowledge_md
          end,
          '- Landing page comparison states that buying 5 pages individually would be 15,000 THB, the bundle price is 10,000 THB, and the customer saves 5,000 THB.' || chr(10),
          ''
        ),
        updated_at = now()
      where id = 1
    `,
    tx`
      update meeting_types
      set
        name = 'ปรึกษาเบื้องต้นฟรี',
        description = 'พูดคุยเบื้องต้นสำหรับผู้สนใจบริการของ DJAI'
      where name = 'Free Consultation'
        and description = 'Initial consultation for qualified DJAI leads.'
    `,
    tx`
      update admin_calendar_profiles
      set meeting_title = 'ปรึกษากับ DJAI'
      where meeting_title = 'DJAI Consultation'
    `,
    tx`
      update booking_links
      set
        name = case when name = 'Free Consultation' then 'ปรึกษาเบื้องต้นฟรี' else name end,
        title = case when title in ('DJAI Consultation', 'DJAI Free Consultation') then 'ปรึกษากับ DJAI' else title end,
        description = case
          when description = 'Initial DJAI consultation for qualified leads.'
            then 'พูดคุยเบื้องต้นเกี่ยวกับธุรกิจและบริการที่เหมาะสมกับทีม DJAI'
          else description
        end
      where name = 'Free Consultation'
        or title in ('DJAI Consultation', 'DJAI Free Consultation')
        or description = 'Initial DJAI consultation for qualified leads.'
    `,
    tx`
      update booking_links
      set is_ai_active = false
      where is_ai_active = true
        and id <> (select active_booking_link_id from settings where id = 1)
    `,
    tx`
      update booking_links
      set is_ai_active = true
      where id = (select active_booking_link_id from settings where id = 1)
        and deleted_at is null
    `,
    tx`
      update leads set
        status = case
          when status = 'new' then 'pending_follow_up'
          when status = 'contacted' then 'follow_up_later'
          when status = 'closed' then 'deal_closed'
          when status in ('pending_follow_up', 'appointment_set', 'follow_up_later', 'deal_closed', 'no_deal') then status
          else 'pending_follow_up'
        end,
        client_name = coalesce(nullif(client_name, ''), nullif(name, '')),
        preferred_meeting_time = coalesce(nullif(preferred_meeting_time, ''), nullif(preferred_time, '')),
        phone = case when contact_type = 'phone' then coalesce(nullif(phone, ''), contact) else phone end,
        email = case when contact_type = 'email' then coalesce(nullif(email, ''), contact) else email end,
        line_id = case when contact_type = 'line' then coalesce(nullif(line_id, ''), contact) else line_id end,
        other_contact = case when contact_type = 'other' then coalesce(nullif(other_contact, ''), contact) else other_contact end,
        updated_at = coalesce(updated_at, created_at, now()),
        source_channel = coalesce(source_channel, 'voice_widget'),
        source_mode = coalesce(source_mode, 'voice')
    `,
    tx`
      update conversations set
        channel = coalesce(channel, 'voice_widget'),
        interaction_mode = coalesce(interaction_mode, 'voice'),
        message_count = coalesce(message_count, 0)
    `,
  ]);
}

migrate()
  .then(() => {
    console.log("Migrations applied and settings row seeded.");
  })
  .catch((error) => {
    console.error(`Migration failed: ${redactError(error)}`);
    process.exit(1);
  });
