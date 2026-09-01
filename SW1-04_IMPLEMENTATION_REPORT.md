# SW1-04 Implementation Report

Release: `0.5.0-alpha.1`  
Status: complete for the bounded executable service and Cocoa API acceptance increment; not production authorization

## Outcome

SW1-04 turns the previously verified OriginOS packages into one executable, restart-safe reference service. The runtime only composes existing ports and adapters: it does not redefine canonical identity, command meaning, Authority, Agency, provenance, Transformation, Outcome, Consequence, or Value.

## Runtime contract

| Setting | Default | Rule |
|---|---:|---|
| `ORIGINOS_HOST` | `127.0.0.1` | Explicit host passed to the Node listener |
| `ORIGINOS_PORT` | `3000` | Integer from 0 through 65535; 0 is permitted for ephemeral test binding |
| `ORIGINOS_DATA_DIR` | `./data/originos` | Resolved to an absolute directory containing canonical and receipt files |

`pnpm start:service` builds the workspace and starts the compiled runtime. Startup emits one structured JSON event. `SIGINT` and `SIGTERM` initiate an idempotent listener close and set the process exit status from the close result.

## Composition

The runtime wires:

1. `JsonFileCanonicalRepository`;
2. `OriginApplication`;
3. `JsonCommandReceiptStore`;
4. the replaceable Node HTTP adapter.

Canonical records and operational command receipts remain physically separate files. The default loopback bind avoids accidental network exposure.

## End-to-end acceptance evidence

The service acceptance harness starts a real listener on an ephemeral port and drives all eight Cocoa workflow commands over HTTP:

- register the Cocoa lot;
- transfer custody;
- compare candidates;
- record the Merchant decision;
- attribute the authorized Act;
- record Transformation and completion;
- record Outcome and Consequence;
- record Value status.

Acceptance requires the exact 11-record canonical type sequence established in SW1-01. The harness then closes the service, restarts it from the same data directory, verifies all 11 records, replays the first command, and proves the record count remains 11.

Configuration rejection tests cover malformed and out-of-range ports. Existing SW1-03 crash recovery, SW1-02 HTTP idempotency, SW1-01 persistence, and Sprint 0 conformance gates remain mandatory.

The release smoke test starts the bundled JavaScript service as an actual Node process on an ephemeral port and confirms clean `SIGINT` shutdown. This guards against source-only workspace exports producing a package that tests successfully but cannot execute after build.

## Explicit exclusions

This service is not production-ready. Authentication, authorization infrastructure, TLS, public ingress, rate limiting, telemetry backends, containers, orchestration, distributed coordination, database adapters, backups, marketplace, accounting, CRM, workflow design, optimization, and AI-platform features remain outside SW1-04.
