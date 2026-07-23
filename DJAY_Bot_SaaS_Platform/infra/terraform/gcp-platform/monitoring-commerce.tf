# Phase 12 commerce / SRE metrics + alerts (GCP)
# Requires var.alarm_email as the named on-call inbox for webhook/checkout pages.

locals {
  commerce_metric_filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.message=\"commerce_metric\""
}

resource "google_logging_metric" "checkout_result" {
  count  = var.deploy_services ? 1 : 0
  name   = "${local.name}-checkout-result"
  filter = "${local.commerce_metric_filter} AND jsonPayload.metric=\"checkout_result\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    labels {
      key         = "outcome"
      value_type  = "STRING"
      description = "checkout outcome"
    }
  }
  label_extractors = {
    outcome = "EXTRACT(jsonPayload.outcome)"
  }
}

resource "google_logging_metric" "webhook_result" {
  count  = var.deploy_services ? 1 : 0
  name   = "${local.name}-webhook-result"
  filter = "${local.commerce_metric_filter} AND jsonPayload.metric=\"webhook_result\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    labels {
      key         = "outcome"
      value_type  = "STRING"
      description = "webhook apply outcome"
    }
  }
  label_extractors = {
    outcome = "EXTRACT(jsonPayload.outcome)"
  }
}

resource "google_logging_metric" "api_error_5xx" {
  count  = var.deploy_services ? 1 : 0
  name   = "${local.name}-api-error-5xx"
  filter = "${local.commerce_metric_filter} AND jsonPayload.metric=\"api_error\" AND jsonPayload.httpStatus>=500"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_monitoring_alert_policy" "webhook_failures" {
  count        = var.deploy_services && var.alarm_email != null ? 1 : 0
  display_name = "${local.name} Stripe webhook failures"
  combiner     = "OR"
  conditions {
    display_name = "Webhook failed outcomes above threshold"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.webhook_result[0].name}\" AND metric.label.outcome=\"failed\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email[0].name]
  documentation {
    content   = "Owner: set var.alarm_email (SRE on-call). See docs/runbooks/sre-slos.md"
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "checkout_5xx" {
  count        = var.deploy_services && var.alarm_email != null ? 1 : 0
  display_name = "${local.name} checkout 5xx"
  combiner     = "OR"
  conditions {
    display_name = "Checkout temporarily_unavailable / api_error spike"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.api_error_5xx[0].name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      duration        = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email[0].name]
  documentation {
    content   = "Owner: set var.alarm_email (SRE on-call). See docs/runbooks/sre-slos.md"
    mime_type = "text/markdown"
  }
}
