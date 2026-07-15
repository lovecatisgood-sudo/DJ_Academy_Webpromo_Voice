# Changelog — DJAY Bot SaaS Platform Final Vision Bundle v3.0

## Summary

Version 3.0 replaces all ambiguous or unrelated planning with a scope-locked SaaS for FlowBot, AI Chatbot and Voice Agent.

## Major corrections

- Locked exactly six public plans.
- Locked the umbrella product name as DJAY Bot SaaS Platform while retaining FlowBot, AI Chatbot and Voice Agent as the three product families.
- Restricted all provider/model visibility and configuration to the internal Platform Master Dashboard; Tenant Master Admin and Tenant Admin roles are explicitly denied.
- Locked public SaaS registration as the only merchant credential-creation path and exactly one active Tenant Master Admin per tenant in the initial release.
- Added a build-ready multi-tenant implementation plan covering identity, provisioning, isolation, subscriptions, all six plans, migration, testing and release gates.
- Explicitly excluded POS, Creative Club, child/parent/class, inventory, cashier and unrelated business-management scope.
- Defined FlowBot Basic and Premium as non-AI web chatbot plans differentiated by automation depth, integrations, team controls, branding and limits.
- Locked AI Chatbot Basic to Web only.
- Locked AI Chatbot Premium to Web + LINE + WhatsApp + Facebook Messenger.
- Locked Voice Basic to First-Generation capability and Voice Advanced to Second-Generation capability.
- Added confidential internal provider mapping:
  - Gen1 → `gemini-3.1-flash-live-preview`
  - Gen2 → `gpt-realtime-2.1`
- Prohibited provider/model leakage in ordinary customer surfaces while preserving legal disclosure.
- Added generation-integrity policy preventing silent Advanced→Basic downgrade.
- Defined understandable customer usage units and separate provider-native cost records.
- Locked included usage + charged overage as the commercial structure; exact values remain versioned decisions.
- Reworked roadmap around delivering the six plans in phases.
- Added package-entitlement, downgrade, upgrade and multi-product rules.
- Reworked QA/security/domain/Codex guidance to enforce the exact catalog.

## Supersedes

This bundle supersedes v2 and any Claude plan containing Creative Club/POS or treating the required social/voice package distinctions as optional.
