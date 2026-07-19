# GCP deployment foundation validation

- Result: project bootstrap applied; platform and release-artifact gates passed locally
- Date: 2026-07-18
- Target: Google Cloud Bangkok (`asia-southeast3`)
- Deployment state: bootstrap applied to `master-deck-476811-a8`; no Cloud SQL or Cloud Run resources created

## Scope

The active deployment foundation now includes explicit-project bootstrap and
platform Terraform roots, GCS remote-state preparation, repository/branch
restricted GitHub Workload Identity Federation, Bangkok Artifact Registry,
purpose-scoped empty Secret Manager containers, private Cloud SQL PostgreSQL
16, Direct VPC egress, KMS-encrypted widget storage, Cloud Run services,
serverless load-balancer backends, managed TLS, optional Cloud DNS records,
monitoring, and an optional project billing budget.

The deployment workflow builds immutable `linux/amd64` images and overrides the
project ID from the protected GitHub Environment. Its authenticated `gcloud`
project must exactly equal that secret before a plan can proceed. The local
read-only project guard applies the same rule before an operator runs
Terraform. No runtime secret value is represented in Terraform state.

The platform is deliberately admitted in two phases. The first apply creates
the private data/security foundation with `deploy_services=false`; operators
then create least-privilege database roles, migrate, and populate Secret
Manager. Only a later reviewed apply can set `deploy_services=true` and expose
the load-balanced services.

## Executed gates

```bash
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/gcp-bootstrap init -backend=false
terraform -chdir=infra/terraform/gcp-bootstrap validate
terraform -chdir=infra/terraform/gcp-platform init -backend=false
terraform -chdir=infra/terraform/gcp-platform validate
actionlint .github/workflows/djay-saas-ci.yml .github/workflows/djay-saas-deploy.yml
bash -n scripts/gcp-project-guard.sh
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm run package:release
scripts/use-node24.sh pnpm run qa:release-artifacts
docker build --platform linux/amd64 --build-arg APP=workers -f deploy/docker/Dockerfile.bundle -t djay-gcp-worker-check:local .
git diff --check
```

## Managed bootstrap evidence

The account/project guard admitted `cafe@siamesecat.cafe`, exact project ID
`master-deck-476811-a8`, project number `849425780267`, and enabled billing. A
saved Terraform plan contained 64 additions, zero changes, and zero deletions.
The reviewed apply completed with that exact result on 2026-07-18.

Bootstrap created the private versioned state bucket
`master-deck-476811-a8-djay-tfstate`, Bangkok Artifact Registry repository
`asia-southeast3-docker.pkg.dev/master-deck-476811-a8/djay`, empty runtime
secret containers, required APIs, and the GitHub deployment identity. State was
then migrated to `gs://master-deck-476811-a8-djay-tfstate/djay/bootstrap/default.tfstate`.
A remote-state reconciliation plan returned `No changes`.

The repository's `staging` GitHub Environment now holds the project ID, state
bucket, Workload Identity provider, and deployment service-account identifiers.
It does not yet hold runtime credentials or `TERRAFORM_TFVARS_JSON`.

The billing account uses THB, so the requested initial USD 20 monthly alert was
converted at the 2026-07-17 Bank of Thailand reference rate to a THB 670 budget.
The Billing Budgets API verified calendar period `MONTH`, project filter
`projects/849425780267`, and current-spend thresholds at 50%, 80%, and 100%.
Credits are excluded from the calculation so the alert tracks gross resource
consumption while promotional credits are active. The authenticated operator
has `roles/billing.admin` and is eligible for default billing-budget email
notifications. A GCP budget sends alerts; it is not an automatic spending cap.

Both Terraform roots validated against `hashicorp/google` 7.40.0. The full
Node 24 verification gate passed. Release packaging and isolated runtime smoke
acceptance passed for API, Platform Master, Public Site, Tenant Web, widget CDN,
AI gateway, Voice gateway, and workers. The worker artifact now has liveness
and readiness endpoints while retaining fail-closed startup without database
authority. The Cloud Run worker image built as AMD64, runs as the unprivileged
`node` user, and exposes TCP port 8080.

## Open managed-environment gates

This evidence does not admit a deployment. Before the first staging plan, the
operator must provide and confirm the exact intended billing-enabled project
ID, state bucket name, domain/zone ownership, alarm recipient, database tier,
and monthly budget. The target project must still validate service quotas,
actual Cloud SQL availability, billing-credit applicability, certificate/DNS
issuance, WebSocket reconnect behavior, backup restore, and Singapore recovery
from inside that project. Production also requires a separate project/state,
regional Cloud SQL, production Stripe authority, managed migrations, load and
failure drills, and reviewed recovery evidence.
