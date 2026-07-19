variable "project_id" {
  type        = string
  description = "Existing billing-enabled GCP project ID."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be an exact GCP project ID, not a project name or account email."
  }
}

variable "region" {
  type    = string
  default = "asia-southeast3"
}

variable "state_bucket_name" {
  type        = string
  description = "Globally unique GCS bucket name for Terraform state."
  validation {
    condition     = length(var.state_bucket_name) >= 3 && length(var.state_bucket_name) <= 63
    error_message = "state_bucket_name must be a globally unique GCS bucket name between 3 and 63 characters."
  }
}

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/name form."
  default     = "lovecatisgood-sudo/DJ_Academy_Webpromo_Voice"
}

variable "github_branches" {
  type        = list(string)
  description = "Branches admitted to impersonate the deployment service account."
  default     = ["main"]
}

variable "billing_account_id" {
  type        = string
  default     = null
  nullable    = true
  description = "Optional billing account ID used to create the project budget."
  validation {
    condition = var.billing_account_id == null || can(regex(
      "^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$",
      var.billing_account_id,
    ))
    error_message = "billing_account_id must use 000000-000000-000000 format."
  }
}

variable "budget_currency_code" {
  type        = string
  default     = "USD"
  description = "ISO 4217 currency code of the billing account."
  validation {
    condition     = can(regex("^[A-Z]{3}$", var.budget_currency_code))
    error_message = "budget_currency_code must be an uppercase ISO 4217 code."
  }
}

variable "monthly_budget_amount" {
  type        = number
  default     = 20
  description = "Whole-unit monthly project budget alert amount in the billing account currency."
  validation {
    condition     = var.monthly_budget_amount > 0 && floor(var.monthly_budget_amount) == var.monthly_budget_amount
    error_message = "monthly_budget_amount must be a positive whole number."
  }
}
