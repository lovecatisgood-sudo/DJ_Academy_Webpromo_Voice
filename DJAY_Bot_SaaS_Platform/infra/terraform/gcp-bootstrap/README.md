# GCP bootstrap and first staging deployment

No command in this runbook selects a project implicitly. Replace the shell
values once and keep them visible while reviewing every plan.

## 1. Prepare the intended project

In the intended Google account, create or select one billing-enabled staging
project. Record its immutable **Project ID**, not its display name or number.
Attach the billing account that owns the free credits and create a low billing
budget in the console immediately. Do not send account credentials, API keys,
Stripe secrets, or billing identifiers through chat.

Create a dedicated local configuration and confirm it before Terraform:

```bash
gcloud config configurations create djay-staging
gcloud config set account YOUR_INTENDED_GOOGLE_ACCOUNT
gcloud config set project YOUR_EXACT_PROJECT_ID
gcloud auth application-default login
scripts/gcp-project-guard.sh YOUR_EXACT_PROJECT_ID
```

The guard is read-only. Stop if either the active account or project is not the
intended one.

## 2. Bootstrap project services and GitHub OIDC

Copy `bootstrap.tfvars.example` to an untracked `bootstrap.auto.tfvars`, set the
exact project ID, and choose a globally unique state bucket name. Then:

```bash
cd infra/terraform/gcp-bootstrap
terraform init -backend=false
terraform plan -out=bootstrap.tfplan
terraform apply bootstrap.tfplan
terraform init -migrate-state -force-copy \
  -backend-config="bucket=YOUR_STATE_BUCKET" \
  -backend-config="prefix=djay/bootstrap"
terraform output
```

Review the plan's project ID before approval. The first initialization is local
because the backend bucket does not exist yet; migrate state immediately after
the successful apply. This root creates no runtime secret values and deploys
no application service.

## 3. Configure protected GitHub Environments

Create GitHub Environments named `staging` and later `production`. Require
reviewers for production. Add these secrets to each Environment using outputs
from that environment's own project:

- `GCP_PROJECT_ID`
- `GCP_TERRAFORM_STATE_BUCKET`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `TERRAFORM_TFVARS_JSON`

Build `TERRAFORM_TFVARS_JSON` from `../gcp-platform/staging.tfvars.example`.
It contains only non-secret configuration. Do not place database URLs, OpenAI
keys, Stripe keys, webhook secrets, or encryption keys in it. The workflow
overrides `project_id`, `release_version`, and `deploy_services` with admitted
values.

## 4. Create the staging data foundation

Dispatch `DJAY SaaS Deploy` with:

- `environment=staging`
- `apply=false`
- `bootstrap_platform=true`

Review the plan. Dispatch again with `apply=true` only after confirming the
project, region, database tier, monthly cost, hostnames, and deletion policy.
This creates the network, Cloud SQL instance, KMS key, widget bucket, and
monitoring without starting Cloud Run.

## 5. Supply secrets and migrate

Generate separate database roles and URLs for every purpose-scoped database
secret. Add Secret Manager versions without printing values to logs. Run all
`packages/db` migrations through a controlled Cloud SQL connection, including
`0000_roles.sql`, and verify forced RLS with the application roles. Populate
the remaining Secret Manager containers from `terraform output
runtime_secret_ids` in the bootstrap root.

Stripe test-mode keys and the signed webhook secret belong in Secret Manager.
Configure the Stripe endpoint only after the staging API hostname and managed
certificate are healthy.

## 6. Admit services

Dispatch a plan with `bootstrap_platform=false`. It will reference the exact
Git SHA in Artifact Registry and create the Cloud Run services, serverless
load-balancer backends, certificate, and DNS records. Use `apply=true` only
after the plan and all release gates pass.

The first production project repeats the bootstrap from a different local
`gcloud` configuration, state bucket, GitHub Environment, and GCP project.
Never reuse staging state or secrets.
