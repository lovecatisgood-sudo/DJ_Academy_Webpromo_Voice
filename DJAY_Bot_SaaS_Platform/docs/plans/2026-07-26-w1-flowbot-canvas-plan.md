# W1 execution plan — FlowBot visual authoring canvas

**Date:** 2026-07-26 · **Workstream:** W1 of `2026-07-26-reconciled-workstreams.md`
**Rule:** no time estimates. Each stage states acceptance evidence.

## Prohibitions (unchanged)

1. **Never** run migrations or DDL against a hosted database. Local disposable container only.
2. **Never** modify `.env` or any secret file.
3. **Never** mark a stage complete with failing typecheck, tests, or `npm run lint`.
4. New runtime dependencies must be named and justified. `@xyflow/react` and one layout library are pre-approved for W1; anything else must be flagged.
5. Verify claims before asserting them. `scripts/test-db-integration.sh` exists and provides a disposable Postgres — never claim a DB test cannot run.

## Verified ground truth

**Node types and their outgoing edges** (`packages/flowbot-domain/src/index.ts:56-75`):

| Type | Outgoing |
|---|---|
| `message`, `media_reference`, `product_card`, `carousel`, `actions`, `form` | `nextNodeId` (nullable) |
| `input_capture`, `variable_set`, `delay` | `nextNodeId` (required) |
| `options` | `options[].targetNodeId` (each with a localized label) |
| `condition`, `advanced_condition` | `trueNodeId`, `falseNodeId` |
| `business_hours` | `openNodeId`, `closedNodeId` |
| `webhook` | `nextNodeId`, `failureNodeId` |
| `jump` | `targetNodeId` |
| `subflow` | `returnNodeId` (nullable) |
| `end`, `team_route` | terminal |

**What publish validation actually checks** (`validateFlowForPublish`, line 204): `invalid_snapshot`, `subscription_not_active`, `non_ai_invariant_failed`, `root_node_missing`, node/topic limits, `premium_node_not_entitled`, `node_entitlement_missing`, `target_node_missing`, `keyword_target_missing`.

**Corrections to the PRD.** `PRD_CLAUDE_26JUL.md` §6.1 states graph validation for "unreachable node, broken edge, cycle" already exists. Only **broken edge** exists. There is **no cycle detection and no reachability analysis anywhere** in `flowbot-domain` or `flowbot-engine`. W1 must build them.

**Latent bug to fix.** The private `references()` helper (line 191) omits `subflow.returnNodeId`, which falls through to `default: return []`. But the engine jumps to it (`flowbot-engine/src/index.ts:137`). A flow can therefore publish with a subflow returning to a nonexistent node and fail at runtime. `target_node_missing` never fires for it.

**Brand tokens** (`packages/shared/brand.css`): `--djay-canvas`, `--djay-surface`, `--djay-ink`, `--djay-muted`, `--djay-accent`, `--djay-border`, `--djay-warning`, `--djay-warning-soft`, `--djay-danger`, `--djay-danger-soft`, `--djay-focus`, `--djay-radius-control`, `--djay-font-sans`. Use these; introduce no new colour literals.

**Current editor:** `apps/tenant-web/app/workspace/flowbot/FlowVisualEditor.tsx`, 137 lines, a linear node-card list.

---

## Stage 1 — Labelled edge model + graph validation (domain layer, no UI)

Pure, fully unit-testable, and the foundation the canvas reads. Do this first and alone.

**1.1 Export one labelled edge model** from `@djay/flowbot-domain`:

```
flowNodeEdges(node): readonly { targetNodeId: string; kind: EdgeKind; label?: LocalizedText }[]
EdgeKind = "next" | "option" | "true" | "false" | "open" | "closed" | "failure" | "jump" | "subflow_return"
```

Refactor the private `references()` to derive from `flowNodeEdges` so the two can never diverge — this is the single-source-of-truth requirement, not an optional tidy-up.

**1.2 Fix the subflow bug.** Include `subflow.returnNodeId` when non-null. Add a test asserting `target_node_missing` now fires for a subflow returning to a nonexistent node, and confirm no existing test regresses.

**1.3 Add reachability and cycle detection** to `validateFlowForPublish`, as new `FlowValidationIssue` codes:

- `unreachable_node` — not reachable from `rootNodeId`. One issue per node, with `nodeId`.
- `cycle_detected` — a cycle on a path reachable from the root. Report the entry node; do not enumerate every member.

Both must be linear-time over nodes+edges and must not throw on a malformed graph (validation runs *before* publish, so it sees broken input by design).

**Judgement call to make and document:** whether a cycle is an error or a warning. `jump` exists and loops are a legitimate authoring pattern (menu → submenu → back to menu). If a cycle blocks publish, useful flows break. Recommendation: report it, but classify it so the UI can present it as a warning rather than a publish blocker — and state clearly which you chose and why.

**1.4 Add the CTA lint** as `path_without_cta`.

CTA node types — export as a named constant so the definition is reviewable:
`actions` (any action: `call`, `line`, `website`, `booking`, `checkout`), `form`, `team_route`.

`end` is deliberately **not** a CTA — a path that simply ends without asking for anything is exactly what this lint catches. `input_capture` is also excluded: it is a generic mid-flow variable capture, not necessarily a conversion step. Document both exclusions.

Algorithm (linear, no path enumeration): BFS from `rootNodeId` **without traversing through** a CTA node. Any terminal node reached that way sits on at least one CTA-less path. Report those.

**Acceptance:** `npx vitest run packages/flowbot-domain` green with new tests covering — labelled edges for every one of the 18 node types; the subflow fix; an unreachable node; a cycle; a CTA-less branch reported and a CTA-bearing branch not reported; and a malformed graph not throwing. Plus `npx turbo run typecheck` and `npm run lint` clean.

---

## Stage 2 — Read-only canvas

Ships before editing, because it is immediately demoable and carries no mutation risk.

- Add `@xyflow/react` plus one layout library (`dagre` or `elkjs` — pick one, justify, do not add both) to `apps/tenant-web`.
- Nodes as typed cards on a pan/zoom canvas with a minimap. Edges from `flowNodeEdges`, **labelled** — option labels, true/false, open/closed, next/failure. An unlabelled branch is a merchant-comprehension failure.
- Auto-layout so existing and imported flows render sensibly without stored coordinates.
- **CTA nodes visually distinct** (colour + icon from brand tokens) so every terminating path is visibly a CTA or visibly is not.
- Surface Stage-1 validation on the canvas itself: unreachable nodes, cycle entry, and CTA-less terminals marked in place — not only in a list.
- TH + EN strings, Thai default, following `apps/tenant-web/lib/i18n/`.
- Keep the existing linear editor reachable during transition; do not delete it in this stage.

**Acceptance:** `pnpm run build` in `apps/tenant-web` succeeds and the route prerenders; a merchant opens an existing multi-branch flow and sees it laid out with labelled edges and CTA nodes distinguishable at a glance; a flow with an unreachable node and a CTA-less branch shows both marked on the canvas. Screenshot evidence for each.

---

## Stage 3 — Editable canvas

- Drag-to-connect honouring the edge model (an `options` edge may only originate from an `options` node, `true`/`false` only from a condition, and so on — the canvas must not permit a graph the schema would reject).
- Add and delete nodes from a palette; re-parent.
- Right panel reuses the **existing guided node forms**; keep the Advanced-JSON escape hatch.
- Optimistic concurrency on the draft revision, exactly as the current editor does — publish/rollback/validation behaviour must not regress.

**Acceptance:** a merchant builds a branching flow visually from scratch, edits an existing one, receives the CTA-less lint before publishing, and publishes successfully. Existing publish, rollback and validation tests still pass.

---

## Stage 4 — Simulator path overlay

- Highlight the traversed path during a test run, upgrading the existing simulator.

**Acceptance:** a test run animates the path taken; a recording suitable for marketing is produced.

---

## Out of scope for W1

Deleting the linear editor (do it once the canvas is editable and proven), stored node coordinates (auto-layout only for now), multi-user collaborative editing, and anything touching the engine's runtime behaviour.
