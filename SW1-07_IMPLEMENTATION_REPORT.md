# SW1-07 Implementation Report — Authenticated Principal/Agent Binding

Release: `0.8.0-alpha.1`  
API contract: `2.0.0`  
Disposition: implemented and acceptance tested; not production-ready

## Outcome

SW1-07 adds a mandatory operational authentication boundary to the executable service. Static Bearer API keys are compared through SHA-256 hashes held in a strict external configuration file. Plaintext keys are not stored by OriginOS.

Authenticated principal identity is deliberately separate from canonical semantics. A principal may submit a command only when the command's declared `agentRef` appears in that principal's explicit binding. This check neither creates nor grants Agent, Agency, Authority, Purpose, evidence, or attribution. Canonical Authority continues to be evaluated by the application/kernel.

## Delivered

- New replaceable `@originos/auth` package and `RequestAuthenticator` port.
- Strict versioned auth configuration with unique principal and key-hash identities.
- Constant-time comparison of supplied and configured API-key hashes.
- Mandatory authentication for all `/v2` routes.
- Pre-persistence principal-to-Agent binding for command submission.
- Public `/health`, `/ready`, and `/openapi.json` operational endpoints.
- API `2.0.0` OpenAPI bearer scheme and compatibility fingerprint.
- Audit metadata containing principal identity and outcome, never credentials or payloads.
- Runtime fail-fast behavior for missing, unreadable, or malformed auth configuration.

## Compatibility decision

Mandatory authentication changes the caller contract. In accordance with SW1-05, the HTTP API advances from `/v1` to `/v2` rather than silently changing v1. The retired `/v1` paths return the ordinary route-not-present response.

## Acceptance evidence

Tests verify valid, invalid, and missing credentials; strict config rejection; successful bound-Agent submission; denied unbound-Agent submission with zero canonical effects; authenticated queries; idempotent recovery; Cocoa workflow restart persistence; and absence of plaintext credentials from audit output.

## Explicit exclusions

No TLS termination, OAuth/OIDC, key-rotation service, user lifecycle, role hierarchy, distributed session management, rate limiting, or production authorization claim is included. Deployment must provide transport security and secret lifecycle controls before external use.
