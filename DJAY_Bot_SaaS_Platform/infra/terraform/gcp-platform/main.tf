locals {
  name = "djay-${var.environment}"

  # Phase 12 / G6d: startup uses live (process up); liveness uses ready (deps).
  services = {
    public-site     = { public = true, health_live = "/api/health/live", health_ready = "/api/health/ready", timeout = "300s", concurrency = 80 }
    tenant-web      = { public = true, health_live = "/api/health/live", health_ready = "/api/health/ready", timeout = "300s", concurrency = 80 }
    platform-master = { public = true, health_live = "/api/health/live", health_ready = "/api/health/ready", timeout = "300s", concurrency = 40 }
    api             = { public = true, health_live = "/api/health/live", health_ready = "/api/health/ready", timeout = "300s", concurrency = 80 }
    ai-gateway      = { public = true, health_live = "/health/live", health_ready = "/health/ready", timeout = "300s", concurrency = 80 }
    voice-gateway   = { public = true, health_live = "/health/live", health_ready = "/health/ready", timeout = "3600s", concurrency = 100 }
    widget-cdn      = { public = true, health_live = "/health/live", health_ready = "/health/ready", timeout = "60s", concurrency = 200 }
    workers         = { public = false, health_live = "/health/live", health_ready = "/health/ready", timeout = "300s", concurrency = 1 }
  }

  routed_services = {
    public-site     = var.hostnames.public
    tenant-web      = var.hostnames.tenant
    platform-master = var.hostnames.platform
    api             = var.hostnames.api
    ai-gateway      = var.hostnames.runtime
    voice-gateway   = var.hostnames.voice
    widget-cdn      = var.hostnames.widget
  }

  api_product_secrets = {
    AUTH_DATABASE_URL                      = "auth-database-url", TENANT_DATABASE_URL = "tenant-database-url",
    PLATFORM_DATABASE_URL                  = "platform-database-url", FLOWBOT_DATABASE_URL = "flowbot-database-url",
    AI_DATABASE_URL                        = "ai-database-url", VOICE_DATABASE_URL = "voice-database-url",
    AUTH_REQUEST_HASH_KEY                  = "auth-request-hash-key", AUTH_EMAIL_ENVELOPE_KEY = "auth-email-envelope-key",
    AUTH_RATE_LIMIT_KEY                    = "auth-rate-limit-key", AUTH_MFA_ENCRYPTION_KEY = "auth-mfa-encryption-key",
    AUTH_MFA_RECOVERY_HASH_KEY             = "auth-mfa-recovery-hash-key", PLATFORM_MFA_ENCRYPTION_KEY = "platform-mfa-encryption-key",
    PLATFORM_RECOVERY_HASH_KEY             = "platform-recovery-hash-key", PRIVACY_EXPORT_KEY = "privacy-export-key",
    FLOWBOT_INTEGRATION_ENVELOPE_KEY       = "flowbot-integration-envelope-key", FLOWBOT_NOTIFICATION_ENVELOPE_KEY = "flowbot-notification-envelope-key",
    FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY = "flowbot-social-credential-envelope-key", FLOWBOT_SOCIAL_SUBJECT_HASH_KEY = "flowbot-social-subject-hash-key",
    AI_NOTIFICATION_ENVELOPE_KEY           = "ai-notification-envelope-key", AI_INTEGRATION_ENVELOPE_KEY = "ai-integration-envelope-key",
    USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY  = "usage-alert-notification-envelope-key", AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY = "ai-social-credential-envelope-key",
    AI_SOCIAL_SUBJECT_HASH_KEY             = "ai-social-subject-hash-key", VOICE_AUTHORIZATION_SERVICE_TOKEN = "voice-authorization-service-token",
    VOICE_TELEPHONY_ENVELOPE_KEY           = "voice-telephony-envelope-key", OPERATIONS_INGEST_TOKEN = "operations-ingest-token",
  }
  api_commerce_secrets = {
    BILLING_DATABASE_URL              = "billing-database-url", BILLING_WEBHOOK_ENVELOPE_KEY = "billing-webhook-envelope-key",
    BILLING_CHECKOUT_ENVELOPE_KEY     = "billing-checkout-envelope-key", BILLING_FINANCIAL_ENVELOPE_KEY = "billing-financial-envelope-key",
    BILLING_NOTIFICATION_ENVELOPE_KEY = "billing-notification-envelope-key", STRIPE_SECRET_KEY = "stripe-secret-key",
    TEXT_TRIAL_FINGERPRINT_HASH_KEY    = "text-trial-fingerprint-hash-key",
    STRIPE_WEBHOOK_SECRET             = "stripe-webhook-secret",
  }
  worker_product_secrets = {
    WORKER_DATABASE_URL                   = "worker-database-url", FLOWBOT_DATABASE_URL = "flowbot-database-url",
    AI_DATABASE_URL                       = "ai-database-url", VOICE_DATABASE_URL = "voice-database-url", AUTH_EMAIL_ENVELOPE_KEY = "auth-email-envelope-key",
    PRIVACY_EXPORT_KEY                    = "privacy-export-key", FLOWBOT_INTEGRATION_ENVELOPE_KEY = "flowbot-integration-envelope-key",
    FLOWBOT_NOTIFICATION_ENVELOPE_KEY     = "flowbot-notification-envelope-key", FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY = "flowbot-social-credential-envelope-key",
    AI_NOTIFICATION_ENVELOPE_KEY          = "ai-notification-envelope-key", AI_INTEGRATION_ENVELOPE_KEY = "ai-integration-envelope-key",
    USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY = "usage-alert-notification-envelope-key", AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY = "ai-social-credential-envelope-key",
    AI_SOCIAL_SUBJECT_HASH_KEY            = "ai-social-subject-hash-key", AI_TEXT_GATEWAY_SERVICE_TOKEN = "ai-text-gateway-service-token",
    EMAIL_DELIVERY_API_TOKEN              = "email-delivery-api-token", MALWARE_SCANNER_TOKEN = "malware-scanner-token",
  }
  worker_commerce_secrets = {
    BILLING_NOTIFICATION_ENVELOPE_KEY = "billing-notification-envelope-key", BILLING_WEBHOOK_ENVELOPE_KEY = "billing-webhook-envelope-key",
    BILLING_FINANCIAL_ENVELOPE_KEY    = "billing-financial-envelope-key", STRIPE_SECRET_KEY = "stripe-secret-key",
    ACCOUNTING_ENVELOPE_KEY           = "accounting-envelope-key", FLOWACCOUNT_CLIENT_ID = "flowaccount-client-id",
    FLOWACCOUNT_CLIENT_SECRET         = "flowaccount-client-secret",
  }
  migration_secrets = {
    DATABASE_MIGRATION_URL = "database-migration-url", AUTH_DATABASE_URL = "auth-database-url",
    TENANT_DATABASE_URL    = "tenant-database-url", PLATFORM_DATABASE_URL = "platform-database-url",
    WORKER_DATABASE_URL    = "worker-database-url", FLOWBOT_DATABASE_URL = "flowbot-database-url",
    AI_DATABASE_URL        = "ai-database-url", VOICE_DATABASE_URL = "voice-database-url",
  }

  secret_names_by_service = {
    public-site     = {}
    tenant-web      = {}
    platform-master = {}
    api             = merge(local.api_product_secrets, var.commerce_enabled ? local.api_commerce_secrets : {})
    ai-gateway = {
      AI_TEXT_GATEWAY_SERVICE_TOKEN = "ai-text-gateway-service-token",
      AI_TEXT_API_KEY               = "ai-text-api-key",
    }
    voice-gateway = {
      VOICE_AUTHORIZATION_SERVICE_TOKEN = "voice-authorization-service-token",
      VOICE_GEN1_API_KEY                = "voice-gen1-api-key",
      VOICE_GEN2_API_KEY                = "voice-gen2-api-key",
    }
    widget-cdn = {}
    workers    = merge(local.worker_product_secrets, var.commerce_enabled ? local.worker_commerce_secrets : {})
  }

  secret_bindings = {
    for binding in flatten([
      for service, secrets in local.secret_names_by_service : [
        for env_name, secret_id in secrets : {
          key = "${service}/${env_name}", service = service, env_name = env_name, secret_id = secret_id
        }
      ]
    ]) : binding.key => binding
  }
}

data "google_storage_project_service_account" "gcs" {
  project = var.project_id
}

resource "google_compute_network" "runtime" {
  name                    = "${local.name}-network"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "runtime" {
  name                     = "${local.name}-run"
  region                   = var.region
  network                  = google_compute_network.runtime.id
  ip_cidr_range            = "10.42.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  name          = "${local.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.runtime.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.runtime.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

resource "google_kms_key_ring" "runtime" {
  name     = local.name
  location = var.region
}

resource "google_kms_crypto_key" "runtime" {
  name            = "runtime"
  key_ring        = google_kms_key_ring.runtime.id
  rotation_period = "7776000s"
  lifecycle { prevent_destroy = true }
}

resource "google_kms_crypto_key_iam_member" "widget_storage" {
  crypto_key_id = google_kms_crypto_key.runtime.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = data.google_storage_project_service_account.gcs.member
}

resource "google_sql_database_instance" "postgres" {
  name                = "${local.name}-postgres"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.environment == "production"

  settings {
    tier              = var.database_tier
    edition           = "ENTERPRISE"
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.database_disk_size_gb
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "18:00"
      transaction_log_retention_days = 7
      backup_retention_settings { retained_backups = var.environment == "production" ? 30 : 7 }
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.runtime.id
      enable_private_path_for_google_cloud_services = true
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
    insights_config {
      query_insights_enabled = true
      query_string_length    = 1024
    }
  }

  depends_on = [google_service_networking_connection.private_services]

  lifecycle {
    precondition {
      condition     = var.environment != "production" || !contains(["db-f1-micro", "db-g1-small"], var.database_tier)
      error_message = "Production Cloud SQL must use a dedicated-core tier covered by the Cloud SQL SLA."
    }
  }
}

resource "google_storage_bucket" "widget" {
  name                        = "${var.project_id}-${local.name}-widget"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  encryption {
    default_kms_key_name = google_kms_crypto_key.runtime.id
  }

  versioning { enabled = true }
  lifecycle_rule {
    condition {
      age                = 90
      num_newer_versions = 10
    }
    action { type = "Delete" }
  }


  depends_on = [google_kms_crypto_key_iam_member.widget_storage]
}

resource "google_storage_bucket" "knowledge" {
  name                        = "${var.project_id}-${local.name}-knowledge"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  encryption { default_kms_key_name = google_kms_crypto_key.runtime.id }
  versioning { enabled = true }
  lifecycle_rule {
    condition { age = 365 }
    action { type = "Delete" }
  }

  depends_on = [google_kms_crypto_key_iam_member.widget_storage]
}

resource "google_service_account" "runtime" {
  for_each     = var.deploy_services ? local.services : {}
  account_id   = substr("${local.name}-${each.key}", 0, 30)
  display_name = "DJAY ${var.environment} ${each.key}"
}

resource "google_service_account" "migration" {
  count        = var.deploy_migration_job ? 1 : 0
  account_id   = substr("${local.name}-migration", 0, 30)
  display_name = "DJAY ${var.environment} database migration"
}

resource "google_secret_manager_secret_iam_member" "migration_database" {
  for_each  = var.deploy_migration_job ? local.migration_secrets : {}
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migration[0].email}"
}

resource "google_cloud_run_v2_job" "database_migration" {
  count               = var.deploy_migration_job ? 1 : 0
  name                = "${local.name}-database-migration"
  location            = var.region
  deletion_protection = var.environment == "production"

  template {
    template {
      service_account = google_service_account.migration[0].email
      timeout         = "1800s"
      max_retries     = 0

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.runtime.name
          subnetwork = google_compute_subnetwork.runtime.name
        }
      }

      containers {
        image   = "${var.region}-docker.pkg.dev/${var.project_id}/djay/workers:${var.release_version}"
        command = ["node"]
        args    = ["migrate-database.js"]
        env {
          name  = "DATABASE_CONFIGURE_RUNTIME_ROLES"
          value = "true"
        }
        dynamic "env" {
          for_each = local.migration_secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.migration_database]
}

resource "google_storage_bucket_iam_member" "knowledge_runtime" {
  for_each = var.deploy_services ? toset(["api", "workers"]) : toset([])
  bucket   = google_storage_bucket.knowledge.name
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

resource "google_service_account_iam_member" "api_signed_urls" {
  count              = var.deploy_services ? 1 : 0
  service_account_id = google_service_account.runtime["api"].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime["api"].email}"
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = var.deploy_services ? local.secret_bindings : {}
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value.service].email}"
}

resource "google_project_iam_member" "runtime_logs" {
  for_each = var.deploy_services ? local.services : {}
  project  = var.project_id
  role     = "roles/logging.logWriter"
  member   = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

resource "google_project_iam_member" "runtime_metrics" {
  for_each = var.deploy_services ? local.services : {}
  project  = var.project_id
  role     = "roles/monitoring.metricWriter"
  member   = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

resource "google_cloud_run_v2_service" "runtime" {
  for_each            = var.deploy_services ? local.services : {}
  name                = "${local.name}-${each.key}"
  location            = var.region
  deletion_protection = var.environment == "production"
  ingress             = each.value.public ? "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" : "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account                  = google_service_account.runtime[each.key].email
    timeout                          = each.value.timeout
    max_instance_request_concurrency = each.value.concurrency
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"

    scaling {
      min_instance_count = lookup(var.min_instances, each.key, 0)
      max_instance_count = lookup(var.max_instances, each.key, 5)
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.runtime.name
        subnetwork = google_compute_subnetwork.runtime.name
      }
    }

    containers {
      name  = each.key
      image = "${var.region}-docker.pkg.dev/${var.project_id}/djay/${each.key}:${var.release_version}"

      ports { container_port = 8080 }

      resources {
        limits = {
          cpu    = lookup(var.cpu_by_service, each.key, "1")
          memory = lookup(var.memory_by_service, each.key, each.key == "voice-gateway" ? "1Gi" : "512Mi")
        }
        cpu_idle          = each.key == "workers" ? false : true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = merge(
          { NODE_ENV = "production", PORT = "8080" },
          each.key == "api" ? { KNOWLEDGE_OBJECT_BUCKET = google_storage_bucket.knowledge.name } : {},
          each.key == "workers" ? {
            KNOWLEDGE_OBJECT_BUCKET                         = google_storage_bucket.knowledge.name,
            COMMERCE_WORKERS_ENABLED                        = tostring(var.commerce_enabled),
            BILLING_WEBHOOK_WORKER_ENABLED                  = tostring(var.commerce_enabled),
            SUBSCRIPTION_LIFECYCLE_WORKER_ENABLED           = tostring(var.commerce_enabled),
            BILLING_WEBHOOK_RECOVERY_WORKER_ENABLED         = tostring(var.commerce_enabled),
            BILLING_FINANCIAL_RECONCILIATION_WORKER_ENABLED = tostring(var.commerce_enabled),
          } : {},
          lookup(var.service_environment, each.key, {})
        )
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = lookup(local.secret_names_by_service, each.key, {})
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        initial_delay_seconds = 2
        timeout_seconds       = 2
        period_seconds        = 5
        failure_threshold     = 24
        http_get {
          path = each.value.health_live
          port = 8080
        }
      }

      liveness_probe {
        timeout_seconds   = 3
        period_seconds    = 10
        failure_threshold = 3
        http_get {
          path = each.value.health_ready
          port = 8080
        }
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = var.deploy_services ? local.routed_services : {}
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.runtime[each.key].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_compute_region_network_endpoint_group" "runtime" {
  for_each              = var.deploy_services ? local.routed_services : {}
  name                  = "${local.name}-${each.key}"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run { service = google_cloud_run_v2_service.runtime[each.key].name }
}

resource "google_compute_backend_service" "runtime" {
  for_each              = var.deploy_services ? local.routed_services : {}
  name                  = "${local.name}-${each.key}"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = each.key == "widget-cdn"
  backend { group = google_compute_region_network_endpoint_group.runtime[each.key].id }
  dynamic "cdn_policy" {
    for_each = each.key == "widget-cdn" ? [true] : []
    content { cache_mode = "USE_ORIGIN_HEADERS" }
  }
  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_compute_url_map" "https" {
  count           = var.deploy_services ? 1 : 0
  name            = "${local.name}-https"
  default_service = google_compute_backend_service.runtime["public-site"].id

  dynamic "host_rule" {
    for_each = local.routed_services
    content {
      hosts        = [host_rule.value]
      path_matcher = host_rule.key
    }
  }
  dynamic "path_matcher" {
    for_each = local.routed_services
    content {
      name            = path_matcher.key
      default_service = google_compute_backend_service.runtime[path_matcher.key].id
    }
  }
}

resource "google_compute_managed_ssl_certificate" "runtime" {
  count = var.deploy_services ? 1 : 0
  name  = "${local.name}-certificate"
  managed { domains = values(var.hostnames) }
}

resource "google_compute_global_address" "public" {
  count = var.deploy_services ? 1 : 0
  name  = "${local.name}-public"
}

resource "google_compute_target_https_proxy" "runtime" {
  count            = var.deploy_services ? 1 : 0
  name             = "${local.name}-https"
  url_map          = google_compute_url_map.https[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.runtime[0].id]
}

resource "google_compute_global_forwarding_rule" "https" {
  count                 = var.deploy_services ? 1 : 0
  name                  = "${local.name}-https"
  ip_address            = google_compute_global_address.public[0].id
  port_range            = "443"
  target                = google_compute_target_https_proxy.runtime[0].id
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_url_map" "http_redirect" {
  count = var.deploy_services ? 1 : 0
  name  = "${local.name}-http-redirect"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  count   = var.deploy_services ? 1 : 0
  name    = "${local.name}-http-redirect"
  url_map = google_compute_url_map.http_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "http" {
  count                 = var.deploy_services ? 1 : 0
  name                  = "${local.name}-http"
  ip_address            = google_compute_global_address.public[0].id
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect[0].id
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

data "google_dns_managed_zone" "public" {
  count = var.deploy_services && var.dns_zone_name != null ? 1 : 0
  name  = var.dns_zone_name
}

resource "google_dns_record_set" "public" {
  for_each     = var.deploy_services && var.dns_zone_name != null ? toset(values(var.hostnames)) : toset([])
  managed_zone = data.google_dns_managed_zone.public[0].name
  name         = "${each.value}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.public[0].address]
}

resource "google_monitoring_notification_channel" "email" {
  count        = var.alarm_email == null ? 0 : 1
  display_name = "DJAY ${var.environment} operations"
  type         = "email"
  labels       = { email_address = var.alarm_email }
}

resource "google_monitoring_alert_policy" "database_cpu" {
  display_name = "${local.name} database CPU"
  combiner     = "OR"
  conditions {
    display_name = "Cloud SQL CPU above 80 percent"
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\" AND resource.label.database_id = \"${var.project_id}:${google_sql_database_instance.postgres.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  notification_channels = var.alarm_email == null ? [] : [google_monitoring_notification_channel.email[0].name]
}
