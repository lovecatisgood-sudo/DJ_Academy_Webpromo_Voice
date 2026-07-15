import { redirect } from "next/navigation";

export default function LoginRedirect() {
  redirect(process.env.TENANT_APP_URL || "http://127.0.0.1:3101");
}

