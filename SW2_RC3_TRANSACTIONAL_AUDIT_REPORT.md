# SW2-RC3 hardening report — transactional PostgreSQL audit evidence

Release: `0.17.0-rc.3`

## Accepted control

For the PostgreSQL runtime, every authenticated application command now carries a structured audit event into the existing command transaction. The transaction contains:

1. canonical record inserts produced by the application;
2. one transactional audit event keyed to the idempotency key; and
3. the committed command receipt and response.

All three complete under one serializable transaction and advisory lock. A unique foreign-keyed idempotency key prevents duplicate transactional audit events. Replayed requests return the committed response without executing or auditing the canonical operation a second time.

## Verification

- HTTP transport tests prove the accepted command event includes principal, command identity, command type, status, and outcome before receipt commit.
- PostgreSQL tests retrieve the exact committed audit event.
- Idempotent replay proves one operation and one transactional audit event.
- Failure injection proves canonical and audit inserts precede the injected failure, `ROLLBACK` is issued last, and no `COMMIT` is issued.
- Readiness now reports canonical versions, committed receipts, and transactional audit events.

The PostgreSQL emulator records transaction control but does not faithfully undo async-context writes. The failure test therefore verifies production SQL ordering and transaction termination rather than making an unsupported emulator rollback claim. Live PostgreSQL recovery testing remains an explicit gate.

## Boundary

The existing JSONL hash chain remains valuable operational evidence, including rejected requests that do not enter a receipt transaction. It is intentionally not treated as the transaction authority.

JSON-file storage still writes canonical state, receipts, and JSONL audit as independent files. It remains suitable only for local and bounded-alpha use. Production requires PostgreSQL until a durable write-ahead journal and recovery protocol exists for file storage.

## Decision

**PASS for transactional audit completeness in the PostgreSQL command path. Live PostgreSQL failure/recovery certification remains NO-GO.**
