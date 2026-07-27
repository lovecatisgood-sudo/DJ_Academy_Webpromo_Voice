import type { Metadata } from "next";
import StatusPageClient from "./StatusPageClient";

export const metadata: Metadata = {
  title: "สถานะบริการ | DJAY Bot",
  description: "ความพร้อมใช้งานปัจจุบันของบริการ DJAY Bot สำหรับลูกค้า โดยไม่ผูกกับผู้ให้บริการรายใด",
};

export default function StatusPage() {
  return <StatusPageClient />;
}
