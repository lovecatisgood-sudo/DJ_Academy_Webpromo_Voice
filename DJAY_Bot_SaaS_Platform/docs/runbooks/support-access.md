# Platform Support Access

Support access grants are internal control records, not tenant memberships.

1. A Platform Support user requests access for a named active tenant, provides a
   specific reason, and selects 15-240 minutes.
2. A different, recently authenticated Platform Owner approves the request.
3. The tenant workspace displays a persistent warning while the grant is active.
4. The Platform Owner revokes access when work is complete. Expired grants are
   treated as expired even before maintenance updates their stored status.

Self-approval is denied by repository predicates and database constraints. Every
request, approval, and revocation writes a Platform audit event. A grant confers
no provider/model routing authority, creates no tenant cookie, and must never be
used to bypass tenant RLS.

During an incident, revoke the grant first, revoke the platform user's sessions,
preserve platform/tenant audit records, and investigate by grant ID. Do not edit
or delete grant history to hide an expired or mistaken request.
