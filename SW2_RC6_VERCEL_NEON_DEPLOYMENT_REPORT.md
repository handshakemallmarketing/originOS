# SW2 RC6 — Vercel and Neon Deployment Boundary

Release: `0.17.0-rc.6`

## Decision

OriginOS now has a Vercel-compatible Node request entry point. The existing API and operator routes are reused through an extracted transport handler; the standalone listener remains available for conventional hosts.

## Controls

- Vercel composition requires OIDC and PostgreSQL configuration.
- Neon/PostgreSQL is the only serverless persistence path.
- One bounded connection pool is reused per warm function instance.
- Schema migration is idempotent across cold starts.
- Accepted command, receipt, canonical write, and transactional audit remain one serializable PostgreSQL transaction.
- Authentication, validation, and other request outcomes are stored in a separate PostgreSQL operational audit table.
- Readiness checks database reachability and transaction-store counts.
- The Vercel region is pinned to `iad1`; function duration is bounded to 60 seconds.

## Explicit exclusions

The Vercel runtime does not start an HTTP listener and does not use the JSON repository, JSON receipt file, filesystem lock, JSONL audit log, or static API-key authentication. Secrets are deployment configuration and are not committed.

## Acceptance

Release acceptance requires the full repository gate, bundled serverless-entry build, GitHub verification, live PostgreSQL certification, and a subsequent Vercel preview test against a rotated Neon credential and configured OIDC issuer.
