# AI Text Thai/English language authority — 2026-08-17

## Scope

`ATS-004`: support Thai and English conversations with per-message language detection and a configured fixed-language override.

## Implemented authority

- Starter and Advanced contract snapshots grant both `languages.th` and `languages.en`.
- The agent configuration persists a Thai/English default. A new web session uses that default for its greeting and initial widget copy.
- Migration `0133_ai_text_language_authority.sql` adds a nullable fixed override to the tenant-isolated session. Without an override, each customer turn detects Thai script first, then Latin-script English, otherwise retaining the last effective session language.
- Detection occurs inside the restricted database turn-admission function before the AI request is built. The effective language is persisted to the session and contact and is returned as the sole locale authority for FAQ selection, business facts, prompts, fallbacks, action labels, and the 200-word response invariant.
- An explicit widget `language` option is transmitted as `languageOverride`; it remains fixed even when a customer message uses the other supported script. Omitting that option preserves automatic detection.
- The repaired restricted failure function now releases quota reservations and records a bounded safe error without the former ambiguous-column failure.

## Verification

- `TEST_DB_PORT=55587 pnpm test:db`: passed 129 ordered migrations and all PostgreSQL suites. Runtime evidence proves an English-default session switches to Thai for Thai input, while an English override remains English for identical-script input; both failed test turns release reservations safely.
- Database invariants, DB/API type checks, widget tests, Thai/English executable evaluation cases, repository verification and release packaging remain part of the maintained gate.

## Acceptance boundary

`ATS-004` is implemented but unaccepted. Unmocked provider language-quality evidence, browser/widget acceptance, named Thai merchant acceptance, penetration testing and Product Owner acceptance remain open. Packages remain non-sellable.
