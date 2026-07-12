# DJAI Voice Sales Agent V1 Deployment

## Required Environment Variables

For local `.env.local`, use standard dotenv syntax (quotes are allowed):

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/dbname?sslmode=require"
OPENAI_API_KEY="sk-..."
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-me"
SESSION_PASSWORD="at-least-32-random-characters"
SESSION_SIGNING_SECRET="another-32-random-character-secret"
WIDGET_ALLOWED_ORIGINS="https://djai.academy,https://www.djai.academy"
```

In Hostinger's environment-variable form, paste only each value. **Do not include the surrounding
quotes.** For example, enter `DATABASE_URL` as the variable name and paste a value beginning with
`postgresql://` and ending with its query parameters. Do not paste `DATABASE_URL=` into the value box.

Copy `DATABASE_URL` directly from the Neon dashboard. If a password is inserted manually, URL-encode
reserved characters in it. Never paste connection strings or API keys into deployment logs or support
messages; rotate a credential immediately if it is exposed.

`OPENAI_API_KEY` is used only by the server to mint short-lived Realtime client secrets. It must never be exposed to browser code.

The Realtime model, transcription model, voice, greeting, language mode, call length, daily cap, and knowledge document are seeded by migration and editable from Admin Settings.
`WIDGET_ALLOWED_ORIGINS` controls which sites can call the public widget APIs from a browser. Use comma-separated origins.

## Runtime

- Node: `22`
- Package manager: `pnpm 11.12.0`

## Local Verification

```bash
pnpm install
pnpm verify:env
pnpm migrate
pnpm verify:source
pnpm verify:schema
pnpm typecheck
pnpm build
pnpm verify:standalone
pnpm dev
```

`pnpm build` runs the environment check, idempotent migration, source and schema checks, Next.js build,
and standalone asset preparation and verification.

Open:

- App: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`
- Health: `http://localhost:3000/api/health`

With the app running:

```bash
BASE_URL=http://localhost:3000 pnpm smoke:public
BASE_URL=http://localhost:3000 pnpm smoke:no-secrets
```

## Hostinger Cloud

Use the project as a Node app.

Configure the detected application as:

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Node.js version | 22.x |
| Package manager | pnpm |
| Build script | `build` (`pnpm build`) |
| Start script | `start` (`pnpm start`) |
| Output directory, if requested | `.next` |

The ZIP must be the newly generated `djai-voice-agent-v1-source.zip`. Its `package.json` is at the
archive root; do not place the project inside another folder and do not upload `node_modules`.

Build command:

```bash
pnpm build
```

If Hostinger shows a dropdown of package scripts instead of a free-form command, select `build`. In this project, `pnpm build` runs the full Hostinger deployment build.

Start command:

```bash
pnpm start
```

`pnpm start` runs `node --env-file-if-exists=.env.local .next/standalone/server.js`. Hostinger should provide production variables through its environment manager; `.env.local` is only for local testing.

Hostinger may display `.env.local not found. Continuing without it.` during build or startup. That is
expected: production values come from Hostinger's environment manager.

After the Hostinger app starts, run from a shell that can reach the deployed URL:

```bash
BASE_URL=https://voice.djai.academy pnpm smoke:public
```

Do not run `smoke:no-secrets` against production after env vars are configured; it is only for local no-secret routing checks.

## WordPress Embed Snippet

Replace `https://voice.djai.academy` with the deployed Node app origin:

```html
<script
  src="https://voice.djai.academy/djai-voice-widget.js"
  data-api-base="https://voice.djai.academy"
  defer
></script>
```

## Acceptance Run

After deployment and real credentials are configured, run the detailed checklist in [ACCEPTANCE.md](./ACCEPTANCE.md).

Summary scenarios:

1. Thai pricing ask: agent must only state prices present in the knowledge document.
2. English custom-app ask: agent must explain custom apps are quotation-based unless priced in knowledge.
3. Objection handling: agent should clarify concern and offer a proportionate next step.
4. Lead capture with Thai name spelling: lead row appears in Neon and Admin within seconds.
5. Support-urgent: lead need is prefixed or clearly marked `support-urgent`.

Also verify:

- Browser network traffic never includes `OPENAI_API_KEY`.
- Audio connection is browser-to-OpenAI WebRTC.
- Settings save increments `knowledge_version` and affects only new calls.
- Agent kill switch blocks `/api/session` immediately.
