# Advanced Voice routing and incident runbook

## Scope

This runbook governs internal `voice_gen2` route qualification. It does not
authorize production traffic. Tenants see only `Second-Generation Voice Engine`;
provider, model, and region identifiers stay inside Platform Master.

Advanced tenant deployments may be prepared while admission is disabled. The
tenant sees a neutral pending-activation notice; route promotion alone does not
enable calls. Do not treat a created deployment as runtime acceptance.

## Qualify and canary

1. Platform Owner or AI Operations proposes a Gen2 provider/model/region
   candidate.
2. A different Platform Owner or AI Operations reviewer verifies the restricted
   evaluation artifact and records its lowercase SHA-256 digest.
3. An operator requests a 1–100% canary with a reason and evaluation digest.
4. A different operator approves or rejects the request.
5. Start the approved canary. Promotion is unavailable until this transition is
   current; a newer canary makes the older change stale.
6. Review live quality, latency, error, capacity, and cost/margin evidence under
   the approved acceptance thresholds before promotion.
7. Promote explicitly. Never configure Gen1 as an Advanced fallback.

## Incident response

1. Open an incident with severity and a factual reason. Minor moves Gen2 to
   degraded; major/critical moves it to paused.
2. For active impact, roll back the current routing change. If there is no
   previous qualified Gen2 route, the resulting state remains paused and callers
   receive provider-neutral unavailability.
3. If credit review is required, a different Platform Owner or Platform Finance
   reviewer approves/rejects only the recommendation. P9 owns actual financial
   policy and application.
4. Record the resolution. Resolution does not resume or promote a route.
5. Requalification and a new reviewed change are required before future traffic.

## Evidence and audit checks

- Confirm candidate and change evidence fields contain SHA-256 digests only.
- Confirm proposer/reviewer and requester/approver IDs differ.
- Confirm `voice_profile_controls` remains paused unless a reviewed canary or
  active Gen2 route is intentionally current.
- Confirm successful actions exist in `platform.audit_logs` under `voice.*`.
- Do not paste credentials, raw audio, transcripts, prompts, customer content,
  provider invoices, or unrestricted evaluation artifacts into reasons.

## Emergency rule

If routing state is uncertain, pause Gen2 and return neutral unavailability.
Never redirect Advanced traffic to First-Generation.
