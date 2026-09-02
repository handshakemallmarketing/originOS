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

## Software Sprint 2 operator application

### SW2-01 Merchant/Cocoa operator shell

Start the service and open its base URL to use the responsive operator shell:

```bash
ORIGINOS_AUTH_CONFIG=./config/auth.json pnpm start:service
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
