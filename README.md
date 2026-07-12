# DJAI Voice Sales Agent V1

Next.js App Router implementation of the DJAI bilingual Thai/English voice sales agent, admin backend, Neon schema, and embeddable WebRTC widget.

Runtime: Node 22 and pnpm 11.

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm verify:env
pnpm migrate
pnpm verify:source
pnpm verify:schema
pnpm hostinger:build
pnpm verify:standalone
pnpm dev
```

Open:

- `http://localhost:3000` for the production landing page with the voice sales agent
- `http://localhost:3000/admin` for the admin dashboard
- `http://localhost:3000/api/health` for a health check

With a server running, public routes can be smoke-tested:

```bash
BASE_URL=http://localhost:3000 pnpm smoke:public
BASE_URL=http://localhost:3000 pnpm smoke:no-secrets
```

## Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Hostinger Cloud env vars, build/start commands, and the WordPress embed snippet.
See [ACCEPTANCE.md](./ACCEPTANCE.md) for the live voice acceptance run.

For Hostinger build-script dropdowns, choose `build` / `pnpm build` if that is the only option. It runs the full deployment build.

## Handoff Archive

```bash
pnpm package:source
pnpm verify:archive
```

## Scope Guard

V1 intentionally uses one editable markdown knowledge document and one `capture_lead` tool. There is no RAG, vector database, queue, Redis, notifications, calendar integration, file upload, multi-user roles, or multi-tenancy.
