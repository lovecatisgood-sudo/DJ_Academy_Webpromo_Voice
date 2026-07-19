import type { NextRequest } from "next/server";
import { receiveFlowSocialWebhook } from "../../../../../../lib/flow-social-webhook";

export async function POST(request: NextRequest, route: { params: Promise<{ webhookKey: string }> }) {
  return receiveFlowSocialWebhook(request, (await route.params).webhookKey, "line");
}
