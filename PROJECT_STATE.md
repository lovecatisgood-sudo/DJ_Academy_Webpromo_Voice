# DJAI Voice Agent Current State

Last updated: 2026-07-13

## Runtime Status

- Deployed app: `https://voice.djai.academy`
- Latest verified local backend build marker: `consultative-agent-2026-07-13-0015`
- Previous live backend build marker: `voice-fix-2026-07-12-2308`
- Live `POST /api/session` has been verified returning an OpenAI Realtime ephemeral client secret starting with `ek_`.
- The earlier live failure was OpenAI `401` from Hostinger runtime `OPENAI_API_KEY`; it was resolved after the correct runtime key was applied and the app restarted.

## Current Source State

- Public landing page is Thai by default.
- Top language switch supports `TH` and `EN`.
- `?lang=en` renders the English landing page.
- The document default language and metadata are Thai-led.
- Public admin link is not displayed on the landing page.
- `/widget-demo` was removed; the voice agent is embedded as a production section, not a demo page.
- Voice agent prompt is now consultative-sales focused: discovery before recommendation, benefit selling, objection handling, multilingual switching, and value-first consultation closing.
- Realtime defaults are aligned to the stronger demo setup where supported: `gpt-realtime-2.1`, `gpt-realtime-whisper`, Marin voice, far-field noise reduction, server VAD with 30s idle timeout, audio-only output, 4096 max output tokens, and low reasoning effort.

## Verification Already Run

- `node --check public/assets/js/promo.js`
- `npm run typecheck`
- `npm run verify:source`
- `npm run hostinger:build`
- Local `POST /api/session` check returning an `ek_` client secret with `modelId: gpt-realtime-2.1`
- Headless rendered smoke check for Thai default and English mode
- `npm run verify:archive`
- Live session check against `https://voice.djai.academy/api/session`

## Deployment Artifact

Current source ZIP:

```text
/home/siamesedev/Documents/codex/DJAI_WebDev_Landing_Page/djai-voice-agent-v1-source.zip
```

The ZIP includes the Thai-default landing update and the fixed voice-agent backend.

## Hostinger Env Notes

Runtime env must include:

- `OPENAI_API_KEY` with the raw OpenAI key only, no quotes and no `OPENAI_API_KEY=` prefix.
- `DATABASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_PASSWORD`
- `SESSION_SIGNING_SECRET`
- `WIDGET_ALLOWED_ORIGINS=https://djai.academy,https://www.djai.academy,https://voice.djai.academy,https://dev.djai.academy`

If `POST /api/session` returns `upstreamStatus:401`, Hostinger is using an invalid or unapplied OpenAI key.

## GitHub Note

Local commits after the initial build exist, but local `git push` previously failed because the shell had no GitHub credentials. If Hostinger deploys from GitHub, push from an authenticated terminal or deploy the ZIP directly.
