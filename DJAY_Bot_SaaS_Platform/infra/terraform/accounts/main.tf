variable "management_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "staging_account_email" {
  type      = string
  sensitive = true
}

variable "production_account_email" {
  type      = string
  sensitive = true
}

variable "parent_organizational_unit_id" {
  type     = string
  default  = null
  nullable = true
}

resource "aws_organizations_account" "staging" {
  name              = "DJAY Bot Staging"
  email             = var.staging_account_email
  parent_id         = var.parent_organizational_unit_id
  close_on_deletion = false
  lifecycle { prevent_destroy = true }
}

resource "aws_organizations_account" "production" {
  name              = "DJAY Bot Production"
  email             = var.production_account_email
  parent_id         = var.parent_organizational_unit_id
  close_on_deletion = false
  lifecycle { prevent_destroy = true }
}

output "staging_account_id" { value = aws_organizations_account.staging.id }
output "production_account_id" { value = aws_organizations_account.production.id }
