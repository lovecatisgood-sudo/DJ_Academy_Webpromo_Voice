variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-7"
}

variable "recovery_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate covering every service hostname."
}

variable "cloudfront_certificate_arn" {
  type        = string
  description = "ACM certificate in us-east-1 for the widget CloudFront hostname."
}

variable "route53_zone_id" {
  type        = string
  description = "Existing organization-owned Route 53 public hosted zone."
}

variable "hostnames" {
  type = object({
    public   = string
    tenant   = string
    platform = string
    api      = string
    voice    = string
    widget   = string
  })
}

variable "release_version" {
  type        = string
  description = "Immutable image tag or Git commit promoted into this environment."
}

variable "image_repositories" {
  type        = map(string)
  description = "Optional repository URL overrides keyed by runtime service."
  default     = {}
}

variable "desired_counts" {
  type = map(number)
  default = {
    public-site     = 2
    tenant-web      = 2
    platform-master = 2
    api             = 2
    ai-gateway      = 2
    voice-gateway   = 2
    workers         = 1
  }
}

variable "cpu_by_service" {
  type    = map(number)
  default = {}
}

variable "memory_by_service" {
  type    = map(number)
  default = {}
}

variable "secret_names_by_service" {
  type        = map(list(string))
  description = "Purpose-scoped secret names. Terraform creates containers only; values are supplied out of band."
  default = {
    public-site     = []
    tenant-web      = []
    platform-master = []
    api = [
      "AUTH_DATABASE_URL", "TENANT_DATABASE_URL", "PLATFORM_DATABASE_URL", "BILLING_DATABASE_URL",
      "FLOWBOT_DATABASE_URL", "AI_DATABASE_URL", "VOICE_DATABASE_URL", "AUTH_REQUEST_HASH_KEY",
      "AUTH_EMAIL_ENVELOPE_KEY", "AUTH_RATE_LIMIT_KEY", "AUTH_MFA_ENCRYPTION_KEY",
      "AUTH_MFA_RECOVERY_HASH_KEY", "PLATFORM_MFA_ENCRYPTION_KEY", "PLATFORM_RECOVERY_HASH_KEY",
      "BILLING_WEBHOOK_ENVELOPE_KEY", "BILLING_CHECKOUT_ENVELOPE_KEY", "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET", "PRIVACY_EXPORT_KEY",
      "FLOWBOT_INTEGRATION_ENVELOPE_KEY", "FLOWBOT_NOTIFICATION_ENVELOPE_KEY",
      "AI_NOTIFICATION_ENVELOPE_KEY", "USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY", "BILLING_NOTIFICATION_ENVELOPE_KEY", "AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY",
      "AI_SOCIAL_SUBJECT_HASH_KEY", "FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY",
      "FLOWBOT_SOCIAL_SUBJECT_HASH_KEY", "VOICE_AUTHORIZATION_SERVICE_TOKEN", "OPERATIONS_INGEST_TOKEN"
    ]
    ai-gateway    = ["AI_TEXT_GATEWAY_SERVICE_TOKEN", "OPENAI_API_KEY"]
    voice-gateway = ["VOICE_AUTHORIZATION_SERVICE_TOKEN", "VOICE_GEN1_API_KEY", "VOICE_GEN2_API_KEY"]
    workers = [
      "WORKER_DATABASE_URL", "FLOWBOT_DATABASE_URL", "AI_DATABASE_URL", "VOICE_DATABASE_URL",
      "AUTH_EMAIL_ENVELOPE_KEY", "PRIVACY_EXPORT_KEY", "FLOWBOT_INTEGRATION_ENVELOPE_KEY",
      "FLOWBOT_NOTIFICATION_ENVELOPE_KEY", "AI_NOTIFICATION_ENVELOPE_KEY", "USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY", "BILLING_NOTIFICATION_ENVELOPE_KEY",
      "BILLING_WEBHOOK_ENVELOPE_KEY", "BILLING_FINANCIAL_ENVELOPE_KEY", "STRIPE_SECRET_KEY",
      "ACCOUNTING_ENVELOPE_KEY", "FLOWACCOUNT_CLIENT_ID", "FLOWACCOUNT_CLIENT_SECRET",
      "AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY", "AI_SOCIAL_SUBJECT_HASH_KEY",
      "FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY",
      "AI_TEXT_GATEWAY_SERVICE_TOKEN", "EMAIL_DELIVERY_API_TOKEN"
    ]
  }
}

variable "service_environment" {
  type        = map(map(string))
  description = "Non-secret runtime configuration keyed by service."
  default     = {}
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "database_allocated_storage" {
  type    = number
  default = 100
}

variable "database_max_allocated_storage" {
  type    = number
  default = 500
}

variable "alarm_email" {
  type      = string
  default   = null
  nullable  = true
  sensitive = true
}
