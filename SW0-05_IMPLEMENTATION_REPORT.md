# SW0-05 Implementation Report

Status: **COMPLETE — AUTHORITY/ACTION BOUNDARY GREEN**

## Implemented

- Delegation and act canonical content foundations.
- Delegation scope enforcement: requested Authority cannot exceed delegator Authority.
- Attributable act creation without automatic Transformation, completion, or Outcome.
- Collective-attribution invariant: an enterprise cannot be treated as Agent without an explicit rule.

## Evidence

- Build, type checks, package boundaries, and traceability pass.
- Kernel tests: 7/7 pass; invariant tests: 3/3 pass.
- Conformance: 12 passing tests (control + 11 fixtures), 4 intentionally red fixtures.
- Newly green: S0-M04, S0-M05, S0-X03.

## Intentionally red

S0-C01, S0-C03, S0-C04, and S0-C05. These require Transformation occurrence, initiation/interruption/completion, Outcome/Consequence, and Value-status behavior.

Next authorized slice: SW0-06 — Transformation and realization, targeting the final four fixtures.
