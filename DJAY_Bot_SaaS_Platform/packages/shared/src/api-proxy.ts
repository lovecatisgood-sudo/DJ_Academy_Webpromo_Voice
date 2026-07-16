const localApiOrigin = "http://127.0.0.1:3103";
const maxProxyBodyBytes = 256 * 1024;

const requestHopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const responseHopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type ApiProxyOptions = Readonly<{
  apiAppUrl?: string | undefined;
  allowDevelopmentFallback: boolean;
  prefix: "platform" | "public" | "tenant";
  path: readonly string[];
}>;

type WebAppName = "platform-master" | "public-site" | "tenant-web";

function safeJson(status: number, code: string) {
  return Response.json({ status: code }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function filteredHeaders(source: Headers, excluded: ReadonlySet<string>) {
  const headers = new Headers();
  const excludedNames = new Set(excluded);
  for (const token of (source.get("connection") || "").split(",")) {
    const name = token.trim().toLowerCase();
    if (name) excludedNames.add(name);
  }
  for (const [name, value] of source) {
    if (!excludedNames.has(name.toLowerCase())) headers.append(name, value);
  }
  return headers;
}

export function resolveApiAppOrigin(value: string | undefined, allowDevelopmentFallback: boolean): string | null {
  const candidate = value || (allowDevelopmentFallback ? localApiOrigin : "");
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== candidate) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export async function apiProxyReadiness(
  apiAppUrl: string | undefined,
  allowDevelopmentFallback: boolean,
  app: WebAppName,
): Promise<Response> {
  const apiOrigin = resolveApiAppOrigin(apiAppUrl, allowDevelopmentFallback);
  if (apiOrigin) {
    try {
      const response = await fetch(`${apiOrigin}/api/health/ready`, {
        headers: { "Accept": "application/json", "Accept-Encoding": "identity" },
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      const result = response.ok ? await response.json() as { status?: unknown; app?: unknown } : null;
      if (result?.status === "ready" && result.app === "api") {
        return Response.json({ status: "ready", app }, {
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      }
    } catch {}
  }
  return Response.json({ status: "unavailable", app }, {
    status: 503,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function proxyApiRequest(request: Request, options: ApiProxyOptions): Promise<Response> {
  const apiOrigin = resolveApiAppOrigin(options.apiAppUrl, options.allowDevelopmentFallback);
  if (!apiOrigin) return safeJson(503, "api_route_unavailable");

  const target = new URL(`/${options.prefix}/${options.path.map(encodeURIComponent).join("/")}`, apiOrigin);
  target.search = new URL(request.url).search;
  const method = request.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > maxProxyBodyBytes) {
      return safeJson(413, "request_too_large");
    }
    body = await request.arrayBuffer();
    if (body.byteLength > maxProxyBodyBytes) return safeJson(413, "request_too_large");
  }

  const headers = filteredHeaders(request.headers, requestHopByHopHeaders);
  headers.set("accept-encoding", "identity");
  try {
    const upstream = await fetch(target, {
      method,
      headers,
      ...(body ? { body } : {}),
      cache: "no-store",
      redirect: "manual",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: filteredHeaders(upstream.headers, responseHopByHopHeaders),
    });
  } catch {
    return safeJson(503, "api_route_unavailable");
  }
}
