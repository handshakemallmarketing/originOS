# SW1-06 Implementation Report

Release: `0.7.0-alpha.1`  
API contract: `1.0.0`  
Status: complete for bounded single-process operational integrity and recovery; not production authorization

## Outcome

SW1-06 adds operational safeguards around the executable OriginOS reference service:

- startup and readiness integrity checks;
- hash-chained structured audit entries;
- an exclusive data-directory service lock;
- verified offline backup;
- staged whole-directory restore with a preserved rollback copy;
- executable check, backup, and restore commands.

These are operational mechanisms. Audit entries and backup manifests are not canonical records, provenance, or substitutes for immutable semantic history.

## Integrity and readiness

`GET /ready` verifies three independently managed files:

| Check | Verification |
|---|---|
| Canonical store | Bundle envelope, record completeness, identity/history serialization importability |
| Command receipts | File version, unique keys, SHA-256 digest shape, pending/committed state, committed response status |
| Audit log | JSONL parsing, sequence continuity, previous-hash linkage, entry SHA-256 |

Missing files are valid for an uninitialized service. Existing corrupt files fail startup. Runtime readiness returns HTTP 503 when a managed file fails verification. `/health` remains liveness-only.

Legacy SW1-02 committed receipts without an explicit state are accepted as committed and normalized in memory, preserving upgrade compatibility.

## Tamper-evident audit trail

Each command request produces an append-only JSONL entry containing:

- sequence and timestamp;
- previous-entry hash and current hash;
- command identity and type when structurally available;
- HTTP status, replay state, and bounded outcome label.

Payloads, evidence contents, canonical records, and receipt response bodies are excluded. Each command response reports `X-OriginOS-Audit: recorded`, `failed`, or `not-configured`. The audit trail detects mutation; it does not claim external notarization or canonical truth.

## Offline backup and restore

The service owns `service.lock` while running. A second service, backup, or restore against the same active directory is rejected. Stale locks from inactive processes are removed.

Backup first runs integrity checks, then writes an atomic JSON backup containing each managed file, byte count, and SHA-256. Restore verifies the envelope and every file hash, writes and verifies a staging directory, renames the existing directory to a unique rollback path, and atomically renames the stage into place. The rollback directory is returned and is not deleted automatically.

Commands:

```bash
pnpm ops check DATA_DIR
pnpm ops backup DATA_DIR BACKUP_PATH
pnpm ops restore BACKUP_PATH DATA_DIR
```

## Acceptance evidence

Automated tests prove:

1. two-entry audit-chain verification and tamper detection;
2. active-lock rejection of second service startup and backup;
3. canonical, receipt, and audit integrity reporting;
4. backup content hashing and tampered-backup rejection;
5. preservation of corrupt pre-restore data in the rollback directory;
6. full eight-command Cocoa execution yielding 11 canonical records and eight audit entries;
7. deliberate canonical corruption blocking startup;
8. verified restore, restart, idempotent replay, and an unchanged 11-record canonical set;
9. absence of Cocoa request payload details from the audit log;
10. continued passage of every prior conformance, invariant, traceability, API, crash-recovery, build, and clean-install gate.

The additive `/ready` API contract changes the pinned OpenAPI fingerprint to:

`6fe3d71a2b9f4f723d5cffbc8a7bb5e417e3fbffae71d95091d4d98a0658b08c`

## Explicit exclusions

This increment does not provide remote backup storage, encryption key management, external audit notarization, multi-host locking, database transactions, automated retention, authentication, TLS, public deployment, or production disaster-recovery guarantees. Marketplace, accounting, CRM, workflow design, optimization, and AI-platform features remain outside scope.
