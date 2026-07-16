import { redirect } from "next/navigation";

export default function LoginRedirect() {
  redirect(process.env.TENANT_APP_URL || "https://app.djaybot.com");
}
