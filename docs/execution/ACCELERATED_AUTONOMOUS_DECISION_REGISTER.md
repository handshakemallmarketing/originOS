# OriginOS Accelerated Autonomous Work — Decision Register

Status: ACTIVE
Programme start baseline: `main@5d723c8bf505b5ced805c01e15e30fb6280652a5`
Working branch: `originos/release-conformance-completion`

This register records decisions made during the accelerated completion programme. Engineering decisions are conservative and reversible. No entry authorizes production activation, weakens a constitutional invariant, or invents canonical semantics.

| ID | Decision | Basis | Escalation | Status |
|---|---|---|---|---|
| DR-001 | Perform remediation on a dedicated branch rather than directly on `main`. | Protect the baseline and keep exact-head evidence reviewable. | Merge requires later review. | ADOPTED |
| DR-002 | Preserve live PostgreSQL certification as a mandatory gate; do not skip, soften, or remove it. The earlier failure is not treated as a current code defect while exact-head certification passes. | Historical `main` failure was followed by a passing exact-head live PostgreSQL certification. Evidence-driven remediation forbids speculative weakening or code churn. | Reopen as P0 only on reproducible failure or contradictory evidence. | REFINED |
| DR-003 | Preserve deployment isolation as the current organization-isolation architecture; do not introduce an application-level Tenant primitive during remediation. | Existing ADR-0016 records one deployment + database + identity-provider tenant per organization. | Architecture change requires explicit decision. | ADOPTED |
| DR-004 | Preserve historical SW0 evidence and extend release evidence forward rather than rewriting old evidence. | Evidence history must remain auditable; implementation has advanced beyond SW0-only status/evidence. | Additive only. | ADOPTED |
| DR-005 | For custody identity, bind only semantics already supported by the trust model. Do not invent counterparty-consent rules for `toCustodianRef` or registration merely to close Issue #10. | Latest code distinguishes relinquishing-party identity from naming a counterparty. | If controlled corpus does not resolve remaining semantics, escalate. | ADOPTED |
| DR-006 | Reconcile Issue #6 against the newer controlled constitutional corpus before treating its 2026-09-04 preliminary findings as current blockers. | Issue #6 explicitly labels itself preliminary pending authoritative-corpus reconciliation; newer corpus artifacts exist. | Classification recorded in `ISSUE_6_CORPUS_RECONCILIATION_2026-09-16.md`. | EXECUTED |
| DR-007 | Use CB-00 scoped authority hierarchy rather than selecting a single repository-local constitutional file by filename/recency. | CB-00 states that reality/evidence outrank documents and that scope, explicit amendment, dependency validity, evidence and falsification resolve conflicts; architecture remains downstream. | Any change to the controlled hierarchy requires constitutional review. | ADOPTED |
| DR-008 | Treat later ratified SA/CBR/C2C outputs as controlled reconciliation inputs while preserving original sprint sources as historical evidence. | CBR-01 identifies the cross-sprint baseline as derived from CB-00 and SA-00–SA-05; C2C-01 defines the bounded software contract. | Do not silently rewrite historical source documents. | ADOPTED |
| DR-009 | Do not renumber existing ADRs merely to fill historical sequence gaps. | Stable decision identifiers are preferable to cosmetic renumbering; ADR-0013 through 0016 now cover the formerly missing operational decisions. | Create a new ADR only for a new decision. | ADOPTED |
| DR-010 | Quarantine `agentRef`/Participant equivalence and counterparty custody-consent semantics from autonomous invention; continue all non-semantic evidence and testing work around them. | C2C-01 distinguishes Participant and scoped Agent/Authority attribution; current evidence does not warrant collapsing them or adding consent semantics. | Escalate only if release scope requires a new semantic assertion. | ADOPTED |

## Pending decisions requiring owner input

None currently block the evidence, traceability, falsification, or release-gate work. `agentRef`/Participant equivalence and counterparty custody-consent semantics remain quarantined and will be escalated if a release decision cannot avoid them.

## Change protocol

Every autonomous decision that materially affects scope, architecture, security boundaries, evidence semantics, or release gating is appended here before or with implementation. Decisions that would change canon, weaken an invariant, materially alter a trust boundary, authorize destructive production action, or activate Production are not made autonomously.
