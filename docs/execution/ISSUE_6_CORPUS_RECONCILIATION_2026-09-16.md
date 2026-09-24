# Issue #6 Corpus Reconciliation — 2026-09-16

Baseline issue: #6, audited at `1890240f8aa73609341f1372d7cf981aedffdc6c`.
Programme branch baseline: `5d723c8bf505b5ced805c01e15e30fb6280652a5`.

## Rule

Issue #6 explicitly described its findings as preliminary pending reconciliation against the authoritative corpus. This document performs that reconciliation using the later controlled corpus available to the programme. It does not rewrite Issue #6, assign new scientific meaning, or treat software architecture as canonical authority.

## Controlling later corpus established

The programme now has documentary controls that did not exist in the repository at the Issue #6 audit:

- **CB-00 — Authoritative Corpus Manifest v0.1**: establishes corpus identity/audit routing and the authority hierarchy. Reality/evidence outrank documents; research governance is procedural; sprint scientific sources supply claims within audited scope; ratified reconciliation outputs govern after dependency/regression review; architecture/implementation are downstream interpretations.
- **SA-00 through later SA audits**: ratified audit outputs reconcile sprint sources rather than allowing later prose or filenames to create authority.
- **CBR-01 — Canonical Baseline Release and Cross-Sprint Reconciliation v1.0**: controlled cross-sprint semantic baseline.
- **C2C-01 — Canon-to-Code Contract and Conformance Specification v1.0**: controlled bounded software contract. Its Sprint 0 Definition of Done requires all 20 C2C invariants, 14 error conditions, 15 fixtures, explicit traceability, authority not inferred from access, separation of computation/determination/action, separation of completion/outcome/consequence/value, reversible architecture decisions, and a release evidence bundle.

These controls supersede the premise that the programme must choose one repository-local constitutional document by filename before any reconciliation can proceed. CB-00 explicitly says recency, polish, filename, or implementation convenience cannot create authority.

## Classification of Issue #6 findings

| Issue #6 finding/request | Current classification | Current disposition |
|---|---|---|
| No authoritative corpus manifest | **CLOSED_BY_LATER_CORPUS** | CB-00 now supplies controlled source identity, lineage, authority scope, and audit routing. |
| Need to choose top-level Constitution vs RG-001 as a single binding file | **SUPERSEDED_BY_AUTHORITY_HIERARCHY** | CB-00 supplies scoped authority rather than a filename-winner rule. Conflicts are resolved by scope, amendment, dependency validity, evidence and falsification. |
| RG-011 ratification unknown blocks all reconciliation | **SUPERSEDED_AS_GLOBAL_BLOCKER** | CB-00 treats RG documents as procedural candidates subject to Sprint-0 validation; later ratified SA/CBR/C2C outputs provide controlled software authority. RG-011 status may remain historically relevant but is not used here to invent missing software semantics. |
| Sprint I–V freeze certificates absent from repository | **PARTIALLY_SUPERSEDED / REPOSITORY_INTEGRATION_GAP** | Later SA audit outputs provide ratified reconciliation evidence. Repository still needs explicit references/copies or controlled identifiers for release reproducibility. |
| Eight living registers absent | **STILL_VALID_AS_REPOSITORY_GOVERNANCE_GAP, NOT A CODE-BLOCKING PRIMITIVE GAP** | Do not fabricate registers. Current release evidence must cite controlled baseline artifacts and record residual absence where applicable. |
| No canon-to-code contract | **CLOSED_BY_LATER_CORPUS** | C2C-01 exists and defines the bounded representation/conformance contract. |
| SW1/SW2 additions missing from traceability JSON | **STILL_VALID** | Repository traceability remains SW0-oriented and must be extended without rewriting historical SW0 entries. |
| Custody/processing conservation enforcement absent | **CLOSED / NOT A GAP** | Issue #6 mutation testing already demonstrated existing tests catch these mutations. |
| Materialization and Value/delivery conservation unclassified | **STILL_VALID — TARGETED FALSIFICATION REQUIRED** | Execute mutation/negative testing before clearing. |
| Release checker certifies SW0-RC2 only | **STILL_VALID — P1 RELEASE-EVIDENCE GAP** | Current software must have release-aware evidence; historical SW0 evidence remains immutable. |
| SW1/SW2 governance evidence missing | **STILL_VALID — P1** | Create current evidence manifests tied to exact commit, applicable baseline, tests, DB/runtime certification and residual exceptions. |
| Missing OIDC/Postgres/Vercel ADRs | **CLOSED_BY_LATER_REPOSITORY_WORK** | ADR-0013 OIDC, ADR-0014 Postgres/Neon, ADR-0015 Vercel boundary, and ADR-0016 deployment isolation now exist. |
| ADR numbering gap 0002 | **NOT A RELEASE BLOCKER** | Historical numbering gaps are not repaired by renumbering later ADRs; preserve stable identifiers. |
| `agentRef` vs Participant identity | **DECISION/TRACEABILITY QUESTION — DO NOT INVENT** | C2C-01 explicitly includes Participant plus scoped Agent/Authority attribution. Software must trace the distinction; do not collapse terms without controlled mapping. |
| Custodian counterparty consent semantics | **DECISION/TRACEABILITY QUESTION — DO NOT INVENT** | Enforce authenticated relinquishing-party boundary already implemented; do not infer consent/acceptance semantics for named counterparties without canonical support. |

## Immediate executable backlog after reconciliation

1. Extend traceability for current implemented record/transition families while preserving all historical SW0 IDs and evidence.
2. Build a release-profile manifest that identifies exact Git SHA, CBR/C2C baseline, applicable invariants/fixtures, schema/persistence certification, identity/authority certification and deployment evidence.
3. Targeted falsification for materialization and Value/delivery conservation.
4. Verify Issue #10 remaining custody semantics against C2C/CBR/SA sources; escalate only if an implementation decision would add semantics.
5. Make `check-release-evidence.mjs` release-aware without weakening SW0 historical checks.
6. Produce exact-head evidence and residual-gap report before any merge/release decision.

## Current blocker posture

No constitutional decision is required to continue the evidence/traceability/falsification tracks above. Two semantic questions remain quarantined: `agentRef`/Participant mapping and counterparty custody consent. Neither is silently resolved by this reconciliation.
