# Cross-application UI foundation

Public registration, the tenant workspace, and Platform Master share
`packages/shared/brand.css`. The shared layer owns the brand palette, type
stack, keyboard focus ring, control radius, and reduced-motion behavior. Each
application may retain realm-specific emphasis: customer surfaces use green,
while restricted Platform operations use red for danger and release-blocking
states. The yellow DJAY Bot mark must remain identical across all three realms.

Navigation is an authorization surface. Tenant workspace links are derived
from the selected membership role and `tenantRoleAllows`. Platform operation
links are derived from the platform role and `platformRoleAllows`. Unknown
roles fail closed. A hidden link is not the security boundary; every API route
must continue to enforce the same permission independently.

`NEXT_PUBLIC_PUBLIC_APP_URL` is the tenant sign-in link back to public
registration. Set it to the deployed public origin before building Tenant Web.
Next.js embeds this public value at build time, so changing only the runtime
environment does not update an existing artifact. Never ship a localhost URL
in a public artifact.

## Local production-browser acceptance

Build the three web applications, start their production output on ports 3110,
3111, and 3112, then run:

```bash
scripts/use-node24.sh pnpm run qa:ui-foundation
scripts/use-node24.sh pnpm run qa:p3-ui
```

For deployed acceptance, set `PUBLIC_QA_URL`, `TENANT_QA_URL`, and
`PLATFORM_QA_URL` to the reviewed origins. The foundation gate checks desktop
and mobile overflow, shared brand color, keyboard focus visibility, the safe
cross-application registration link, authentication shells, every tenant role,
every platform role, and the existence of each visible Platform navigation
target.

Do not promote when this gate fails. A passing local gate does not replace
real-device accessibility review, named-merchant acceptance, managed service
evidence, commercial approval, or the release-readiness gate.
