# SW2-RC4 certification report — live PostgreSQL gate

Release: `0.17.0-rc.4`

## Certification control

OriginOS now has a dedicated test that runs only against a real PostgreSQL server. GitHub Actions provisions an isolated PostgreSQL 17 service and supplies its connection string to the test. The normal emulator suite remains fast local evidence; it is no longer used as a substitute for database transaction certification.

## Required exercises

The live gate must prove all of the following:

- migrations are repeatable;
- an injected failure after canonical and audit inserts produces a real rollback with zero canonical records, committed receipts, or audit events;
- a successful command persists one canonical record, one receipt, and one audit event;
- replay executes no duplicate operation or audit insert;
- closing and reconnecting preserves records, receipts, replay behavior, and audit evidence;
- two concurrent transactions for the same canonical identity resolve to one `201` and one `409` under the PostgreSQL advisory lock;
- readiness counts reconcile canonical versions, committed receipts, and transactional audit events.

## Safety boundary

The certification test drops and truncates OriginOS tables. It must run only against an isolated disposable database. The CI service database is ephemeral. Manual execution requires an explicitly supplied `ORIGINOS_TEST_DATABASE_URL`; without it, the live test is skipped.

## Release rule

RC4 passes the live-database blocker only when the `live-postgresql` CI job succeeds for the published commit. A compiled or skipped test is not certification evidence.

The first live execution passed its PostgreSQL certification step and exposed an unrelated stale CI assertion that still required the obsolete Sprint 0 `RED_EXPECTED_4` state. RC4 removes that legacy partial-red gate; normal CI now runs the complete release checks and build alongside the independent live PostgreSQL job.
