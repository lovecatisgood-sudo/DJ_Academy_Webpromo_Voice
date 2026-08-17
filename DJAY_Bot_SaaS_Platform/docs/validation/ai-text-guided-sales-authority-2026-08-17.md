# AI Text FAQ, product and guided-sales authority — 2026-08-17

## Scope

`ATS-005`: answer FAQs, explain products and services, recommend suitable offers, and follow configured sales instructions.

## Implemented authority

- Published playbooks carry bilingual approved FAQs, immutable Builder business-profile facts, sales goal, behavior instructions, boundaries, approved/prohibited claims, discovery questions and CTA policy.
- Each admitted turn selects only relevant FAQs, business facts and active published knowledge/catalogue chunks. Document instructions are treated as untrusted data and prompt-injection content is excluded.
- The Sales Core directs FAQ and product/service answers to use only approved evidence. A recommendation must identify a stated need or constraint, match it to directly relevant approved evidence and explain that match; without a supported match it asks one focused discovery question.
- Merchant sales instructions govern behavior beneath truthfulness, consent, refusal, safety and evidence rules. Unsupported claims receive one controlled repair and then a safe grounded fallback.

## Verification

- Sales Core unit evidence covers instruction precedence, FAQ selection, business facts, deterministic knowledge retrieval and injection exclusion.
- AI Text runtime evidence covers bilingual FAQ grounding, business-offer explanation, cited catalogue answers, need-matched recommendations, configured behavior/boundaries, unsupported-claim repair and safe fallback.
- Repository verification, packaging and release-artifact smoke acceptance remain maintained gates.

## Acceptance boundary

`ATS-005` is implemented but unaccepted. Unmocked provider quality/evaluation evidence, browser acceptance, penetration testing, named Thai merchant acceptance and Product Owner acceptance remain open. Packages remain non-sellable.
