# SW2-04 implementation report — atomic cocoa processing initiation

Release: `0.14.0-alpha.1`

## Accepted capability

The operator Workflow route now initiates cocoa processing from a selected persisted lot. It derives the current processor from canonical custody history and submits one authenticated `initiateCocoaProcessing` command. The kernel creates three semantically distinct but transactionally atomic records:

- a merchant Decision committing the lot to processing;
- an authorized, attributable Act linked to that Decision; and
- an initiated Transformation linked to the Act, lot, processor, and Agency.

## Integrity controls

- The material lot must exist.
- The declared processor must be the current custodian derived from ordered custody transfers.
- Agent, Agency, and Authority must be explicit.
- A lot cannot acquire a second initiated processing Transformation.
- All three records pass through the application's single `appendMany` boundary, so none is persisted if the batch fails.
- The browser API key remains in page memory and is not written to browser storage.

## Verification

Focused tests cover absent lots, invalid custody, atomic linked records, duplicate initiation, exact UI command mapping, and HTTP persistence. The full workspace check and build, followed by the same check and build from a clean source archive, are release gates.

## Explicit boundary

SW2-04 proves processing initiation, not processing completion or value realization. Completion, Outcome, Consequence, and Value status remain future independently testable slices. Whole-lot custody remains the current material model; partial lots and production identity/authorization are not claimed.
