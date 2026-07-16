import { redirect } from "next/navigation";
import { publicApplicationEnvironment } from "../../lib/application-environment";

export default function LoginRedirect() {
  redirect(publicApplicationEnvironment.tenantAppUrl);
}
