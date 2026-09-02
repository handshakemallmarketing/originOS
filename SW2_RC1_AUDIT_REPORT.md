# SW2-RC1 audit report — bounded-alpha workflow

Release: `0.17.0-rc.1`

## Decision

**GO for bounded alpha evaluation. NO-GO for production deployment.**

The first cocoa workflow is internally coherent and executable from raw-lot registration through evidence-backed Value realization. The release candidate is suitable for controlled evaluation with known operators and non-production data. The remaining boundaries below are deliberate blockers to a production claim.

## End-to-end acceptance boundary

One application-level acceptance test executes seven commands and verifies the resulting 12 canonical records:

| Operation | Atomic records created |
| --- | --- |
| Register raw cocoa | Material Lot |
| Transfer raw custody | Custody Transfer |
| Initiate processing | Decision, Act, Transformation |
| Complete processing | Completion, Outcome, Consequence |
| Materialize output | Processed Material Lot |
| Deliver output | Custody Transfer |
| Record realization | Delivery Outcome, Value Status |

The test also proves idempotent replay of the realization command and rejection of custody movement for the consumed raw input.

## Cross-layer audit

| Boundary | RC evidence | Result |
| --- | --- | --- |
| Schema and API | Strict command shapes, enumerated command types, OpenAPI v2 fingerprint | Pass |
| Kernel semantics | Identity, custody, mass conservation, authority, provenance, processing, lineage, delivery, Value | Pass |
| Application | Required command context, deterministic fingerprinting, atomic multi-record append, replay | Pass |
| HTTP | Authentication, request validation, command receipt/idempotency behavior | Pass |
| Persistence | Immutable in-memory and JSON repositories; PostgreSQL implementation and migrations | Pass in automated scope |
| Operator UI | Functional lot, custody, workflow, and system routes mapped to API v2 commands | Pass |
| Operations | Audit-log verification, backup/restore, single-process lock, restart durability | Pass in service integration |

## Integrity defect closed in RC1

Earlier SW2 slices allowed the raw parent lot to remain transferable after its processed output had been materialized. That could represent two independently movable material chains derived from the same input mass. `transferCustody` now rejects a lot referenced as the parent of an existing processed-cocoa lot. Transfers before materialization remain permitted; materialization then requires custody continuity with the completing processor.

## Production blockers and explicit exclusions

- Static API keys are not production identity: TLS termination, OIDC or equivalent identity, key rotation, authorization administration, and secrets operations remain required.
- Audit-log append is not in the same transaction as canonical command persistence.
- Live PostgreSQL failure injection, backup recovery, migration rollback, and operational load testing remain required.
- Cross-command semantic uniqueness can race when different command identifiers execute concurrently; database-enforced constraints or serialized aggregate execution are required.
- Browser automation, accessibility conformance, and penetration testing are not yet release gates.
- Partial lots, splits, merges, co-products, rework, and waste identities are outside this bounded workflow.
- Invoices, ledger settlement, partial payment, refunds, disputes, and reconciliation are outside the current Value assertion.

## Exit criteria for production consideration

Production consideration requires closing the security and transactional-audit boundaries, proving concurrent semantic uniqueness, exercising live PostgreSQL recovery, and completing browser/accessibility/security validation. Capability expansion should not precede those controls unless separately isolated from this release candidate.
