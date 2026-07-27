-- Thai is the platform default language; English is secondary and only by explicit selection.
--
-- Every account-bearing table defaulted to 'en' while the timezone on the same rows defaulted to
-- 'Asia/Bangkok' — an English-first product aimed squarely at Thai SMEs. The bot-facing tables
-- already got this right (`flowbot_bots.default_language` in 0009 and `ai_chat_agents` in 0017
-- both default to 'th'), so this migration brings the account, contact and notification tables
-- into line with them.
--
-- Defaults only. Existing rows are deliberately NOT rewritten: a stored 'en' cannot be
-- distinguished from an explicit merchant choice, and silently switching a merchant's interface
-- language is worse than leaving it. No merchant accounts exist yet in any case — no plan is
-- sellable — so the practical effect is that every account created from here on starts in Thai.

ALTER TABLE identity.users ALTER COLUMN locale SET DEFAULT 'th';
ALTER TABLE identity.signup_intents ALTER COLUMN locale SET DEFAULT 'th';
ALTER TABLE tenancy.tenants ALTER COLUMN locale SET DEFAULT 'th';
ALTER TABLE tenancy.contacts ALTER COLUMN locale SET DEFAULT 'th';
ALTER TABLE tenancy.billing_notification_preferences ALTER COLUMN locale SET DEFAULT 'th';
