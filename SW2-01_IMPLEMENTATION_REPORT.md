# SW2-01 Implementation Report — Merchant/Cocoa Operator Shell

Release: `0.11.0-alpha.1`  
API contract: `2.0.0`  
Disposition: first Software Sprint 2 vertical slice implemented and acceptance tested; not production-ready

## Outcome

SW2-01 starts the user-facing OriginOS product. The executable service now serves a coherent Merchant/Cocoa operator workspace at its base URL instead of exposing only API endpoints. The shell provides Overview, Cocoa lots, Custody, Workflow, and System routes with a consistent responsive navigation model.

## Architecture

- `@originos/operator-web` owns operator information architecture and HTML rendering.
- The HTTP adapter accepts a structural web-app port and does not depend on the operator package.
- The service runtime composes the operator app with the existing API, authentication, audit, receipt, and persistence adapters.
- Canonical types, kernel rules, application commands, and immutable repository behavior remain independent of UI concepts.
- Full-page navigation works without client-side JavaScript, creating a resilient baseline for later interactive controls.

## Usability baseline

Every declared route includes a unique page title and heading, exactly one active navigation item, a keyboard skip link, semantic navigation, and a mobile viewport. The layout collapses from sidebar/navigation plus content into a small-screen horizontal navigation and single-column content model.

## Acceptance evidence

Focused tests prove all five routes render their declared content and navigation state, accessibility and responsive markers exist, and unknown routes are not claimed. Service integration tests fetch the real base URL and Cocoa-lot route while the complete Cocoa API workflow remains active. Full architecture, traceability, Sprint 0 evidence, type-check, regression, conformance, and build gates remain mandatory before publication.

## Honest boundary

This slice is an application shell, not a completed workflow. It does not yet collect credentials, authenticate a browser session, register cocoa lots, query live canonical records into the screen, transfer custody, or provide production content-security headers. Those capabilities must be introduced as separately tested thin slices, beginning with transactional Cocoa-lot registration in SW2-02. No production GO is asserted.
