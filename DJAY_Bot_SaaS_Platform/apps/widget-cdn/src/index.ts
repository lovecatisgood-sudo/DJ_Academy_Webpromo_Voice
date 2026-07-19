import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createWidgetCdnServer } from "./server";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("widget_cdn_port_invalid");

const server = createWidgetCdnServer(dirname(fileURLToPath(import.meta.url)));
server.listen(port, "0.0.0.0", () => console.info("widget_cdn_listening", { port }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
