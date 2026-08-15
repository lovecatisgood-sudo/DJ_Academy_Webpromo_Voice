import { redirect } from "next/navigation";

export default function PublicEntryPage() {
  redirect("/build");
}
