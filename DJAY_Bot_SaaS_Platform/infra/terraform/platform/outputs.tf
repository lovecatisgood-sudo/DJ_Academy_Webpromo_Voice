output "ecr_repositories" {
  value = { for key, repository in aws_ecr_repository.service : key => repository.repository_url }
}

output "alb_dns_name" { value = aws_lb.this.dns_name }
output "widget_bucket" { value = aws_s3_bucket.widget.id }
output "widget_distribution_id" { value = aws_cloudfront_distribution.widget.id }
output "database_endpoint" {
  value     = aws_db_instance.postgres.endpoint
  sensitive = true
}

output "database_master_secret_arn" {
  value     = aws_db_instance.postgres.master_user_secret[0].secret_arn
  sensitive = true
}

output "runtime_secret_arns" {
  value     = { for key, secret in aws_secretsmanager_secret.runtime : key => secret.arn }
  sensitive = true
}
output "recovery_region" { value = var.recovery_region }
