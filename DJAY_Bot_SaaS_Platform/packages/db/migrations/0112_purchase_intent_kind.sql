ALTER TABLE billing.purchase_intents
  ADD COLUMN commerce_intent text NOT NULL DEFAULT 'subscribe'
    CHECK (commerce_intent IN ('subscribe', 'trial'));

ALTER TABLE billing.purchase_intents
  ADD CONSTRAINT purchase_intents_trial_plan_check CHECK (
    commerce_intent <> 'trial'
    OR plan_key IN ('flowbot_basic', 'ai_chat_basic')
  );
