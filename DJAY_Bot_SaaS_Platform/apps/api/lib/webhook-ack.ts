import { emitWebhookAck, type MetricChannel, type MetricProduct } from "@djay/shared";

/**
 * Measure provider webhook acknowledgement latency (`webhook_ack_ms`).
 *
 * Providers retry on a slow ACK, which produces duplicate-event storms, so this is a
 * hard SLO. The wrapper adds one `Date.now()` on either side and never alters the
 * response, and `emitWebhookAck` swallows its own faults, so instrumentation cannot
 * change behaviour or fail a delivery.
 */
export async function withWebhookAck(
  product: MetricProduct,
  channel: MetricChannel,
  handler: () => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();
  try {
    const response = await handler();
    emitWebhookAck({ product, channel, elapsedMs: Date.now() - startedAt, httpStatus: response.status });
    return response;
  } catch (error) {
    emitWebhookAck({ product, channel, elapsedMs: Date.now() - startedAt, httpStatus: 500 });
    throw error;
  }
}
