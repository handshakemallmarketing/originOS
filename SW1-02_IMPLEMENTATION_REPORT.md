# SW1-02 Implementation Report

Release: `0.3.0-alpha.1`  
Status: complete for the bounded Software Sprint 1 HTTP/idempotency increment; not production authorization

## Outcome

SW1-02 exposes the SW1-01 application boundary over a replaceable Node HTTP adapter. It adds durable command receipts without inserting transport state into the canonical repository. Agent, Agency, Authority, Purpose, evidence, attribution, target Transformation, and the kernel command remain application-envelope concerns.

## Delivered surface

| Method and path | Contract |
|---|---|
| `POST /v1/commands` | Executes an `ApplicationCommandEnvelope`; requires `Idempotency-Key` equal to `commandId` |
| `GET /v1/records` | Returns all canonical record versions |
| `GET /v1/records/:id` | Returns the current canonical record version |
| `GET /v1/records/:id/history` | Returns immutable history for one canonical identity |
| `GET /health` | Reports HTTP adapter liveness |

## Idempotency contract

The receipt store records the idempotency key, a stable SHA-256 digest of the command envelope, and the original status/body. Atomic file replacement makes committed receipts restart-safe.

- First use executes the application command and returns `Idempotency-Replayed: false`.
- Same key and same digest returns the stored response with `Idempotency-Replayed: true` and does not execute the application again.
- Same key and different digest returns HTTP 409 with `C2C_E009_CONFLICT_UNRESOLVED`.
- Missing keys or a key different from `commandId` are rejected before application execution.
- Receipt files are operational adapter state, separate from canonical records and canonical export/import.

## Acceptance evidence

Automated HTTP tests use a real server bound to an ephemeral loopback port and verify:

1. first execution creates exactly one canonical effect;
2. same-process replay creates no duplicate;
3. replay after closing and recreating the server, application, canonical repository, and receipt store creates no duplicate;
4. changed payload under an existing key produces canonical conflict;
5. missing and mismatched keys are rejected;
6. all/current/history query routes return persisted canonical state.

The repository-wide `pnpm check` and `pnpm build` are the release gates. Existing Sprint 0 conformance, invariants, traceability, boundary checks, and SW1-01 persistence tests remain unchanged.

## Explicit exclusions

Authentication, authorization infrastructure, TLS, rate limiting, distributed locks, multi-process receipt coordination, database adapters, event sourcing, marketplace, accounting, CRM, workflow design, optimization, AI platform features, and production deployment are not authorized by this increment.

## Known boundary

This alpha guarantees replay after a receipt has been atomically committed. It does not claim exactly-once execution across an operating-system failure occurring between canonical persistence and receipt persistence; resolving that distributed atomicity boundary belongs to a later storage/transaction design increment and must not be disguised as a canonical rule.
