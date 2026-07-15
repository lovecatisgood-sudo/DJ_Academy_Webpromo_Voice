import { relations } from "drizzle-orm";
import { boolean, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  }
});

export const tenants = pgTable("flowbot_tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable(
  "flowbot_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("admin"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => ({
    tenantEmail: uniqueIndex("flowbot_users_tenant_email_idx").on(table.tenantId, table.email)
  })
);

export const userSessions = pgTable(
  "flowbot_user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tokenHash: uniqueIndex("flowbot_user_sessions_token_hash_idx").on(table.tokenHash),
    activeLookup: index("flowbot_user_sessions_lookup").on(table.tenantId, table.userId, table.expiresAt)
  })
);

export const bots = pgTable(
  "flowbot_bots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    name: text("name").notNull(),
    defaultLang: text("default_lang").notNull().default("th"),
    widgetSettings: jsonb("widget_settings").notNull().default({}),
    allowedOrigins: text("allowed_origins").array().notNull().default([]),
    publishedVersionId: uuid("published_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    publicKey: uniqueIndex("flowbot_bots_public_key_idx").on(table.publicKey)
  })
);

export const flowVersions = pgTable(
  "flowbot_flow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    botId: uuid("bot_id").notNull().references(() => bots.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    versionNo: integer("version_no").notNull(),
    snapshot: jsonb("snapshot"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    botVersion: uniqueIndex("flowbot_flow_versions_tenant_bot_version_idx").on(table.tenantId, table.botId, table.versionNo)
  })
);

export const customers = pgTable(
  "flowbot_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    lineId: text("line_id"),
    whatsapp: text("whatsapp"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => ({
    phoneMatch: index("flowbot_customers_phone_match_idx").on(table.tenantId, table.phoneNormalized),
    emailMatch: index("flowbot_customers_email_match_idx").on(table.tenantId, table.email)
  })
);

export const conversations = pgTable(
  "flowbot_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    botId: uuid("bot_id").notNull().references(() => bots.id, { onDelete: "restrict" }),
    flowVersionId: uuid("flow_version_id").notNull().references(() => flowVersions.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    channel: text("channel").notNull().default("web"),
    sessionTokenHash: bytea("session_token_hash").notNull(),
    sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("bot"),
    crmStatus: text("crm_status").notNull().default("new"),
    currentNodeId: uuid("current_node_id"),
    lang: text("lang").notNull().default("th"),
    starred: boolean("starred").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    unreadAdmin: integer("unread_admin").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => ({
    tenantActivity: index("flowbot_conversations_tenant_activity_idx").on(table.tenantId, table.lastActivityAt),
    sessionTokenHash: uniqueIndex("flowbot_conversations_session_token_hash_idx").on(table.sessionTokenHash)
  })
);

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  bots: many(bots),
  customers: many(customers),
  conversations: many(conversations)
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  sessions: many(userSessions)
}));

export const botsRelations = relations(bots, ({ one, many }) => ({
  tenant: one(tenants, { fields: [bots.tenantId], references: [tenants.id] }),
  versions: many(flowVersions),
  conversations: many(conversations)
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  tenant: one(tenants, { fields: [conversations.tenantId], references: [tenants.id] }),
  bot: one(bots, { fields: [conversations.botId], references: [bots.id] }),
  flowVersion: one(flowVersions, { fields: [conversations.flowVersionId], references: [flowVersions.id] }),
  customer: one(customers, { fields: [conversations.customerId], references: [customers.id] })
}));
