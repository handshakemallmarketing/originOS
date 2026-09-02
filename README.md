# OriginOS

OriginOS has entered **Software Sprint 2** on top of the independently reviewed SW0-RC2 kernel and the acceptance-tested Sprint 1 service boundary.

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

### SW2-RC5 authenticated HTTP surface

- `POST /v2/commands` requires a Bearer token and `Idempotency-Key` equal to the application `commandId`.
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
ORIGINOS_HOST=127.0.0.1 ORIGINOS_PORT=3000 ORIGINOS_DATA_DIR=./data/originos \
ORIGINOS_AUTH_MODE=oidc ORIGINOS_OIDC_ISSUER=https://identity.example.com \
ORIGINOS_OIDC_AUDIENCE=originos-api ORIGINOS_OIDC_JWKS_URI=https://identity.example.com/.well-known/jwks.json \
pnpm start:service
```

The runtime validates its port, resolves its data directory, composes the application and adapters, and closes its HTTP listener on `SIGINT` or `SIGTERM`. Defaults bind only to `127.0.0.1`; external exposure must be an explicit operational decision.

OIDC access tokens must be RS256 signed, no older than 15 minutes, and contain `sub`, `iat`, `exp`, the `originos:commands` scope, and a nonempty `originos_agent_refs` string array. Issuer, audience, signature, time bounds, scope, and Agent bindings are verified on every request. The claim and scope names can be changed with `ORIGINOS_OIDC_AGENT_REFS_CLAIM` and `ORIGINOS_OIDC_REQUIRED_SCOPE`.

For local development only, select `ORIGINOS_AUTH_MODE=static` and provide a hash-only auth file. Static mode is rejected when `NODE_ENV=production`:

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
ORIGINOS_AUTH_MODE=oidc \
ORIGINOS_OIDC_ISSUER=https://identity.example.com \
ORIGINOS_OIDC_AUDIENCE=originos-api \
ORIGINOS_OIDC_JWKS_URI=https://identity.example.com/.well-known/jwks.json \
ORIGINOS_DATA_DIR=./data/originos \
pnpm start:service
```

Startup creates the bounded canonical and command-receipt tables and canonical index when absent. In PostgreSQL mode, receipt reservation, application reads, canonical batch writes, and the committed HTTP response use one checked-out client and one serializable transaction. A repeated request with the same key and digest replays the stored response; reuse with a different digest returns conflict without executing the command. `/ready` checks database reachability plus canonical-version and committed-receipt counts.

PostgreSQL deployments must use database-native encrypted backup, restore, credential, TLS, monitoring, and migration controls; `pnpm ops backup` covers only the local JSON-mode operational files and must not be represented as a PostgreSQL backup. JSON mode remains an explicitly single-process reference adapter and retains its write-ahead recovery behavior.

This remains an application release candidate. OIDC supplies federated identity and issuer-managed signing-key rotation, but deployment still requires TLS termination, identity-provider administration, authorization governance, and operational monitoring. The audit log remains deliberately outside the canonical command transaction.

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

## Software Sprint 2 operator application

### SW2-01 Merchant/Cocoa operator shell

Start the service and open its base URL to use the responsive operator shell:

```bash
ORIGINOS_AUTH_MODE=static ORIGINOS_AUTH_CONFIG=./config/auth.json pnpm start:service
```

The shell establishes tested routes for Overview, Cocoa lots, Custody, Workflow, and System status. It is server rendered, keyboard navigable, mobile responsive, and composed through a replaceable web-app port. Unknown paths remain owned by the HTTP adapter and return its normal not-present response.

SW2-01 intentionally does not claim transactional lot entry or browser authentication. Those controls begin in SW2-02 and must pass focused UI-to-API-to-persistence tests before the workflow expands.

### SW2-02 transactional cocoa-lot registration

The Cocoa Lots route now provides the first end-to-end operator transaction. An operator enters the lot reference, positive quantity, origin, custodian, Agent, Agency, Authority, Purpose, evidence, and attribution rule. The page submits one authenticated `registerCocoaLot` command through API v2 and then reloads persisted `material-lot` records.

The API key is held only in the active page's JavaScript memory. It is not inserted into the document, written to local or session storage, placed in a URL, or retained after page navigation or reload. The field is cleared after successful registration. This is a bounded alpha authentication experience, not a production browser session system.

### SW2-03 conserved custody transfer

The Custody route loads persisted material lots and their custody history after operator authentication. Selecting a lot derives its complete measured quantity and current custodian; these values are read-only in the transfer form. A successful transfer is submitted through API v2 and reloaded from canonical persistence.

The kernel now rejects custody transfer when the lot is absent, the sender is not the current custodian, the receiver equals the current custodian, or the quantity differs from the complete measured lot quantity. Current custody is derived from the material lot followed by its ordered custody events, so a former custodian cannot transfer the lot again after a valid handoff.

### SW2-04 atomic processing initiation

The Workflow route loads persisted cocoa lots and derives each lot's current custodian. An operator can initiate processing only when the selected processor currently holds the lot. One authenticated API v2 command creates a linked merchant Decision, attributable and authorized Act, and initiated Transformation in a single repository append, preventing a partially recorded initiation.

The kernel rejects absent lots, processor/custodian mismatch, missing Agent, Agency, or Authority, and a second processing initiation for the same lot. This slice records initiation only: processing completion, Outcome, Consequence, and Value realization remain subsequent, separately accepted operations.

### SW2-05 atomic processing completion

The Workflow route now loads initiated Transformations that do not yet have a Completion. The operator records processed output mass, acceptance, and an operational consequence through one authenticated command. The kernel atomically persists a Completion, its Outcome, and the resulting Consequence.

Completion is rejected unless the Transformation was initiated, the initiating processor still holds the lot, output mass is positive and no greater than input mass, and no prior Completion exists. The recorded yield remains operational evidence; it does not yet create a new processed-material lot or assert Value realization.

### SW2-06 processed-material lineage

The Workflow route can now materialize a completed output as a new processed-cocoa lot. Quantity, processor custody, parent lot, Transformation, Completion, and process loss are derived from canonical records rather than re-entered by the operator.

The kernel rejects missing or inconsistent completion lineage, custody discontinuity, invalid completed mass, and a second processed lot for the same Completion. The resulting lot can participate in the existing custody-transfer flow because it uses the same canonical material-lot boundary. Split, merge, and Value realization remain outside this slice.

### SW2-07 delivery and evidence-backed Value

The existing Custody route delivers a complete processed-cocoa lot from processor to buyer. The Workflow route then records one delivery Outcome and Value status. Value is realized only when the processed lot is accepted, the buyer is its current custodian, Purpose is fulfilled, evidence is present, and consideration is settled.

Pending consideration or unfulfilled Purpose produces an incomplete Value status rather than a false realization claim. The kernel rejects delivery gaps, rejected material, invalid consideration states, missing Purpose/evidence, and duplicate Value status for a processed lot.

### SW2-RC1 bounded-alpha audit and hardening

The complete SW2 cocoa path is now release-candidate audited as one workflow rather than as isolated sprint slices. An application-level acceptance test proves the seven-command, 12-record chain from raw-lot registration through realized Value, including atomic multi-record transitions and idempotent replay.

The audit also closes a material-conservation gap: once a processed output lot has been materialized, its raw parent lot is consumed and can no longer be custody-transferred. RC1 is a GO for bounded alpha evaluation and a NO-GO for production deployment until the security, concurrency, live PostgreSQL recovery, and broader commercial boundaries in `SW2_RC1_AUDIT_REPORT.md` are resolved.

### SW2-RC2 serialized command execution

OriginOS now serializes application command execution within each running service instance. The full read–validate–append sequence completes before the next command evaluates canonical state, preventing concurrent commands with different identifiers from both passing a semantic uniqueness check against stale state.

A concurrency acceptance test submits two processed-lot materialization commands for the same Completion at once and proves that exactly one succeeds. This closes the single-service race identified by RC1; multi-instance production deployment still requires a database-backed transaction or advisory-lock boundary.

### SW2-RC3 transactional PostgreSQL audit evidence

PostgreSQL command execution now commits canonical records, the idempotency receipt, and a structured command audit event in the same serializable transaction under the existing advisory lock. If any step fails before commit, the transaction is rolled back rather than leaving canonical state without corresponding audit evidence.

Readiness reports the number of reachable transactional audit events, and tests verify the HTTP event passed into the transaction, committed event retrieval, idempotent replay without duplicate audit, and rollback SQL ordering under injected failure. The hash-chained operational log remains a separate observability channel. JSON-file mode remains bounded-alpha because atomicity cannot span its three independent files.

### SW2-RC4 live PostgreSQL certification gate

CI now provisions PostgreSQL 17 and runs a dedicated live-database certification test. The gate recreates and migrates the schema, injects a pre-commit failure and verifies real rollback, commits and replays a command, closes and reconnects the repository, and submits competing transactions that must resolve to one accepted and one rejected result with complete audit evidence.

Run the same gate against an isolated PostgreSQL database with `ORIGINOS_TEST_DATABASE_URL=... pnpm --filter @originos/repository-postgres test:live`. The test drops and truncates OriginOS tables and must never target a shared or production database.
