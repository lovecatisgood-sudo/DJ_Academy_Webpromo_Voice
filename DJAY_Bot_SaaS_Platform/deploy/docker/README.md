# Runtime images

Build from the SaaS workspace root. Runtime applications use immutable release
output rather than source-mounted development servers.

```bash
docker build -f deploy/docker/Dockerfile.next --build-arg APP=api -t djay/api:local .
docker build -f deploy/docker/Dockerfile.bundle --build-arg APP=voice-gateway -t djay/voice-gateway:local .
```

Allowed `Dockerfile.next` applications are `api`, `platform-master`,
`public-site`, and `tenant-web`. Allowed `Dockerfile.bundle` applications are
`ai-gateway`, `voice-gateway`, `widget-cdn`, and `workers`. The widget CDN runs
as a deny-by-default Cloud Run origin behind Cloud CDN so organization policy
can keep storage buckets private.

Images contain no environment files or credentials. Cloud Run injects
purpose-scoped Secret Manager values at runtime. The same image digest must be
promoted from staging to production.
