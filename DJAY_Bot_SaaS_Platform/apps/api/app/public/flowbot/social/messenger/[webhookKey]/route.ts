import type { NextRequest } from "next/server";
import { flowSocialChallenge, receiveFlowSocialWebhook } from "../../../../../../lib/flow-social-webhook";

export async function GET(request: NextRequest, route: { params: Promise<{ webhookKey: string }> }) {
  return flowSocialChallenge(request, (await route.params).webhookKey, "messenger");
}
export async function POST(request: NextRequest, route: { params: Promise<{ webhookKey: string }> }) {
  return receiveFlowSocialWebhook(request, (await route.params).webhookKey, "messenger");
}
