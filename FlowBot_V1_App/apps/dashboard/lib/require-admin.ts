import { getAdminSession } from "@flowbot/db";
import { getAdminSessionToken } from "./admin-auth";

export async function requireAdmin() {
  const sessionToken = await getAdminSessionToken();
  if (!sessionToken) return null;
  return getAdminSession({ sessionToken });
}
