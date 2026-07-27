import type { Metadata } from "next";
import { AdminLocalizer } from "./AdminLocalizer";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLocalizer>{children}</AdminLocalizer>;
}
