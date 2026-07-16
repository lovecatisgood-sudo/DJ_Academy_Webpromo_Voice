ALTER TABLE platform.operational_attestations
  DROP CONSTRAINT operational_attestations_attestation_kind_check;

ALTER TABLE platform.operational_attestations
  ADD CONSTRAINT operational_attestations_attestation_kind_check CHECK (
    attestation_kind IN (
      'on_call', 'restore', 'support_runbook', 'security_review', 'privacy_review',
      'event_replay', 'queue_recovery', 'pool_exhaustion'
    )
  );
