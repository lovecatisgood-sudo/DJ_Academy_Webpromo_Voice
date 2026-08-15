# Social Channels Exclusion Schedule

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 15 August 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.

## 1. Initial release exclusion

The initial DJBOT release is website-only. LINE Official Account, Facebook Messenger, WhatsApp, Instagram and every other social or messaging channel are excluded, unavailable for purchase and not part of any trial, package or support commitment.

## 2. Fail-closed operation

Social code and interfaces may exist for development, but production must keep `SOCIAL_CHANNELS_RELEASE_ENABLED=false`. Credentials, webhooks and workers must remain disabled. A preview, dormant entitlement or catalogue reference does not authorize activation.

## 3. Future activation

A social channel may be offered only after a new approved product schedule identifies the channel, provider, price, allowance, reply rules, Merchant duties, data fields, retention, processing regions, subprocessors, transfer safeguards, outage responsibility, disconnect behavior and support scope. The Merchant must separately accept that schedule before connection.

## 4. No current social recipient

Because social channels are excluded, LINE and Meta are not current DJBOT subprocessors for the initial release and receive no DJBOT production customer data through the Service.
