import { apiError, apiJson } from "../../../../../lib/api";
import { getPublicConfig } from "../../../../../lib/flowbot-runtime";
import { checkWidgetOrigin, widgetOptions, withWidgetCors } from "../../../../../lib/widget-origin";

export async function OPTIONS(request: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;
  return widgetOptions(botKey, request);
}

export async function GET(request: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;
  const originCheck = await checkWidgetOrigin(botKey, request);
  if (!originCheck.ok) return originCheck.response;
  const config = await getPublicConfig(botKey);
  if (!config) return withWidgetCors(apiError("NOT_FOUND", "Bot not found.", 404), originCheck.origin);
  return withWidgetCors(apiJson(config), originCheck.origin);
}
