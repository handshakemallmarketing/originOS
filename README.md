# OriginOS

OriginOS has entered **Software Sprint 1** on top of the independently reviewed SW0-RC2 kernel.

## Current state

- Canonical package boundaries are scaffolded.
- Canonical identity, envelope, status, error, immutable version repository, and initial invariant foundations exist.
- All 15 Sprint 0 conformance fixtures are encoded.
- Expected-error semantics and foundational commands are implemented.
- All 15 controlled Sprint 0 conformance fixtures pass.
- Transformation, occurrence, initiation, interruption, completion, Outcome, Consequence, and Value status remain semantically distinct.
- Canonical export/import preserves identity, version, status, provenance, relations, uncertainty, and history.
- The final review and release evidence bundle is in `evidence/sw0-rc2`.

No fixture assertion or forbidden-side-effect clause was weakened to make the suite green.
Formal decision: GO for the bounded Sprint 0 kernel profile; NO-GO for production.

## Software Sprint 1 implementation

- Replaceable JSON-file canonical repository with atomic writes and restart-safe immutable history.
- Application command boundary carrying Agent, Agency, Authority, Purpose, evidence, attribution, and target Transformation.
- Query boundary for current record, complete history, and the canonical record set.
- Executable Merchant/Cocoa procurement-and-processing slice covering material lineage, conserved quantity, custody, Comparison, Decision, Act, Transformation, completion, Outcome, Consequence, and Value status.
- Replaceable Node HTTP adapter for commands and canonical current/history/all queries.
- Durable command receipts with request-digest conflict detection and restart-safe idempotent replay.
- Atomic multi-record repository batches and write-ahead receipt recovery close the SW1-02 crash window for the single-process JSON alpha.
- Optional PostgreSQL canonical repository with serializable batch transactions, immutable JSONB history, and database-level writer coordination.
- PostgreSQL command receipts committed in the same serializable transaction as canonical writes and the stored HTTP response.

### SW1-07 authenticated HTTP surface

- `POST /v2/commands` requires a Bearer API key and `Idempotency-Key` equal to the application `commandId`.
- `GET /v2/records` returns the canonical record set to an authenticated caller.
- `GET /v2/records/:id` returns the current immutable version to an authenticated caller.
- `GET /v2/records/:id/history` returns complete version history to an authenticated caller.
- `GET /health` reports adapter liveness only; it does not assert canonical or production readiness.
- `GET /ready` verifies the canonical store, command receipts, and audit chain; integrity failure returns HTTP 503.
- `GET /openapi.json` publishes the exact OpenAPI 3.1 contract for API v2.

Every JSON response includes `X-OriginOS-API-Version: 2.0.0`. API v1 was deliberately retired because mandatory authentication is a breaking boundary change. Command requests are rejected before receipt or canonical persistence when authentication, Agent binding, envelope, command type, payload fields, or field types fail.

Authentication proves an operational principal. Each principal has an explicit list of Agent references it may declare. This binding never creates, grants, or infers canonical Authority; Authority remains validated by the application and kernel.

HTTP, JSON receipt storage, and status mapping are replaceable adapters. They do not define canonical identity, command meaning, or history.

### SW1-04 executable service

```bash
ORIGINOS_HOST=127.0.0.1 ORIGINOS_PORT=3000 ORIGINOS_DATA_DIR=./data/originos ORIGINOS_AUTH_CONFIG=./config/auth.json pnpm start:service
```

The runtime validates its port, resolves its data directory, composes the application and adapters, and closes its HTTP listener on `SIGINT` or `SIGTERM`. Defaults bind only to `127.0.0.1`; external exposure must be an explicit operational decision.

The required auth file stores hashes, never plaintext API keys:

```json
{"version":1,"principals":[{"principalId":"ops-merchant","apiKeySha256":"<64-character SHA-256 hex>","permittedAgentRefs":["originos:merchant-1"]}]}
```

### SW1-06 operations

Stop the service before backup or restore. The data-directory lock enforces this boundary.

```bash
pnpm ops check ./data/originos
pnpm ops backup ./data/originos ./backups/originos-backup.json
pnpm ops restore ./backups/originos-backup.json ./data/originos
```

Restore verifies all backup hashes, swaps the complete managed data directory, and reports the preserved pre-restore rollback directory. Audit entries contain command identity/type and outcome metadata, not request payloads or canonical records.

### SW1-09 unified PostgreSQL command transaction

Set `ORIGINOS_DATABASE_URL` to select PostgreSQL canonical persistence. Without it, the service retains the JSON reference adapter.

```bash
ORIGINOS_DATABASE_URL='postgresql://originos:secret@localhost/originos' \
ORIGINOS_AUTH_CONFIG=./config/auth.json \
ORIGINOS_DATA_DIR=./data/originos \
pnpm start:service
```

Startup creates the bounded canonical and command-receipt tables and canonical index when absent. In PostgreSQL mode, receipt reservation, application reads, canonical batch writes, and the committed HTTP response use one checked-out client and one serializable transaction. A repeated request with the same key and digest replays the stored response; reuse with a different digest returns conflict without executing the command. `/ready` checks database reachability plus canonical-version and committed-receipt counts.

PostgreSQL deployments must use database-native encrypted backup, restore, credential, TLS, monitoring, and migration controls; `pnpm ops backup` covers only the local JSON-mode operational files and must not be represented as a PostgreSQL backup. JSON mode remains an explicitly single-process reference adapter and retains its write-ahead recovery behavior.

This remains an application alpha. Static API keys do not supply TLS, OAuth/OIDC, automatic key rotation, user administration, or production-grade authorization. The audit log is deliberately outside the canonical command transaction, and a live PostgreSQL failure-injection/recovery gate is still required before any production or horizontal-processing claim.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm check:boundaries
pnpm check:traceability
pnpm typecheck
pnpm test:conformance
```

## Canonical rule

Architecture is downstream of canon. Framework, database, authentication, and deployment concepts may not define canonical identity, Authority, Agency, truth, action, or enterprise Reality.
