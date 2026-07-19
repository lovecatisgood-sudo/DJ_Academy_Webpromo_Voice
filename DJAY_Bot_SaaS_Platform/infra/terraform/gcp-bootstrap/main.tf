locals {
  required_apis = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "dns.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com",
  ])

  runtime_secrets = toset([
    "auth-database-url", "tenant-database-url", "platform-database-url", "billing-database-url", "database-migration-url",
    "flowbot-database-url", "ai-database-url", "voice-database-url", "worker-database-url",
    "auth-request-hash-key", "auth-email-envelope-key", "auth-rate-limit-key",
    "auth-mfa-encryption-key", "auth-mfa-recovery-hash-key", "platform-mfa-encryption-key",
    "platform-recovery-hash-key", "billing-webhook-envelope-key", "billing-checkout-envelope-key",
    "billing-financial-envelope-key", "billing-notification-envelope-key", "usage-alert-notification-envelope-key",
    "stripe-secret-key", "stripe-webhook-secret",
    "accounting-envelope-key", "flowaccount-client-id", "flowaccount-client-secret",
    "privacy-export-key", "flowbot-integration-envelope-key", "flowbot-notification-envelope-key",
    "flowbot-social-credential-envelope-key", "flowbot-social-subject-hash-key",
    "ai-notification-envelope-key", "ai-social-credential-envelope-key", "ai-social-subject-hash-key",
    "ai-integration-envelope-key", "voice-telephony-envelope-key", "malware-scanner-token",
    "voice-authorization-service-token", "operations-ingest-token", "ai-text-gateway-service-token",
    "openai-api-key", "voice-gen1-api-key", "voice-gen2-api-key", "email-delivery-api-token",
  ])

  deploy_roles = toset([
    "roles/artifactregistry.admin",
    "roles/cloudkms.admin",
    "roles/cloudsql.admin",
    "roles/compute.admin",
    "roles/dns.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountUser",
    "roles/monitoring.admin",
    "roles/run.admin",
    "roles/secretmanager.admin",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/storage.admin",
  ])
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service" "required" {
  for_each           = local.required_apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "terraform_state" {
  name                        = var.state_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning { enabled = true }

  lifecycle_rule {
    condition { num_newer_versions = 20 }
    action { type = "Delete" }
  }

  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository" "runtime" {
  location               = var.region
  repository_id          = "djay"
  description            = "Immutable DJAY production runtime images"
  format                 = "DOCKER"
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "retain-releases"
    action = "KEEP"
    most_recent_versions { keep_count = 30 }
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = local.runtime_secrets
  secret_id = each.value
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.required]
}

resource "google_service_account" "github_deployer" {
  project      = var.project_id
  account_id   = "djay-github-deployer"
  display_name = "DJAY GitHub deployment identity"
}

resource "google_project_iam_member" "deployer" {
  for_each = local.deploy_roles
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "djay-github"
  display_name              = "DJAY GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub repository OIDC"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref in [${join(", ", [for branch in var.github_branches : "'refs/heads/${branch}'"])}]"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_billing_budget" "monthly" {
  count           = var.billing_account_id == null ? 0 : 1
  billing_account = var.billing_account_id
  display_name    = "DJAY staging monthly budget"

  budget_filter {
    projects               = ["projects/${data.google_project.current.number}"]
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency_code
      units         = tostring(var.monthly_budget_amount)
    }
  }

  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.8 }
  threshold_rules { threshold_percent = 1.0 }
}
