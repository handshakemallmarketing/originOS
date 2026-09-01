# SW2-03 Implementation Report — Conserved Cocoa Custody Transfer

Release: `0.13.0-alpha.1`  
API contract: `2.0.0`  
Disposition: selected-lot custody transfer implemented and acceptance tested; not production-ready

## Outcome

SW2-03 makes custody operational without weakening conservation. An authenticated operator loads persisted cocoa lots, selects one, reviews its derived current custodian and complete measured quantity, names a distinct receiving custodian, and records a canonical custody event through API v2.

## Kernel integrity upgrade

Before creating a custody event, the kernel now proves:

- the referenced canonical material lot exists;
- its registered quantity is positive and finite;
- the declared sender equals the current custodian;
- the receiver is a distinct custodian; and
- the transfer quantity exactly equals the lot's measured quantity.

Current custody is derived from the original material-lot custodian followed by ordered custody-transfer events for that lot. Once a handoff succeeds, the former custodian cannot submit another valid transfer. This slice deliberately supports whole-lot custody transfer; splitting and merging require explicit future lineage semantics.

## Operator path

The Custody screen keeps the API key in active page memory only. It queries authenticated canonical records, populates the lot selector, derives read-only quantity and sender fields, submits a deterministic `transferCustody` command, and reloads custody history. Persisted identifiers and values are rendered with DOM text nodes rather than HTML interpolation.

## Acceptance evidence

Four focused kernel tests cover positive lot quantity, absent-lot rejection, sender and quantity enforcement, successful current-custodian handoff, stale-custodian rejection, and a valid subsequent handoff. Operator tests verify exact form-to-command mapping, the selected-lot controls, API wiring, and absence of browser credential storage. The service integration test registers a lot through the SW2-02 contract, transfers it through the SW2-03 contract, and reads the resulting custody event back from canonical persistence before restart verification.

The complete architecture, traceability, Sprint 0 evidence, type-check, regression, conformance, clean-install, and build gates remain mandatory before publication.

## Honest boundary

This release supports complete-lot transfers only. It does not yet model partial-lot splitting, lot merging, custody acceptance signatures, document uploads, geolocation, offline synchronization, revocation, disputes, or production browser sessions. Audit remains metadata-only and no production GO is asserted.
