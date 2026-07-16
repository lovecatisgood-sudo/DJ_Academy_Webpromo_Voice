import { apiProxyReadiness } from "@djay/shared";

export function GET() {
  return apiProxyReadiness(process.env.API_APP_URL, process.env.NODE_ENV !== "production", "public-site");
}
