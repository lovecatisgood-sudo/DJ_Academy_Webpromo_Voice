# Deployment foundations

GCP is the active initial deployment target. `gcp-bootstrap/` creates the
project-level state bucket, Bangkok Artifact Registry, empty Secret Manager
containers, and the repository-restricted GitHub Workload Identity identity.
`gcp-platform/` creates isolated staging or production infrastructure and is
applied from separate GCS state prefixes.

The active topology uses Cloud Run in `asia-southeast3`, private-IP Cloud SQL
for PostgreSQL 16, Direct VPC egress, an external HTTPS load balancer with
serverless NEGs, a KMS-encrypted widget bucket behind Cloud CDN, managed TLS,
monitoring, and an optional project billing budget. The Voice gateway admits
WebSocket sessions with a 60-minute request timeout; clients must reconnect.

Always bootstrap and deploy with the exact intended GCP project ID. An account
email, display name, or remembered `gcloud` default is not an authority. Run
`scripts/gcp-project-guard.sh PROJECT_ID` before any local Terraform command.
The GitHub workflow independently checks its authenticated project against the
protected Environment secret `GCP_PROJECT_ID`.

Terraform creates secret containers but never secret versions or database
credentials. Supply values through a reviewed Secret Manager process, then run
the database migrations with least-privilege roles before admitting Cloud Run
services. Follow [gcp-bootstrap/README.md](gcp-bootstrap/README.md) for the exact
sequence.

`accounts/`, `bootstrap/`, `platform/`, and `recovery/` are the earlier AWS
foundation. They remain as an inactive portability reference and are not
called by the active deployment workflow.
