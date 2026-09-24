# OriginOS Release Evidence Modernization Plan — 2026-09-16

## Purpose

Modernize release evidence without rewriting or weakening the historical SW0-RC2 certification bundle.

## Verified current condition

- `scripts/check-release-evidence.mjs` is hard-coded to `evidence/sw0-rc2/` and validates the historical SW0-RC2 designation, 15/15 conformance fixtures, 20/20 invariants, 14/14 canonical errors, round-trip evidence, zero hidden waivers, and fixed review findings.
- `evidence/` currently contains only `sw0-rc1/` and `sw0-rc2/`.
- Therefore the current checker is a valid historical SW0 certification gate, but it is not sufficient by itself to certify the implemented post-SW0 release state.

## Decision

Use an additive evidence architecture.

1. Preserve `evidence/sw0-rc1/` and `evidence/sw0-rc2/` unchanged as historical evidence.
2. Preserve all existing SW0 assertions in `check-release-evidence.mjs`; do not weaken counts, remove invariants, remove canonical-error checks, or convert failures into warnings.
3. Add a new current-release evidence bundle rather than relabeling SW0 evidence.
4. Bind the new bundle to an exact Git commit SHA and the controlled constitutional/reconciliation baseline applicable to that release candidate.
5. Require explicit traceability for implemented SW1/SW2 capabilities and targeted falsification evidence for conservation, custody/authority, persistence, identity, and deployment boundaries where applicable.
6. Keep unresolved `agentRef`/Participant equivalence and counterparty custody-consent semantics quarantined. Evidence must not assert semantics not established by the controlled corpus.

## Planned bundle

Target directory: `evidence/current-release/`

Minimum artifacts before release recommendation:

- `release-manifest.json` — exact candidate SHA, branch, productionRelease=false until separately authorized, applicable controlled corpus references.
- `traceability-results.json` — SW0/SW1/SW2 requirement-to-code/test/evidence mapping results.
- `conservation-falsification.json` — materialization and Value/delivery conservation adversarial results.
- `custody-authority-falsification.json` — only corpus-supported custody/authority assertions; unresolved semantics explicitly quarantined.
- `persistence-certification.json` — exact-head PostgreSQL transaction/durability certification.
- `identity-certification.json` — exact-head OIDC/authority boundary certification.
- `deployment-certification.json` — exact-head serverless/deployment boundary evidence.
- `residual-gaps.json` — CLOSED / ACCEPTED / DECISION_REQUIRED classifications with evidence.
- `independent-review.json` — final independent conformance review.
- `go-no-go.md` — bounded release recommendation; never constitutes production activation authorization.

## Checker migration sequence

1. Extend traceability first; do not manufacture release evidence before the mapping exists.
2. Add current-release bundle schema/checks alongside the historical SW0 checks.
3. Run targeted falsification and populate only evidence actually produced by tests/runtime verification.
4. Run exact-head CI and certification.
5. Produce residual-gap register and independent review.
6. Only then produce a release recommendation.

## Safety constraints

- No production activation.
- No weakening of existing invariants or historical evidence gates.
- No destructive production actions.
- No invented constitutional semantics.
- Any required architecture change, invariant weakening, or unresolved semantic assertion is a decision point and must be escalated.
