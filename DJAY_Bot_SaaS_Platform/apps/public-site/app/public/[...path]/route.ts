import { proxyApiRequest } from "@djay/shared";

type RouteContext = Readonly<{ params: Promise<{ path: string[] }> }>;

async function handler(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiRequest(request, {
    apiAppUrl: process.env.API_APP_URL,
    allowDevelopmentFallback: process.env.NODE_ENV !== "production",
    prefix: "public",
    path,
  });
}

export { handler as DELETE, handler as GET, handler as HEAD, handler as OPTIONS, handler as PATCH, handler as POST, handler as PUT };
