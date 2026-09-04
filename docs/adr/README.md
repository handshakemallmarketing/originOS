# Architecture Decision Records

ADRs are implementation decisions, not canonical authority. Every ADR must include reversal and semantic-preservation tests.

> **Known gap (found during the SW1/SW2 reconciliation review, issue #6):** this table has indexed ADRs 0002 and 0004–0012 as decided since at least SW0, but no corresponding file for any of them exists under `docs/adr/`. Only 0001, 0003, and the newly-added 0013–0015 below have files. Backfilling 0002/0004–0012 needs the people who made those decisions, not a reconstruction from code — they are left as index-only entries rather than fabricated.

| ADR | Decision | Status |
|---|---|---|
| 0001 | TypeScript and Node reference kernel | Accepted for Sprint 0 |
| 0002 | pnpm modular monorepo | Accepted for Sprint 0 — *no file* |
| 0003 | Pure transition functions | Accepted |
| 0004 | JSON Schema 2020-12 runtime contract | Proposed — *no file* |
| 0005 | Immutable append/version repository semantics | Accepted — *no file* |
| 0006 | In-memory conformance before PostgreSQL | Accepted — *no file* |
| 0007 | Explicit status unions; untyped null prohibited | Accepted — *no file* |
| 0008 | Deterministic fixture runner | Accepted — *no file* |
| 0009 | No HTTP/API in Sprint 0 | Accepted — *no file* |
| 0010 | Traceability manifest adjacent to code/tests | Proposed — *no file* |
| 0011 | UTC instants and explicit intervals | Proposed — *no file* |
| 0012 | Authentication does not define Authority | Accepted — *no file* |
| 0013 | OIDC bearer authentication for the Vercel runtime | Accepted |
| 0014 | PostgreSQL/Neon as the serverless persistence path | Accepted |
| 0015 | Vercel serverless entry point as a thin re-export | Accepted |
