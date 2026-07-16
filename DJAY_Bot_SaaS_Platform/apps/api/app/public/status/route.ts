import { safeJson } from "../../../lib/http";
import { getServices } from "../../../lib/container";

export async function GET() {
  const services = await getServices();
  return safeJson({ status: await services.platformOperations.publicStatus() });
}
