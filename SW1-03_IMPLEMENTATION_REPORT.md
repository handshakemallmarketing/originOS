# SW1-03 Implementation Report

Release: `0.4.0-alpha.1`  
Status: complete for bounded single-process transactional recovery; not production authorization

## Outcome

SW1-03 closes the failure window identified in SW1-02 for the replaceable JSON-file alpha. A command now writes a durable pending receipt before application execution, commits every record produced by one kernel transition as one atomic repository batch, and converts the receipt to committed after the application result returns.

If execution stops after the canonical batch is committed but before its receipt is committed, the next identical request finds the pending receipt. The application reconstructs the command's created record set from durable command attribution, returns it without adding canonical versions, and completes the receipt.

## Delivered controls

- `CanonicalRepository.appendMany` provides all-or-nothing batch validation and commit.
- The file repository stages the complete canonical bundle and atomically renames it before replacing in-memory state.
- Every newly created record carries its application `commandId` inside `commandContext`.
- Application execution detects a previously completed command and returns its attributed records without re-running the kernel transition.
- Receipt states are explicit: `pending` and `committed`.
- A changed payload under either state remains `C2C_E009_CONFLICT_UNRESOLVED`.

## Acceptance evidence

Automated tests prove:

1. an invalid in-memory batch commits none of its valid prefix;
2. an invalid file-backed batch persists no valid prefix;
3. a simulated stop after a three-record canonical outcome but before receipt commit leaves all three canonical records and a pending receipt;
4. a process-like restart recovers that pending command, commits the receipt, and leaves exactly three records—no loss and no duplicate;
5. existing restart replay, conflict, command-envelope, Merchant/Cocoa, Sprint 0 conformance, invariant, traceability, and canonical error tests remain green.

## Architectural boundary

Pending receipts and recovery are operational adapter/application mechanisms, not canonical ontology. Canonical identity, immutable version history, provenance, Agent, Agency, Authority, Purpose, Transformation, Outcome, Consequence, and Value distinctions remain unchanged.

## Explicit exclusions

This increment does not claim distributed transactions, multi-process coordination, database isolation, cross-service exactly-once delivery, authentication, deployment readiness, marketplace, accounting, CRM, workflow design, optimization, or AI-platform behavior. Those require later adapters and acceptance criteria; they may not be inferred from this single-process JSON reference implementation.
