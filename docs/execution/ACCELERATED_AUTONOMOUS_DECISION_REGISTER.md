# OriginOS Accelerated Autonomous Work — Decision Register

Status: ACTIVE
Programme start baseline: `main@5d723c8bf505b5ced805c01e15e30fb6280652a5`
Working branch: `originos/release-conformance-completion`

This register records decisions made during the accelerated completion programme. Engineering decisions are conservative and reversible. No entry authorizes production activation, weakens a constitutional invariant, or invents canonical semantics.

| ID | Decision | Basis | Escalation | Status |
|---|---|---|---|---|
| DR-001 | Perform remediation on a dedicated branch rather than directly on `main`. | Protect the baseline and keep exact-head evidence reviewable. | Merge requires later review. | ADOPTED |
| DR-002 | Treat failing `live-postgresql` CI as the first P0 engineering blocker. Do not skip, soften, or remove the certification job to obtain green CI. | Latest `main` CI has passing `verify` but failing live PostgreSQL transaction certification. | Any proposal to weaken the invariant requires escalation. | ADOPTED |
| DR-003 | Preserve deployment isolation as the current organization-isolation architecture; do not introduce an application-level Tenant primitive during remediation. | Existing ADR-0016 records one deployment + database + identity-provider tenant per organization. | Architecture change requires explicit decision. | ADOPTED |
| DR-004 | Preserve historical SW0 evidence and extend release evidence forward rather than rewriting old evidence. | Evidence history must remain auditable; implementation has advanced beyond SW0-only status/evidence. | Additive only. | ADOPTED |
| DR-005 | For custody identity, bind only semantics already supported by the trust model. Do not invent counterparty-consent rules for `toCustodianRef` or registration merely to close Issue #10. | Latest code distinguishes relinquishing-party identity from naming a counterparty. | If corpus does not resolve remaining semantics, escalate. | ADOPTED |
| DR-006 | Reconcile Issue #6 against the newer controlled constitutional corpus before treating its 2026-09-04 preliminary findings as current blockers. | Issue #6 explicitly labels itself preliminary pending authoritative-corpus reconciliation; newer corpus artifacts exist. | Classify findings CLOSED/SUPERSEDED/STILL_VALID/DECISION_REQUIRED with evidence. | ADOPTED |

## Pending decisions requiring owner input

None at programme start.

## Change protocol

Every autonomous decision that materially affects scope, architecture, security boundaries, evidence semantics, or release gating is appended here before or with implementation. Decisions that would change canon, weaken an invariant, materially alter a trust boundary, authorize destructive production action, or activate Production are not made autonomously.
