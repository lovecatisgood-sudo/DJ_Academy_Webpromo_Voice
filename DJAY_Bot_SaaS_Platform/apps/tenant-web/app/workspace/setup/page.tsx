import { redirect } from "next/navigation";

export default function RetiredGoalFirstSetupPage() {
  const publicApp = process.env.PUBLIC_APP_URL ?? "http://localhost:3100";
  redirect(`${publicApp}/build`);
}
