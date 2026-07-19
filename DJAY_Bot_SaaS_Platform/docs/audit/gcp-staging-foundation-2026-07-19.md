# GCP staging foundation checkpoint - 2026-07-19

This checkpoint records identifiers, deployed controls, and remaining work. It
contains no credential or secret value.

## Admitted authority

- Operator: `cafe@siamesecat.cafe`
- Isolated gcloud configuration: `djay-saas`
- Project: `master-deck-476811-a8` (`849425780267`)
- Primary region: Bangkok `asia-southeast3`
- Recovery region: Singapore `asia-southeast1`
- Terraform state bucket: `master-deck-476811-a8-djay-tfstate`
- Platform state prefix: `djay/staging/platform`

Application Default Credentials use the same project as their quota project.
The project guard passed and billing is enabled.

## Applied foundation

The bootstrap and staging platform states are converged with no Terraform
drift. Applied resources include:

- required project APIs, Artifact Registry, GitHub workload identity, and the
  THB 670 monthly alert budget;
- 44 purpose-scoped Secret Manager containers;
- private VPC, Bangkok subnet, private service allocation, and service
  networking connection;
- private-only Cloud SQL PostgreSQL 16 using `db-f1-micro`, 20 GB SSD, seven
  retained backups, seven days of transaction logs, and point-in-time recovery;
- Bangkok KMS key ring and rotating runtime key;
- KMS-encrypted private knowledge and widget archive buckets;
- database CPU monitoring policy.

No Cloud Run service, migration job, external load balancer, certificate, or
DNS record is deployed yet. Commerce remains disabled.

## Secret status

Version 1 exists for the migration database URL, seven product runtime database
URLs, and independent internal auth, encryption, hashing, service-to-service,
social credential, notification, privacy, usage, and voice-telephony
authorities. Values were generated directly into Secret Manager and were not
stored in Git, Terraform state, documentation, or chat.

Provider-owned secrets remain empty, including OpenAI, email delivery, malware
scanning, external voice providers, Stripe, and FlowAccount.

## Organization-policy adaptation

The effective domain-restricted-sharing policy rejects anonymous `allUsers`
bucket IAM. The widget delivery design therefore uses a deny-by-default
`widget-cdn` Cloud Run origin behind a serverless NEG and Cloud CDN. The widget
archive bucket explicitly enforces public access prevention. Release packaging,
runtime HTTP tests, and the GitHub deployment workflow include this eighth
production image.

## Verification

- Full `pnpm verify` passed across 33 workspace packages.
- Release packaging and runtime smoke QA passed for all eight artifacts.
- Both GCP Terraform roots validate with Terraform 1.14.6 and Google provider
  7.40.0.
- The staging foundation has a no-change Terraform plan after reconciliation.
- Cloud SQL reports `RUNNABLE`, private IPv4 disabled, backups enabled, and PITR
  enabled.

## Next sequence

1. Commit and push the verified release so container tags identify immutable
   source.
2. Build and push the worker image, create the one-shot migration job, execute
   all ordered migrations, and verify runtime roles/RLS.
3. Supply and qualify OpenAI staging authority; then select email and malware
   scanning providers. Telephone and social credentials follow their provider
   setup.
4. Build all eight images, enable Cloud Run services, and apply the load
   balancer/CDN plan.
5. Add the seven Hostinger A records, wait for managed TLS, and execute staging
   browser, provider, load, recovery, and security acceptance.
