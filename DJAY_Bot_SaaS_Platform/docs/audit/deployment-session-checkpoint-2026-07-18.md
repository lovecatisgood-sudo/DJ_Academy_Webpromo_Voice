# Deployment session checkpoint - 2026-07-18

This checkpoint records the paused GCP deployment state before switching to
another task. It contains identifiers and decisions only; no credential or
secret value is recorded here.

## Guardrails and repository state

- Work only in `DJAY_Bot_SaaS_Platform`; the legacy `FlowBot_V1_App` remains a
  protected reference.
- The worktree contains broad, intentional, uncommitted production-integration
  and deployment work. Do not reset, revert, or overwrite it when resuming.
- The current Git HEAD is `1a3941843476fdfce7ee7b0fa28c72602bc2a986`.
  It does not identify the uncommitted release contents and must not be used as
  an image tag for those contents.
- The platform requires Terraform `1.14.6`. The temporary binary currently
  found at `/tmp/terraform-1.14.3/terraform` is too old for the pinned module.

## Admitted GCP authority

- Operator account: `cafe@siamesecat.cafe`
- Project ID: `master-deck-476811-a8`
- Project number: `849425780267`
- Region: Bangkok `asia-southeast3`
- Recovery region: Singapore `asia-southeast1`
- Isolated gcloud configuration: `djay-master-deck` (intentionally not the
  default active configuration)
- Billing is enabled.

Always run the project guard before a mutation:

```bash
PATH=/tmp/google-cloud-sdk/bin:$PATH \
  CLOUDSDK_ACTIVE_CONFIG_NAME=djay-master-deck \
  scripts/gcp-project-guard.sh master-deck-476811-a8
```

For every direct gcloud command, also pass both of these flags explicitly:

```text
--project=master-deck-476811-a8 --configuration=djay-master-deck
```

A read-only inspection in this session omitted the explicit configuration flag
after a shell `&&` and fell back to `eri.rehcm@gmail.com`. IAM denied that read;
no mutation occurred. The corrected reads used `djay-master-deck` explicitly.

## Applied resources

The GCP bootstrap Terraform state is live in:

```text
gs://master-deck-476811-a8-djay-tfstate/djay/bootstrap/default.tfstate
```

Bootstrap has created:

- required service APIs;
- state bucket `master-deck-476811-a8-djay-tfstate`;
- Artifact Registry repository
  `asia-southeast3-docker.pkg.dev/master-deck-476811-a8/djay`;
- 31 purpose-scoped Secret Manager containers with no recorded secret values;
- GitHub Workload Identity Federation provider and deployment service account;
- GitHub `staging` environment identifiers.

The following have not been created:

- Cloud SQL, platform VPC/private service connection, platform KMS, or widget
  bucket;
- Cloud Run services or container images in Artifact Registry;
- global static frontend address, load balancer, managed certificate, or DNS
  records.

## Budget

- Billing-account currency is THB.
- Monthly alert budget: THB 670, approximately USD 20 at the recorded rate.
- Alert thresholds: 50%, 80%, and 100%.
- Credits are excluded from alert calculations, so gross usage triggers alerts
  even while promotional credits cover the invoice.
- This is an alert, not a hard spending cap.

A global external Application Load Balancer has a standing forwarding-rule
charge of about USD 0.025/hour (roughly USD 18.25/month before traffic). Cloud
SQL and other usage can therefore trigger the gross USD 20-equivalent alert.

## Domain and routing decision

Hostinger remains authoritative DNS for `djai.academy` through:

- `apollo.dns-parking.com`
- `athena.dns-parking.com`

The existing `voice.djai.academy` site must not be repointed. The new product
uses `djbot.djai.academy`, with staging isolated beneath it:

- `staging.djbot.djai.academy` -> public site
- `app.staging.djbot.djai.academy` -> tenant application
- `platform.staging.djbot.djai.academy` -> platform application
- `api.staging.djbot.djai.academy` -> API
- `voice.staging.djbot.djai.academy` -> Voice WebSocket gateway
- `runtime.staging.djbot.djai.academy` -> AI gateway
- `cdn.staging.djbot.djai.academy` -> widget assets

The active GCP example at
`infra/terraform/gcp-platform/staging.tfvars.example` has been updated to these
hostnames. Because Hostinger owns DNS, keep `dns_zone_name = null`. After GCP
allocates the load-balancer address, create explicit Hostinger A records for
the seven staging names, all pointing at that single address with TTL 300.

At the last check, `djbot.djai.academy` had no public A or CNAME response. That
is intentional until production launch.

## Database decision

Use private Cloud SQL PostgreSQL 16 for staging and initial production, not
Neon. The staging tier is planned as `db-f1-micro` with 20 GB SSD, backups and
point-in-time recovery. Neon remains relevant only as a possible migration
source for legacy data.

Cloud SQL is billable and has not been applied. Do not infer database approval
from approval to create a load balancer; confirm the required foundation scope
before provisioning it.

## Load-balancer checkpoint

The user requested creation of the load balancer. The correct project guard
passed, but no load-balancer mutation was attempted because its Terraform
dependencies are not ready:

- Artifact Registry currently has no application images.
- Secret Manager has containers but runtime values have not been populated.
- Cloud SQL and database roles/URLs do not exist.
- The current release content is uncommitted and therefore has no truthful,
  immutable Git SHA image tag.
- `deploy_services = true` currently deploys seven Cloud Run services as one
  unit. Their serverless NEGs and backend services are required by the URL map.

Do not create a disconnected manual address or placeholder load balancer under
the Terraform-owned names. That would create cost, state-import work, unhealthy
backends, and misleading TLS/DNS progress.

## Exact resume sequence

1. Re-run the exact project/account guard and inspect the remote bootstrap
   state read-only.
2. Review and commit the intended release scope so the image tag corresponds
   to immutable source.
3. Obtain explicit approval for the billable staging data/security foundation,
   including Cloud SQL `db-f1-micro`, 20 GB SSD, private networking, backups,
   KMS, and widget storage.
4. Install/use the pinned Terraform `1.14.6`, create a real ignored staging
   tfvars file, run a reviewed plan, then apply the foundation with
   `deploy_services = false`.
5. Create least-privilege database roles, run migrations, and place database
   URLs plus generated internal keys into Secret Manager. Never put secret
   values in Terraform state, Git, documentation, or chat.
6. Add external staging credentials through Secret Manager, including OpenAI
   and Stripe test-mode authority. Stripe webhook authority may require a
   staged deployment before the final webhook-enabled revision.
7. Build and push all immutable `linux/amd64` images using the committed SHA.
8. Plan and apply `deploy_services = true` to create Cloud Run, serverless
   backends, one global HTTPS load balancer, HTTP redirect, static IP, managed
   TLS, CDN backend, and monitoring.
9. Read the Terraform `load_balancer_ip` output and add the seven explicit A
   records in Hostinger.
10. Wait for DNS propagation and certificate `ACTIVE`, then validate HTTP,
    API, WebSocket reconnect, health probes, isolation, migration, backup and
    rollback gates before enabling paid or voice runtime traffic.

## Verification already completed

Before this pause, the bootstrap was applied and reconciled. GCP Terraform
roots, release artifact QA, the full Node verification suite, actionlint, and
an AMD64 worker image build had passed in the earlier deployment session. The
latest hostname-only tfvars edit passes HCL formatting when checked through a
temporary `.tfvars` copy and passes `git diff --check`; full module validation
was not rerun because the available temporary Terraform binary is `1.14.3`
while the module requires `1.14.6`.
