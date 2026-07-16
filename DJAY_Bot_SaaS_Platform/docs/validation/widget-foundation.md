# Customer widget foundation validation

- Result: shared FlowBot, AI Chat, and Voice browser foundation passed
- Date: 2026-07-16
- Deployment state: local bundles and CDN artifact accepted; deployed CDN and merchant acceptance pending

## Executed gates

```bash
scripts/use-node24.sh pnpm --filter @djay/shared test
scripts/use-node24.sh pnpm run lint:widget-foundation
scripts/use-node24.sh pnpm --filter @djay/flowbot-widget build
scripts/use-node24.sh pnpm --filter @djay/ai-chat-widget build
scripts/use-node24.sh pnpm --filter @djay/voice-widget build
P4_QA_SCOPE=widget scripts/use-node24.sh pnpm run qa:p4-flowbot
P5_QA_SCOPE=widget scripts/use-node24.sh pnpm run qa:p5-ai-chat
scripts/use-node24.sh pnpm run qa:p7-voice
scripts/use-node24.sh pnpm run package:release
scripts/use-node24.sh pnpm run qa:release-artifacts
```

The audit found three separately evolved customer shells: launcher dimensions,
panel radii, colors, focus treatment, and mobile offsets diverged from one
another and from `packages/shared/brand.css`. Background chat polling also
rebuilt the full shadow tree even when no event changed; an unlucky poll could
erase the visitor's in-progress input. FlowBot's offline Retry path could send a
restart action instead of performing a non-destructive reconnect. Voice rebuilt
its controls every second to update elapsed time, which could displace keyboard
focus during an active call.

All three widgets now consume the same browser-safe DJAY foundation. The static
gate enforces the shared import, canonical `#126149` green and `#f2c14e` accent,
responsive safe-area shell, visible focus, reduced motion, forced colors,
non-modal dialog semantics, launcher relationship, Escape behavior, exact API
origin, and bounded fetch path. FlowBot and AI Chat polling is single-flight,
hidden-tab aware, editing aware, change-driven, and draft preserving. Retry is
non-destructive. AI terminal states expose an explicit new-conversation action.
Voice updates elapsed time in place and restores the focused call control across
state renders.

Merchant copy-paste code now comes from one shared, typed install contract.
The contract owns the canonical API/CDN defaults, versioned module path, and
mount function for every product. It validates the product-specific opaque key,
normalizes exact HTTP(S) origins for local work, requires HTTPS in production,
and serializes script values without permitting an HTML script close. AI social
callback URLs use the same validated API authority and a qualified one-time
webhook key. Tenant production configuration is evaluated from
`NEXT_PUBLIC_API_APP_URL` and `NEXT_PUBLIC_WIDGET_CDN_URL` while loading the
Next.js configuration, so an insecure explicit value fails the build.

The full dashboard paths also created one deployment per product and accepted
the exact contract-derived install snippet. Unit and static checks reject a
product-mismatched key, malformed social key, path-bearing origin, insecure
production origin, duplicated dashboard origin, or CDN/package path drift.

Chromium accepted the minified bundles at 390x844 and representative desktop
sizes. The gates prove canonical computed colors, 44px minimum controls, panel
containment, labelled buttons, draft survival through durable handover sync,
Escape close/focus restoration, active-call end confirmation, timer focus
stability, microphone cleanup, bilingual Voice rendering, provider-neutral
content, and no page/console errors. Visual evidence is:

- `/tmp/djay-p4-widget-handover.png`
- `/tmp/djay-p5-ai-widget-handover.png`
- `/tmp/djay-p7-voice-desktop.png`
- `/tmp/djay-p7-voice-mobile.png`
- `/tmp/djay-p7-voice-thai.png`

The seventh release artifact contains exactly
`/flowbot/v1/index.js`, `/ai-chat/v1/index.js`, and `/voice/v1/index.js`.
Its accepted three-file SHA-256 is
`2f48f44654ec19bb44ffe0ba9599675695b44a0adca786c0a8ad63cc76621eac`;
the manifest separately records each bundle's SHA-384 integrity value and CDN
header policy. These local fixtures do not prove CDN configuration, real-site
content interaction, manual screen-reader behavior, zoom/reflow, or named
merchant acceptance. Repeat the artifact and browser checks through the
deployed CDN and approved merchant origins before rollout.
