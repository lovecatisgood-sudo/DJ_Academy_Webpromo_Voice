import { hash } from "@node-rs/argon2";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
const tenantId = process.env.TENANT_ID;
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

if (!databaseUrl) throw new Error("DATABASE_URL_DIRECT or DATABASE_URL is required.");
if (!tenantId) throw new Error("TENANT_ID is required.");
if (!ownerEmail) throw new Error("OWNER_EMAIL is required.");
if (!ownerPassword) throw new Error("OWNER_PASSWORD is required.");

const sql = neon(databaseUrl);

const passwordHash = await hash(ownerPassword, {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
});

const botId = randomUUID();
const draftVersionId = randomUUID();
const publishedVersionId = randomUUID();
const draftRootNodeId = randomUUID();
const publishedRootNodeId = randomUUID();
const publishedServiceNodeId = randomUUID();
const publishedLeadNodeId = randomUUID();
const publishedLiveChatNodeId = randomUUID();
const botPublicKey = "flowbot_test_web";

const snapshot = {
  flowVersionId: publishedVersionId,
  rootNodeId: publishedRootNodeId,
  nodes: {
    [publishedRootNodeId]: {
      id: publishedRootNodeId,
      type: "options",
      title: "Main menu",
      contentTh: "สวัสดีครับ ยินดีต้อนรับ FlowBot ต้องการให้ช่วยเรื่องไหนครับ?",
      contentEn: "Hi, welcome to FlowBot. What would you like help with?",
      options: [
        {
          id: randomUUID(),
          labelTh: "ดูบริการ",
          labelEn: "View services",
          targetNodeId: publishedServiceNodeId
        },
        {
          id: randomUUID(),
          labelTh: "ฝากข้อมูลให้ติดต่อกลับ",
          labelEn: "Leave contact details",
          targetNodeId: publishedLeadNodeId
        },
        {
          id: randomUUID(),
          labelTh: "คุยกับแอดมิน",
          labelEn: "Talk to admin",
          targetNodeId: publishedLiveChatNodeId
        }
      ],
      config: {}
    },
    [publishedServiceNodeId]: {
      id: publishedServiceNodeId,
      type: "message",
      title: "Services",
      contentTh: "FlowBot ช่วยตอบคำถามพื้นฐาน คัดกรองลูกค้า เก็บลีด และส่งต่อให้ทีมขายเมื่อจำเป็นครับ",
      contentEn: "FlowBot answers common questions, qualifies visitors, captures leads, and hands off to your sales team when needed.",
      options: [],
      config: {}
    },
    [publishedLeadNodeId]: {
      id: publishedLeadNodeId,
      type: "cta_lead_form",
      title: "Lead form",
      contentTh: "ฝากชื่อ เบอร์โทร และอีเมลไว้ได้เลยครับ ทีมงานจะติดต่อกลับพร้อมบริบทจากบทสนทนานี้",
      contentEn: "Leave your name, phone, and email. Our team will follow up with the context from this conversation.",
      options: [],
      config: {
        fields: [
          { name: "name", label: "Name / ชื่อ", required: true },
          { name: "phone", label: "Phone / เบอร์โทร", required: true },
          { name: "email", label: "Email", required: false }
        ]
      }
    },
    [publishedLiveChatNodeId]: {
      id: publishedLiveChatNodeId,
      type: "cta_live_chat",
      title: "Live chat",
      contentTh: "ได้ครับ พิมพ์คำถามไว้ได้เลย ถ้าบอทตอบไม่ได้ ระบบจะส่งต่อให้แอดมินครับ",
      contentEn: "Sure. Type your question here. If the bot cannot answer it, it will hand the conversation to an admin.",
      options: [],
      config: {}
    }
  }
};

await sql`
    INSERT INTO flowbot_tenants (id, name, settings)
    VALUES (${tenantId}, 'DJAI FlowBot Test', '{}')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = now()
  `;

await sql`
    INSERT INTO flowbot_users (tenant_id, email, password_hash, name, role)
    VALUES (${tenantId}, ${ownerEmail.toLowerCase()}, ${passwordHash}, 'FlowBot Owner', 'owner')
    ON CONFLICT (tenant_id, email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      updated_at = now(),
      deleted_at = NULL
  `;

const existingBots = await sql`
    SELECT id FROM flowbot_bots
    WHERE tenant_id = ${tenantId} AND public_key = ${botPublicKey}
    LIMIT 1
  `;
const existingBotId = existingBots[0]?.id;
const activeBotId = existingBotId ?? botId;

if (!existingBotId) {
  await sql`
      INSERT INTO flowbot_bots (id, tenant_id, public_key, name, default_lang, widget_settings, allowed_origins)
      VALUES (
        ${activeBotId},
        ${tenantId},
        ${botPublicKey},
        'DJAI Website FlowBot',
        'th',
        '{"themeColor":"#0E7C6B","position":"br"}',
        ARRAY['http://localhost:3000']
      )
    `;
}

const existingDraft = await sql`
    SELECT id, version_no FROM flowbot_flow_versions
    WHERE tenant_id = ${tenantId} AND bot_id = ${activeBotId} AND status = 'draft'
    LIMIT 1
  `;

if (existingDraft[0] && existingDraft[0].version_no !== 999999) {
  await sql`
      UPDATE flowbot_flow_versions
      SET version_no = 999999
      WHERE tenant_id = ${tenantId}
        AND bot_id = ${activeBotId}
        AND id = ${existingDraft[0].id}
    `;
}

if (!existingDraft[0]) {
  await sql`
      INSERT INTO flowbot_flow_versions (id, tenant_id, bot_id, status, version_no)
      VALUES (${draftVersionId}, ${tenantId}, ${activeBotId}, 'draft', 999999)
    `;
  await sql`
      INSERT INTO flowbot_nodes (id, tenant_id, flow_version_id, type, title, content_th, content_en, config)
      VALUES (
        ${draftRootNodeId},
        ${tenantId},
        ${draftVersionId},
        'options',
        'Main menu',
        'สวัสดีครับ ยินดีต้อนรับครับ ต้องการให้ช่วยเรื่องไหน?',
        'Hi, welcome. What would you like help with?',
        '{}'
      )
    `;
}

const existingPublished = await sql`
    SELECT id FROM flowbot_flow_versions
    WHERE tenant_id = ${tenantId} AND bot_id = ${activeBotId} AND status = 'published' AND version_no = 4
    LIMIT 1
  `;

if (!existingPublished[0]) {
  await sql`
      INSERT INTO flowbot_flow_versions (id, tenant_id, bot_id, status, version_no, snapshot, published_at)
      VALUES (${publishedVersionId}, ${tenantId}, ${activeBotId}, 'published', 4, ${JSON.stringify(snapshot)}, now())
    `;
  await sql`
      INSERT INTO flowbot_nodes (id, tenant_id, flow_version_id, type, title, content_th, content_en, config)
      VALUES (
        ${publishedRootNodeId},
        ${tenantId},
        ${publishedVersionId},
        'options',
        'Main menu',
        'สวัสดีครับ ยินดีต้อนรับครับ ต้องการให้ช่วยเรื่องไหน?',
        'Hi, welcome. What would you like help with?',
        '{}'
      )
      ON CONFLICT DO NOTHING
    `;
  await sql`
      INSERT INTO flowbot_nodes (id, tenant_id, flow_version_id, type, parent_id, title, content_th, content_en, config)
      VALUES (
        ${publishedServiceNodeId},
        ${tenantId},
        ${publishedVersionId},
        'message',
        ${publishedRootNodeId},
        'Services',
        'FlowBot ช่วยตอบคำถามพื้นฐาน คัดกรองลูกค้า เก็บลีด และส่งต่อให้ทีมขายเมื่อจำเป็นครับ',
        'FlowBot answers common questions, qualifies visitors, captures leads, and hands off to your sales team when needed.',
        '{}'
      )
      ON CONFLICT DO NOTHING
    `;
  await sql`
      INSERT INTO flowbot_nodes (id, tenant_id, flow_version_id, type, parent_id, title, content_th, content_en, config)
      VALUES (
        ${publishedLeadNodeId},
        ${tenantId},
        ${publishedVersionId},
        'cta_lead_form',
        ${publishedRootNodeId},
        'Lead form',
        'ฝากชื่อ เบอร์โทร และอีเมลไว้ได้เลยครับ ทีมงานจะติดต่อกลับพร้อมบริบทจากบทสนทนานี้',
        'Leave your name, phone, and email. Our team will follow up with the context from this conversation.',
        ${JSON.stringify(snapshot.nodes[publishedLeadNodeId].config)}
      )
      ON CONFLICT DO NOTHING
    `;
  await sql`
      INSERT INTO flowbot_nodes (id, tenant_id, flow_version_id, type, parent_id, title, content_th, content_en, config)
      VALUES (
        ${publishedLiveChatNodeId},
        ${tenantId},
        ${publishedVersionId},
        'cta_live_chat',
        ${publishedRootNodeId},
        'Live chat',
        'ได้ครับ พิมพ์คำถามไว้ได้เลย ถ้าบอทตอบไม่ได้ ระบบจะส่งต่อให้แอดมินครับ',
        'Sure. Type your question here. If the bot cannot answer it, it will hand the conversation to an admin.',
        '{}'
      )
      ON CONFLICT DO NOTHING
    `;
  for (const [index, option] of snapshot.nodes[publishedRootNodeId].options.entries()) {
    await sql`
      INSERT INTO flowbot_node_options (
        id, tenant_id, flow_version_id, node_id, target_node_id, sort_order, label_th, label_en
      )
      VALUES (
        ${option.id},
        ${tenantId},
        ${publishedVersionId},
        ${publishedRootNodeId},
        ${option.targetNodeId},
        ${index + 1},
        ${option.labelTh},
        ${option.labelEn}
      )
      ON CONFLICT DO NOTHING
    `;
  }
  await sql`
      UPDATE flowbot_bots
      SET published_version_id = ${publishedVersionId}, updated_at = now()
      WHERE tenant_id = ${tenantId} AND id = ${activeBotId}
    `;
} else {
  await sql`
      UPDATE flowbot_bots
      SET published_version_id = ${existingPublished[0].id}, updated_at = now()
      WHERE tenant_id = ${tenantId} AND id = ${activeBotId}
    `;
}

await sql`
    INSERT INTO flowbot_contact_channels (tenant_id, bot_id, type, label, value, sort_order)
    VALUES (${tenantId}, ${activeBotId}, 'email', 'Email', 'hello@djai.academy', 1)
    ON CONFLICT (tenant_id, bot_id, sort_order) DO UPDATE SET
      type = EXCLUDED.type,
      label = EXCLUDED.label,
      value = EXCLUDED.value,
      updated_at = now()
  `;

console.log("Seeded FlowBot tenant, owner, bot, and demo flow.");
