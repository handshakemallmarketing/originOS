# SW1-05 Implementation Report

Release: `0.6.0-alpha.1`  
API contract: `1.0.0`  
Status: complete for bounded API schema and compatibility hardening; not production authorization

## Outcome

SW1-05 replaces structural TypeScript casting at the HTTP boundary with deterministic runtime validation. Invalid JSON structures are rejected before the idempotency receipt store or canonical repository can be changed. The same contract is published as OpenAPI 3.1 at `GET /openapi.json`.

The API schema describes transport structure only. It does not define or amend canonical identity, Authority, Agency, provenance, Transformation, Outcome, Consequence, Value, or immutable history.

## API v1 guarantees

- Command envelopes require non-empty `commandId`, Agent, Agency, Authority, Purpose, evidence, and attribution fields.
- `targetTransformationRef` is optional but cannot be empty when supplied.
- Evidence must contain at least one non-empty reference.
- Unknown envelope, command, and payload properties are rejected.
- Each of the 15 supported command types has its own required, optional, and typed payload fields.
- `Content-Type: application/json` is mandatory for commands; incompatible media receives HTTP 415.
- Validation failures receive `C2C_E001_TYPE_MISMATCH` with deterministic JSON-path issues.
- Validation occurs before request digesting or receipt creation.
- Every JSON response carries `X-OriginOS-API-Version: 1.0.0`.

## Machine-readable contract

The OpenAPI document includes:

- all command and query routes;
- the required idempotency header;
- command-specific `oneOf` payload schemas;
- strict `additionalProperties: false` boundaries;
- expected success, validation, conflict, media-type, and not-found responses.

The contract description explicitly states that C2C-01 and the application/kernel remain authoritative for meaning.

## Compatibility policy and evidence

API v1 remains on `/v1`. A breaking request-shape change requires a new major API contract and route rather than silently changing v1. Additive changes require explicit schema, documentation, and compatibility-test updates.

Tests pin the serialized OpenAPI SHA-256 fingerprint at:

`e9829eb47b0ace47ddb42fa9b3fd6dc41ffffc7fb58615d196baa2ce04dcacdb`

Additional tests prove acceptance of a conforming envelope; deterministic rejection of unknown and mistyped fields; publication of the OpenAPI document and version header; HTTP 415 handling; zero canonical effects from invalid requests; and continued acceptance of the complete 11-record Cocoa service workflow.

All prior crash recovery, atomic batch, idempotency, persistence, conformance, invariant, canonical error, traceability, build, and clean-install gates remain mandatory.

## Explicit exclusions

API validation is not authentication or authorization enforcement. TLS, identity-provider integration, public ingress, rate limiting, database adapters, distributed coordination, generated client SDKs, marketplace, accounting, CRM, workflow design, optimization, and AI-platform behavior remain outside SW1-05.
