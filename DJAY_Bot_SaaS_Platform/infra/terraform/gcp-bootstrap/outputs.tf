output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.runtime.repository_id}"
}

output "state_bucket" { value = google_storage_bucket.terraform_state.name }
output "workload_identity_provider" { value = google_iam_workload_identity_pool_provider.github.name }
output "deployment_service_account" { value = google_service_account.github_deployer.email }
output "runtime_secret_ids" { value = sort(tolist(local.runtime_secrets)) }
