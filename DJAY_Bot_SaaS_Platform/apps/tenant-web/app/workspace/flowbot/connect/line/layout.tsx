import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function LineConnectionLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (process.env.SOCIAL_CHANNELS_RELEASE_ENABLED !== "true") notFound();
  return children;
}
