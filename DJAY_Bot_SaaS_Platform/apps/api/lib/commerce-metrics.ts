/**
 * Structured commerce/SRE metric logs for Cloud Logging log-based metrics.
 * Emit one JSON object per line (no PII) so GCP parsers populate jsonPayload.
 */
export function emitCommerceMetric(
  metric: "checkout_attempt" | "checkout_result" | "webhook_result" | "api_error",
  fields: Readonly<Record<string, string | number | boolean | null | undefined>>,
) {
  console.info(JSON.stringify({
    severity: "INFO",
    message: "commerce_metric",
    metric,
    ...fields,
  }));
}
