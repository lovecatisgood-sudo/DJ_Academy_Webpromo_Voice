-- CHN-004 / CHN-005: one included social channel per subscription, extras paid.
--
-- Migration 0082 shipped the predicate "channel.social = true OR an active
-- additional_social_channel add-on", which grants UNLIMITED social channels once
-- channel.social is set. The commercial model is one INCLUDED channel plus paid extras,
-- with a cooldown on changing which channel occupies the included slot. Shipped code is
-- therefore more permissive than the offer -- a live revenue leak.
--
-- DELIBERATELY ADDITIVE. Nothing here drops or recreates an existing function, so the
-- blast radius is limited to new objects. In particular the eight runtime SECURITY
-- DEFINER functions that gate social traffic are NOT touched: they all already require
-- `connection.status = 'active'`, and the trigger below makes it impossible for a
-- connection on a non-admitted channel to be inserted or to reach 'active' in the first
-- place. Enforcing the invariant at write time in the database is both a stronger
-- guarantee than mirroring a predicate into eight read paths (no code path, present or
-- future, can bypass it) and a far smaller change.
--
-- Grandfathering: the trigger fires only on INSERT and on transitions INTO 'active'.
-- Connections that already exist keep working untouched, and the backfill at the end
-- records each subscription's earliest-connected channel as its included one.

-- ---------------------------------------------------------------------------
-- 1. Which channel the included slot is spent on, per subscription.
-- ---------------------------------------------------------------------------

CREATE TABLE tenancy.subscription_social_channels (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  product_key text NOT NULL CHECK (product_key IN ('flowbot', 'ai_chat')),
  channel text NOT NULL CHECK (channel IN ('line', 'messenger', 'whatsapp', 'instagram')),
  chosen_at timestamptz NOT NULL DEFAULT now(),
  chosen_by_membership_id uuid,
  -- CHN-005 cooldown: before this instant the included slot cannot be moved to a
  -- different channel without an add-on or an operator approval.
  change_allowed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, subscription_id, product_key),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, chosen_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (change_allowed_at >= chosen_at)
);

ALTER TABLE tenancy.subscription_social_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.subscription_social_channels FORCE ROW LEVEL SECURITY;

CREATE POLICY tenancy_subscription_social_channels_tenant ON tenancy.subscription_social_channels
  TO djay_runtime
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON tenancy.subscription_social_channels TO djay_runtime;

-- ---------------------------------------------------------------------------
-- 2. Single-use operator approval to move the included slot early.
-- ---------------------------------------------------------------------------

CREATE TABLE tenancy.social_channel_change_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  product_key text NOT NULL CHECK (product_key IN ('flowbot', 'ai_chat')),
  channel text NOT NULL CHECK (channel IN ('line', 'messenger', 'whatsapp', 'instagram')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 500),
  approved_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX tenancy_one_open_social_channel_approval
  ON tenancy.social_channel_change_approvals(tenant_id, subscription_id, product_key, channel)
  WHERE consumed_at IS NULL;

ALTER TABLE tenancy.social_channel_change_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.social_channel_change_approvals FORCE ROW LEVEL SECURITY;

-- Tenants may read their own approvals (so the studio can explain why a change is
-- allowed) but never create or alter one: issuing is an operator action.
CREATE POLICY tenancy_social_channel_change_approvals_read ON tenancy.social_channel_change_approvals
  FOR SELECT TO djay_runtime
  USING (tenant_id = tenancy.current_tenant_id());

GRANT SELECT ON tenancy.social_channel_change_approvals TO djay_runtime;

-- ---------------------------------------------------------------------------
-- 3. The admission decision. A new function, so nothing is recreated.
-- ---------------------------------------------------------------------------

-- Returns the reason a channel is admitted, or the reason it is refused. Text rather
-- than boolean so the merchant can be told exactly what to change, and so the operator
-- dashboard can distinguish "needs an add-on" from "in cooldown".
--
--   included          - no slot chosen yet, or this channel already holds it
--   add_on            - an active additional_social_channel add-on covers it
--   cooldown_elapsed  - the slot may move because the cooldown has passed
--   operator_approved - an unconsumed, unexpired operator approval covers it
--   not_entitled      - the subscription has no social entitlement at all
--   cooldown_active   - a different channel holds the slot and the cooldown is running
CREATE FUNCTION tenancy.social_channel_admission(
  target_tenant_id uuid, target_product_key text, target_channel text
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
DECLARE
  target_subscription_id uuid;
  entitled boolean;
  slot record;
  add_on_allowance integer;
  connected_channels integer;
BEGIN
  IF target_product_key NOT IN ('flowbot', 'ai_chat')
     OR target_channel NOT IN ('line', 'messenger', 'whatsapp', 'instagram') THEN
    RETURN 'not_entitled';
  END IF;

  -- Mirrors migration 0082's admission predicate exactly: `channel.social`, a
  -- channel-specific entitlement, OR an active additional_social_channel add-on. A Basic
  -- plan holding the add-on is entitled to social, and refusing it here would regress
  -- the gate relaxation that 0082 shipped.
  SELECT snapshot.subscription_id,
         (snapshot.resolved_json->'entitlements'->>'channel.social' = 'true'
          OR snapshot.resolved_json->'entitlements'->>('channel.' || target_channel) = 'true'
          OR EXISTS (
            SELECT 1 FROM tenancy.subscription_add_ons social_add_on
            WHERE social_add_on.tenant_id = snapshot.tenant_id
              AND social_add_on.subscription_id = snapshot.subscription_id
              AND social_add_on.add_on_key = 'additional_social_channel'
              AND social_add_on.status IN ('active', 'scheduled_end')
              AND social_add_on.effective_from <= now()
              AND (social_add_on.effective_until IS NULL OR social_add_on.effective_until > now())
          ))
  INTO target_subscription_id, entitled
  FROM tenancy.entitlement_snapshots snapshot
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
   AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  WHERE snapshot.tenant_id = target_tenant_id
    AND snapshot.product_key = target_product_key
    AND snapshot.access_mode = 'active'
  ORDER BY snapshot.created_at DESC, snapshot.id DESC
  LIMIT 1;

  IF target_subscription_id IS NULL OR NOT COALESCE(entitled, false) THEN
    RETURN 'not_entitled';
  END IF;

  SELECT * INTO slot FROM tenancy.subscription_social_channels
  WHERE tenant_id = target_tenant_id AND subscription_id = target_subscription_id
    AND product_key = target_product_key;

  -- The included slot is unspent, or this channel already holds it.
  IF slot IS NULL OR slot.channel = target_channel THEN
    RETURN 'included';
  END IF;

  -- Paid extras: one additional channel per add-on quantity, counted against the
  -- channels already connected beyond the included one.
  SELECT COALESCE(sum(add_on.quantity), 0)::int INTO add_on_allowance
  FROM tenancy.subscription_add_ons add_on
  WHERE add_on.tenant_id = target_tenant_id
    AND add_on.subscription_id = target_subscription_id
    AND add_on.add_on_key = 'additional_social_channel'
    AND add_on.status IN ('active', 'scheduled_end')
    AND add_on.effective_from <= now()
    AND (add_on.effective_until IS NULL OR add_on.effective_until > now());

  IF target_product_key = 'flowbot' THEN
    SELECT count(DISTINCT channel)::int INTO connected_channels
    FROM tenancy.flow_social_connections
    WHERE tenant_id = target_tenant_id AND status <> 'revoked' AND channel <> slot.channel;
  ELSE
    SELECT count(DISTINCT channel)::int INTO connected_channels
    FROM tenancy.ai_social_connections
    WHERE tenant_id = target_tenant_id AND status <> 'revoked' AND channel <> slot.channel;
  END IF;

  -- The channel being admitted counts against the allowance unless it is already one of
  -- the extras in use.
  IF add_on_allowance > 0 AND connected_channels < add_on_allowance THEN
    RETURN 'add_on';
  END IF;
  IF add_on_allowance > 0 AND EXISTS (
    SELECT 1 FROM tenancy.subscription_social_channels existing
    WHERE existing.tenant_id = target_tenant_id AND existing.subscription_id = target_subscription_id
      AND existing.product_key = target_product_key AND existing.channel = target_channel
  ) THEN
    RETURN 'add_on';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tenancy.social_channel_change_approvals approval
    WHERE approval.tenant_id = target_tenant_id
      AND approval.subscription_id = target_subscription_id
      AND approval.product_key = target_product_key
      AND approval.channel = target_channel
      AND approval.consumed_at IS NULL
      AND approval.expires_at > now()
  ) THEN
    RETURN 'operator_approved';
  END IF;

  IF slot.change_allowed_at <= now() THEN
    RETURN 'cooldown_elapsed';
  END IF;

  RETURN 'cooldown_active';
END
$$;

REVOKE ALL ON FUNCTION tenancy.social_channel_admission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.social_channel_admission(uuid, text, text) TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.social_channel_admission(uuid, text, text) TO djay_worker;

-- ---------------------------------------------------------------------------
-- 4. Write-time enforcement. The invariant no code path can bypass.
-- ---------------------------------------------------------------------------

CREATE FUNCTION tenancy.enforce_social_channel_admission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
DECLARE
  decision text;
  resolved_product text;
BEGIN
  -- Only guard rows arriving at, or created in, an active state. Revocation, health
  -- updates, and credential rotation on an existing connection are unaffected, so no
  -- currently-connected merchant is broken by this migration.
  IF TG_OP = 'UPDATE' AND (NEW.status = OLD.status OR NEW.status <> 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  resolved_product := CASE TG_TABLE_NAME
    WHEN 'flow_social_connections' THEN 'flowbot'
    WHEN 'ai_social_connections' THEN 'ai_chat'
  END;
  IF resolved_product IS NULL THEN RETURN NEW; END IF;

  decision := tenancy.social_channel_admission(NEW.tenant_id, resolved_product, NEW.channel);
  IF decision NOT IN ('included', 'add_on', 'cooldown_elapsed', 'operator_approved') THEN
    RAISE EXCEPTION 'social_channel_not_admitted:%', decision
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION tenancy.enforce_social_channel_admission() FROM PUBLIC;

CREATE TRIGGER flow_social_connections_channel_admission
  BEFORE INSERT OR UPDATE OF status, channel ON tenancy.flow_social_connections
  FOR EACH ROW EXECUTE FUNCTION tenancy.enforce_social_channel_admission();

CREATE TRIGGER ai_social_connections_channel_admission
  BEFORE INSERT OR UPDATE OF status, channel ON tenancy.ai_social_connections
  FOR EACH ROW EXECUTE FUNCTION tenancy.enforce_social_channel_admission();

-- ---------------------------------------------------------------------------
-- 5. Claim the included slot. Called after a connection is created.
-- ---------------------------------------------------------------------------

-- Idempotent: records the slot if unspent, and consumes an operator approval when one
-- authorised the move. Cooldown restarts from the moment the slot moves.
CREATE FUNCTION tenancy.claim_included_social_channel(
  target_tenant_id uuid, target_product_key text, target_channel text,
  target_membership_id uuid, cooldown interval DEFAULT interval '30 days'
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
DECLARE
  target_subscription_id uuid;
  existing record;
BEGIN
  SELECT snapshot.subscription_id INTO target_subscription_id
  FROM tenancy.entitlement_snapshots snapshot
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
   AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  WHERE snapshot.tenant_id = target_tenant_id
    AND snapshot.product_key = target_product_key
    AND snapshot.access_mode = 'active'
  ORDER BY snapshot.created_at DESC, snapshot.id DESC
  LIMIT 1;
  IF target_subscription_id IS NULL THEN RETURN 'no_subscription'; END IF;

  SELECT * INTO existing FROM tenancy.subscription_social_channels
  WHERE tenant_id = target_tenant_id AND subscription_id = target_subscription_id
    AND product_key = target_product_key FOR UPDATE;

  IF existing IS NULL THEN
    INSERT INTO tenancy.subscription_social_channels (
      tenant_id, subscription_id, product_key, channel, chosen_by_membership_id, change_allowed_at
    ) VALUES (
      target_tenant_id, target_subscription_id, target_product_key, target_channel,
      target_membership_id, now() + cooldown
    );
    RETURN 'claimed';
  END IF;

  IF existing.channel = target_channel THEN RETURN 'unchanged'; END IF;

  UPDATE tenancy.social_channel_change_approvals
  SET consumed_at = now()
  WHERE tenant_id = target_tenant_id AND subscription_id = target_subscription_id
    AND product_key = target_product_key AND channel = target_channel
    AND consumed_at IS NULL AND expires_at > now();

  UPDATE tenancy.subscription_social_channels
  SET channel = target_channel, chosen_at = now(), chosen_by_membership_id = target_membership_id,
      change_allowed_at = now() + cooldown, updated_at = now()
  WHERE tenant_id = target_tenant_id AND subscription_id = target_subscription_id
    AND product_key = target_product_key;
  RETURN 'moved';
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_included_social_channel(uuid, text, text, uuid, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_included_social_channel(uuid, text, text, uuid, interval) TO djay_runtime;

-- ---------------------------------------------------------------------------
-- 6. Backfill: grandfather every subscription that already has connections.
-- ---------------------------------------------------------------------------

-- The earliest-connected channel takes the included slot, with the cooldown already
-- elapsed so no existing merchant is trapped by a rule introduced after they connected.
INSERT INTO tenancy.subscription_social_channels (
  tenant_id, subscription_id, product_key, channel, chosen_at, change_allowed_at
)
SELECT earliest.tenant_id, earliest.subscription_id, earliest.product_key,
       earliest.channel, earliest.created_at, earliest.created_at
-- Each DISTINCT ON branch is parenthesised: its ORDER BY is required by DISTINCT ON, and
-- an unparenthesised ORDER BY before UNION ALL binds to the whole union instead of the
-- branch, which is a syntax error.
FROM (
  (
    SELECT DISTINCT ON (connection.tenant_id, subscription.id)
           connection.tenant_id, subscription.id AS subscription_id,
           'flowbot'::text AS product_key, connection.channel, connection.created_at
    FROM tenancy.flow_social_connections connection
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = connection.tenant_id AND subscription.product_key = 'flowbot'
     AND subscription.status <> 'cancelled'
    WHERE connection.status <> 'revoked'
    ORDER BY connection.tenant_id, subscription.id, connection.created_at, connection.id
  )
  UNION ALL
  (
    SELECT DISTINCT ON (connection.tenant_id, subscription.id)
           connection.tenant_id, subscription.id AS subscription_id,
           'ai_chat'::text AS product_key, connection.channel, connection.created_at
    FROM tenancy.ai_social_connections connection
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = connection.tenant_id AND subscription.product_key = 'ai_chat'
     AND subscription.status <> 'cancelled'
    WHERE connection.status <> 'revoked'
    ORDER BY connection.tenant_id, subscription.id, connection.created_at, connection.id
  )
) AS earliest
ON CONFLICT (tenant_id, subscription_id, product_key) DO NOTHING;
