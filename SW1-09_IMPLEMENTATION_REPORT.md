# SW1-09 Implementation Report — Unified PostgreSQL Command Transaction

Release: `0.10.0-alpha.1`  
API contract: `2.0.0`  
Disposition: implemented and acceptance tested as an alpha transaction boundary; not production-ready

## Outcome

SW1-09 closes the cross-store gap recorded in SW1-08. In PostgreSQL mode, an idempotency receipt and the canonical records produced by its command now commit or roll back through the same PostgreSQL client and serializable transaction. The HTTP adapter depends on a receipt-store port rather than a concrete JSON class, while the PostgreSQL repository remains independent of HTTP package semantics.

## Transaction boundary

For every accepted command, the PostgreSQL receipt store:

1. checks out one database client and begins a serializable transaction;
2. takes the existing transaction-scoped writer lock;
3. locks and checks the idempotency receipt;
4. inserts a pending receipt when the key is new;
5. executes the application with repository queries and writes bound to that client through asynchronous transaction context;
6. stores the status code and response body as a committed receipt; and
7. commits once.

Any thrown failure issues `ROLLBACK`. Same-key/same-digest requests replay the committed response without application execution. Same-key/different-digest requests return HTTP conflict without application execution or canonical writes.

## Runtime and readiness

When `ORIGINOS_DATABASE_URL` is set, the service now selects both the PostgreSQL canonical repository and its PostgreSQL receipt store. JSON mode continues to use the existing file repository and write-ahead receipt recovery as a single-process reference implementation. PostgreSQL readiness reports both canonical-version and committed-receipt counts.

## Acceptance evidence

Automated PostgreSQL-adapter tests cover immutable history, invalid-batch rejection, first execution, committed-response replay, digest conflict, single application execution, shared transaction-context canonical writes, and issuance of rollback under injected failure. The full repository checks retain architecture boundaries, traceability, Sprint 0 release evidence, API authentication, service workflows, conformance fixtures, type checks, tests, and builds.

The in-memory PostgreSQL-compatible test engine does not implement transactional rollback faithfully for inserted rows. The failure-injection test therefore proves that OriginOS issues `ROLLBACK`, not that the emulator undoes it. A live PostgreSQL failure-injection and restart-recovery test is a mandatory deployment gate.

## Honest boundary

This implementation establishes database atomicity for canonical writes and command receipts under PostgreSQL semantics. It does not make the append-only audit file part of that transaction. It also does not supply production migration orchestration, high-availability validation, TLS policy, least-privilege roles, database-native backup/recovery, observability, OAuth/OIDC, or automatic credential rotation. No production GO or unrestricted horizontal-processing claim is asserted.
