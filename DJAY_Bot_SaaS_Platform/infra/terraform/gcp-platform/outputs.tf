output "database_private_ip" {
  value     = google_sql_database_instance.postgres.private_ip_address
  sensitive = true
}
output "database_connection_name" { value = google_sql_database_instance.postgres.connection_name }
output "widget_bucket" { value = google_storage_bucket.widget.name }
output "knowledge_bucket" { value = google_storage_bucket.knowledge.name }
output "load_balancer_ip" { value = var.deploy_services ? google_compute_global_address.public[0].address : null }
output "service_uris" { value = { for key, service in google_cloud_run_v2_service.runtime : key => service.uri } }
output "recovery_region" { value = var.recovery_region }
