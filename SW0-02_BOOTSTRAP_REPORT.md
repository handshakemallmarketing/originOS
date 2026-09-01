# SW0-02 Bootstrap Report

Status: **COMPLETE — DELIBERATE RED STATE**

## Verified scaffold controls

- pnpm lockfile and approved `esbuild` build dependency are present.
- Eight-workspace monorepo resolves; seven TypeScript packages type-check.
- Kernel dependency-boundary check passes.
- Traceability check maps 15/15 controlled fixtures.
- Canonical identity, envelope, status algebra, six-family registry, and 15 canonical error codes (including the temporary SW0-02 not-implemented code) compile.
- Repository, invariant, kernel, schema, conformance, and CLI boundaries exist.

## Red conformance evidence

- Harness control: 1 passing test confirms the exact fixture IDs.
- Domain cases: 15 failing tests.
- Failure reason for every case: `C2C_E015_NOT_IMPLEMENTED` from the kernel command boundary.
- No fixture assertion was weakened, skipped, marked todo, or granted a semantic waiver.

## Intentionally absent

- Domain transition behavior
- Invariant implementations
- In-memory persistence behavior
- PostgreSQL adapter
- HTTP/API or UI
- Production authentication, deployment, or operations

Next authorized slice: SW0-03 canonical foundation and in-memory version repository, followed by incremental fixture closure.
