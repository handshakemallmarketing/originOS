# SW2 RC5 — OIDC Identity and Agent Binding

Release: `0.17.0-rc.5`

## Decision

The production authentication gap identified after RC4 is closed at the HTTP service boundary. Production configuration now requires OIDC JWT authentication; static API keys remain an explicit local-development mode and are rejected under `NODE_ENV=production`.

## Implemented controls

- RS256 signature verification against an HTTPS JWKS endpoint.
- Exact issuer and audience verification.
- Required subject, issued-at, and expiry claims, with 30 seconds clock tolerance and a 15-minute maximum token age.
- Required `originos:commands` scope.
- Required signed `originos_agent_refs` bindings; the transport still rejects a command whose declared Agent is not in that list.
- Generic Bearer-token failures that do not disclose token-validation details or token material.
- Explicit `ORIGINOS_AUTH_MODE=oidc|static`; production refuses static mode.

## Verification

Focused tests cover accepted signed tokens, wrong audience, missing scope, missing Agent binding, malformed tokens, non-HTTPS JWKS configuration, bounded runtime configuration, and the retained end-to-end static-development workflow. The full repository quality gate remains the release acceptance gate.

## Boundary statement

Authentication establishes an operational principal and its permitted Agent declarations. It does not create or infer canonical Agent, Agency, Authority, Purpose, evidence, attribution, or enterprise truth. Those remain application and kernel concerns.

## Remaining production work

Identity-provider tenant provisioning, claim issuance policy, operator lifecycle administration, TLS ingress, incident response, and deployment monitoring are environment responsibilities and must be certified before a production declaration.
