#!/usr/bin/env bash
set -euo pipefail

expected_project_id="${1:-}"
if [[ -z "$expected_project_id" ]]; then
  printf 'Usage: %s EXACT_GCP_PROJECT_ID\n' "$0" >&2
  exit 64
fi

if ! command -v gcloud >/dev/null 2>&1; then
  printf 'gcloud is required.\n' >&2
  exit 69
fi

active_account="$(gcloud config get-value account 2>/dev/null)"
active_project="$(gcloud config get-value project 2>/dev/null)"

if [[ "$active_project" != "$expected_project_id" ]]; then
  printf 'Refusing GCP operation: active project is %q, expected %q.\n' \
    "$active_project" "$expected_project_id" >&2
  exit 78
fi

project_number="$(gcloud projects describe "$expected_project_id" --format='value(projectNumber)')"
billing_enabled="$(gcloud billing projects describe "$expected_project_id" --format='value(billingEnabled)')"

printf 'Admitted GCP account: %s\n' "$active_account"
printf 'Admitted GCP project: %s (%s)\n' "$active_project" "$project_number"
printf 'Billing enabled: %s\n' "$billing_enabled"

if [[ "$billing_enabled" != "True" && "$billing_enabled" != "true" ]]; then
  printf 'Refusing GCP operation: billing is not enabled for %s.\n' "$expected_project_id" >&2
  exit 78
fi
