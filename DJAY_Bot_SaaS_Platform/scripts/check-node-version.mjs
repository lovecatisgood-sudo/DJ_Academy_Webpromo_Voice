#!/usr/bin/env node
/**
 * Fail loudly when verification runs on a Node major the project does not ship.
 *
 * `package.json` declares `node >=24`, but the machine's default `node` is v22. pnpm reports
 * that as a WARNING on every command and proceeds, so lint, typecheck, unit tests and builds
 * were all being validated on a runtime that will never serve production. A warning printed
 * hundreds of times is a warning nobody reads.
 *
 * Node 24 is already vendored for the database harness — `scripts/use-node24.sh` puts
 * `FlowBot_V1_App/.node/node-v24.18.0-linux-x64/bin` on PATH. This check turns the silent
 * mismatch into an actionable failure that names that wrapper.
 *
 * Set `ALLOW_NODE_MAJOR_MISMATCH=true` to proceed anyway — useful for a quick local loop, and
 * deliberately explicit so it cannot happen by accident in a release run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const declared = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).engines?.node ?? "";

const required = Number(declared.match(/(\d+)/)?.[1]);
const actual = Number(process.versions.node.split(".")[0]);

if (!Number.isFinite(required)) {
  console.error("package.json does not declare engines.node, so the runtime cannot be verified.");
  process.exit(1);
}

if (actual >= required) {
  console.info(`Node ${process.versions.node} satisfies engines.node ${declared}.`);
  process.exit(0);
}

if (process.env.ALLOW_NODE_MAJOR_MISMATCH === "true") {
  console.warn(
    `Node ${process.versions.node} does NOT satisfy engines.node ${declared}; `
    + "continuing because ALLOW_NODE_MAJOR_MISMATCH=true. Results do not reflect the shipping runtime.",
  );
  process.exit(0);
}

console.error(
  `Node ${process.versions.node} does not satisfy engines.node ${declared}.\n\n`
  + "Verifying on a runtime you do not ship proves very little. Re-run through the vendored\n"
  + "Node 24 that the database harness already uses:\n\n"
  + "    scripts/use-node24.sh pnpm run verify\n\n"
  + "Or make Node 24 the default for this shell. To override deliberately:\n\n"
  + "    ALLOW_NODE_MAJOR_MISMATCH=true pnpm run verify\n",
);
process.exit(1);
