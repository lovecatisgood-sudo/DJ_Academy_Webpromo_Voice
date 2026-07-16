# Advanced Voice routing and incident runbook

## Scope

This runbook governs internal `voice_gen2` route qualification and production
admission. It does not by itself authorize production traffic. Tenants see only
`Second-Generation Voice Engine`; provider, model, and region identifiers stay
inside Platform Master and the service-authenticated Voice gateway.

Advanced tenant deployments may be prepared while admission is disabled. The
tenant sees a neutral pending-activation notice; route promotion alone does not
enable calls. Do not treat a created deployment as runtime acceptance.

## Qualify and canary

Store the restricted JSON artifact outside the repository, then evaluate it
against the independently approved threshold record:

```bash
P8_VOICE_EVAL_ARTIFACT=/restricted/path/voice-evaluation.json \
  scripts/use-node24.sh pnpm run qa:p8-voice-eval
```

The artifact must use `voice-eval-artifact.v1` and contain both English and Thai
observations for every required scenario. Do not add provider/model/route fields,
raw audio, or transcript content; bind the candidate to the CLI's
`artifactEvidenceDigest`. A passing equivalent-profile artifact does not replace
the exact live-candidate and named-merchant runs.

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

## Production admission

Before requesting admission, run the repeatable local transport capacity drill:

```bash
scripts/use-node24.sh pnpm run qa:p8-voice-load
```

The default drill verifies a 40-session limit across 120 real local WebSocket
attempts, saturation rejection, slot recovery, injected media failure, and
shutdown drain. Override `P8_VOICE_LOAD_CAPACITY` and
`P8_VOICE_LOAD_ATTEMPTS` only for a recorded test profile. A passing local drill
does not replace equivalent-profile or live-provider capacity, latency, quality,
cost/margin, and named-merchant acceptance.

1. Configure the gateway's restricted Gen2 adapter with provider/model/region
   keys that exactly match the qualified active route. Keep the credential out
   of Platform Master and the database.
2. Complete live Thai/English, interruption, latency, cleanup, capacity,
   cost/margin, and named-merchant acceptance. Store the artifact in the
   restricted evidence system and calculate its SHA-256 digest.
3. Request **Enable production traffic** with the acceptance reference and
   digest. A different Platform Owner or AI Operations user must approve it.
4. Apply the approved change explicitly. Route promotion alone never enables
   tenant traffic.
5. Begin with the reviewed tenant cohort and reconcile immutable route
   assignments, reservations, leases, settlements, and provider-neutral errors.
6. To drain, request and approve admission disable. Existing sessions retain
   their exact Gen2 assignment; new grants are refused.

Admission turns off automatically when the profile enters canary, degraded, or
paused mode. Returning the profile to running does not turn admission back on;
a new independently reviewed admission change is required.

## Incident response

1. Open an incident with severity and a factual reason. Minor moves Gen2 to
   degraded; major/critical moves it to paused.
2. For active impact, roll back the current routing change. If there is no
   previous qualified Gen2 route, the resulting state remains paused and callers
   receive provider-neutral unavailability.
3. If credit review is required, a different Platform Owner or Platform Finance
   reviewer approves/rejects only the recommendation. P9 owns actual financial
   policy and application.
4. Select **Resolve**, then record 12–2,000 characters describing verified
   recovery and remaining safeguards. Leading/trailing whitespace is removed.
   Correct inline validation without leaving the incident; if transport fails,
   keep and retry the visible draft after confirming authority and service
   health. Cancel sends nothing. Do not use a browser prompt or direct SQL.
   Resolution does not resume or promote a route.
5. Requalification and a new reviewed change are required before future traffic.

## Evidence and audit checks

- Confirm candidate and change evidence fields contain SHA-256 digests only.
- Confirm proposer/reviewer and requester/approver IDs differ.
- Confirm `voice_profile_controls` remains paused unless a reviewed canary or
  active Gen2 route is intentionally current.
- Confirm `admission_enabled` is false until a separately reviewed acceptance
  change is applied and returns to false on every non-running profile state.
- Confirm every connected Gen2 session has exactly one
  `operations.voice_session_routes` row and that the browser/tenant surfaces
  contain no provider/model/region identity.
- Confirm successful actions exist in `platform.audit_logs` under `voice.*`.
- Do not paste credentials, raw audio, transcripts, prompts, customer content,
  provider invoices, or unrestricted evaluation artifacts into reasons.

## Emergency rule

If routing state is uncertain, pause Gen2 and return neutral unavailability.
Never redirect Advanced traffic to First-Generation.
