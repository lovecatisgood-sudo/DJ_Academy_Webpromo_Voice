variable "project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be the exact admitted GCP project ID."
  }
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  type    = string
  default = "asia-southeast3"
}

variable "recovery_region" {
  type    = string
  default = "asia-southeast1"
}

variable "release_version" {
  type        = string
  description = "Immutable Git commit tag already published to Artifact Registry."
}

variable "deploy_services" {
  type        = bool
  default     = false
  description = "False provisions the data/security foundation only; true admits runtime services and public routing."
}

variable "commerce_enabled" {
  type        = bool
  default     = false
  description = "Admits Stripe, billing, accounting secrets and workers. Keep false while commerce is intentionally deferred."
}

variable "deploy_migration_job" {
  type        = bool
  default     = false
  description = "Creates the one-shot release migration job. CI executes it before updating runtime services."
}

variable "hostnames" {
  type = object({
    public   = string
    tenant   = string
    platform = string
    api      = string
    voice    = string
    runtime  = string
    widget   = string
  })
}

variable "dns_zone_name" {
  type        = string
  default     = null
  nullable    = true
  description = "Existing Cloud DNS managed-zone name. Null leaves DNS records to the domain operator."
}

variable "service_environment" {
  type        = map(map(string))
  description = "Non-secret runtime configuration keyed by service."
  default     = {}
}

variable "min_instances" {
  type = map(number)
  default = {
    public-site = 0, tenant-web = 0, platform-master = 0, api = 0,
    ai-gateway  = 0, voice-gateway = 0, widget-cdn = 0, workers = 1,
  }
}

variable "max_instances" {
  type = map(number)
  default = {
    public-site = 5, tenant-web = 5, platform-master = 2, api = 10,
    ai-gateway  = 10, voice-gateway = 20, widget-cdn = 10, workers = 1,
  }
}

variable "cpu_by_service" {
  type    = map(string)
  default = {}
}
variable "memory_by_service" {
  type    = map(string)
  default = {}
}
variable "database_tier" {
  type    = string
  default = "db-custom-1-3840"
}
variable "database_disk_size_gb" {
  type    = number
  default = 20
}

variable "alarm_email" {
  type      = string
  default   = null
  nullable  = true
  sensitive = true
}
