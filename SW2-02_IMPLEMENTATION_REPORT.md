# SW2-02 Implementation Report — Transactional Cocoa-Lot Registration

Release: `0.12.0-alpha.1`  
API contract: `2.0.0`  
Disposition: first operator transaction implemented and acceptance tested; not production-ready

## Outcome

SW2-02 turns the Cocoa Lots route into an executable vertical slice. A merchant operator can enter a cocoa lot, submit the canonical `registerCocoaLot` command through the existing authenticated and idempotent API boundary, and see material lots reloaded from canonical persistence after success.

## End-to-end path

1. The browser validates required fields, the lot-reference pattern, and a positive numeric quantity.
2. The form maps its values to one API v2 application command envelope.
3. `commandId` and `Idempotency-Key` are deterministically set to `operator-<lotId>`.
4. API v2 authenticates the key, verifies Agent binding, validates the envelope, and executes the application command.
5. The configured JSON or PostgreSQL adapter commits the canonical material lot and command receipt under its established transaction boundary.
6. The page queries authenticated records and renders persisted material lots using DOM text nodes.

## Credential and rendering boundary

The operator API key exists only in the active page's JavaScript variable. OriginOS does not place it in HTML, URLs, local storage, session storage, or canonical records. The password field is cleared after a successful transaction. Persisted values are rendered with `textContent`, not HTML interpolation.

This design deliberately avoids inventing a durable browser-session system inside a lot-registration slice. Page navigation or reload discards the credential and requires re-entry.

## Acceptance evidence

Focused operator tests verify every form field, credential autocomplete semantics, API command and record-query wiring, absence of browser storage calls, and exact form-to-command mapping. The service integration test uses that same mapping, submits it through the real HTTP boundary, then reads the canonical material-lot identity and confirms quantity and custody persisted. Restart tests confirm the new lot remains present alongside the complete Cocoa workflow.

The complete architecture, traceability, Sprint 0 evidence, type-check, regression, conformance, clean-install, and build gates remain mandatory before publication.

## Honest boundary

This alpha UI uses an operational API key, not OAuth/OIDC or a managed browser session. It has no account recovery, automatic rotation, role-management interface, CSRF-bearing cookie session, rate limiting, or production content-security policy. It registers and lists lots only; editing, custody transfer, pagination, search, and workflow progression remain future tested slices. No production GO is asserted.
