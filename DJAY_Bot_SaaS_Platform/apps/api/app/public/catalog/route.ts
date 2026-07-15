import { getServices } from "../../../lib/container";
import { requestId, safeJson } from "../../../lib/http";

export async function GET() {
  const id = requestId();
  try {
    const { catalog } = await getServices();
    return safeJson({ plans: await catalog.listPublic() }, 200, {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    });
  } catch (error) {
    console.error("public_catalog_failed", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ code: "temporarily_unavailable", message: "Catalog is unavailable.", requestId: id }, 503);
  }
}
