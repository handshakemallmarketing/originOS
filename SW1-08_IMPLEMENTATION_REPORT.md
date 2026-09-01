# SW1-08 Implementation Report — PostgreSQL Canonical Persistence

Release: `0.9.0-alpha.1`  
API contract: `2.0.0`  
Disposition: implemented and acceptance tested as an optional adapter; not production-ready

## Outcome

SW1-08 introduces a PostgreSQL-backed implementation of the existing `CanonicalRepository` port. It preserves the canonical record model and application boundary while removing the JSON adapter's single-process limitation for canonical batch writes.

The JSON repository remains the default reference/local adapter. Setting `ORIGINOS_DATABASE_URL` explicitly selects PostgreSQL. Storage choice does not define canonical identity, version, Authority, truth, history, or enterprise Reality.

## Transaction and storage design

- Each canonical version is stored as immutable JSONB plus indexed `canonical_id`, `record_version`, and `canonical_type` columns.
- `(canonical_id, record_version)` is the primary key.
- `appendMany` runs in a serializable transaction.
- A PostgreSQL transaction-scoped advisory lock serializes canonical writers across service processes.
- The complete candidate batch is validated against locked current state before inserts begin.
- Expected-version, next-version, and predecessor rules retain canonical error `C2C_E010_TRANSITION_INVALID`.
- Queries return current version, ordered history, and deterministic all-record ordering through the unchanged repository port.
- Schema creation is idempotent and bounded to one table and one index.

## Runtime and readiness

`ORIGINOS_DATABASE_URL` is optional but nonempty when supplied. PostgreSQL mode migrates before serving traffic and fails startup if connection or migration fails. `/ready` substitutes a live PostgreSQL canonical-store check for the JSON canonical-file check while retaining receipt and audit integrity checks.

The service-start event reports only storage mode (`postgresql` or `json`), never the database URL or credentials.

## Acceptance evidence

Automated adapter tests use a PostgreSQL-compatible in-memory engine to verify migration, two-version immutable history, current-state reads, readiness counts, and zero writes from an invalid multi-record batch. The full existing JSON service workflow, API-v2 authentication, Agent binding, recovery, backup/restore, conformance, invariants, traceability, build, and clean-install gates remain mandatory.

## Honest boundary

PostgreSQL makes each canonical batch atomic and coordinates canonical writers. It does **not** yet make the JSON command-receipt commit and PostgreSQL canonical commit one database transaction. Therefore SW1-08 does not claim cross-store exactly-once command execution. That gap must be closed by moving command receipts into the same PostgreSQL transaction boundary before horizontal command processing is enabled.

The local operations backup command is not a PostgreSQL backup. PostgreSQL deployments require database-native encrypted backup/restore, tested recovery, TLS, credential rotation, least-privilege roles, monitoring, and a real PostgreSQL integration environment. No production GO decision is asserted.
