# Controller and Processor Role Matrix

> **Status:** COUNSEL DRAFT - NOT EFFECTIVE UNTIL APPROVED AND RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Role matrix

| Activity | Merchant role | Deejai role | Governing document | Condition |
|---|---|---|---|---|
| Merchant registration/authentication | Business customer/data source | Controller | Main Privacy Notice | Active |
| Billing/tax | Business customer | Controller | Terms; Privacy Notice | Stripe active |
| Website enquiry and lead | Controller | Processor | DPA | FlowBot active |
| Merchant marketing | Controller | Processor to documented instructions | DPA; Merchant notice | Merchant lawful basis |
| Security/abuse monitoring | Service user | Controller | Main Privacy Notice | Legitimate-interest review |
| Deejai marketing to Basic end customer | Collection-interface participant | Independent controller | Basic Addendum; Consent | Separate opt-in |
| Partner disclosure | Collection-interface participant | Disclosing controller | Addendum; Partner Consent/Terms | Disabled until named partner |
| Model development | Collection-interface participant | Controller | Model Notice and Consent | Governance gate |
| Premium contact details | Controller | Processor; no own marketing | DPA; Premium Notice | Premium rule |
| AI response delivery | Controller of business purpose | Processor for delivery; controller for separate security/model purposes | AI Schedule | Provider approved |
| Voice call delivery | Controller of call purpose/list | Processor for merchant call; controller for separate uses | Voice Schedule | Providers approved |
| LINE delivery | Controller | Processor; LINE external platform | LINE Schedule | Add-on active |
| Merchant-purpose rights request | Controller | Processor assisting | DPA | Privacy jobs |
| Deejai-purpose rights request | Cooperation duty | Controller | Privacy/Preference Notice | Direct channel |

## 2. Joint-controller caution

The parties will not use joint-controller language by default. It will be added only where both parties jointly determine essential purposes and means. The interface must clearly separate Merchant and Deejai purposes.

## 3. Processor boundary

Processor data may not be used for Deejai marketing, partner disclosure or model development unless the person separately authorises that purpose and the necessary data is copied into a logically separated Deejai-controller dataset.
