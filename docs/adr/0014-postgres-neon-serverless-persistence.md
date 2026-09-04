# ADR-0014: PostgreSQL/Neon as the serverless persistence path

Status: Accepted (Vercel/serverless runtime only — ADR-0006 already accepted in-memory conformance before PostgreSQL for Sprint 0; the non-serverless service-runtime entry point may use other `CanonicalRepository` implementations).

Decision: `createServerlessRuntime` (`packages/service-runtime/src/serverless.ts`) constructs one `PostgresCanonicalRepository` (`packages/repository-postgres`) per warm function instance, bounded to `max: 5` pooled connections, and calls `repository.migrate()` before serving traffic so schema migration is idempotent across cold starts. `ORIGINOS_DATABASE_URL` is a required environment variable — `loadServerlessConfig` throws if absent.

Consequences: Accepted command, receipt, canonical write, and transactional audit are composed as one serializable PostgreSQL transaction (per the repository's own transaction boundary), which is what makes the idempotency-key replay semantics in `transport-http`'s `JsonCommandReceiptStore`-equivalent Postgres path safe under concurrent/retried requests. Readiness (`/ready`) reports `postgresql-transaction-store` health via `repository.check()`. Neon specifically is not referenced in code — `ORIGINOS_DATABASE_URL` is a generic PostgreSQL connection string; Neon is a deployment-time choice of provider, not a code dependency.

Reversal: Swap `CanonicalRepository` implementations behind the existing port, as the file-backed and in-memory repositories in `packages/repository` already do for non-serverless runs.
