# ADR-0013: OIDC bearer authentication for the Vercel runtime

Status: Accepted (Vercel/serverless runtime only — the non-serverless service-runtime entry point retains `StaticApiKeyAuthenticator` as an alternative `RequestAuthenticator` implementation).

Decision: `packages/service-runtime/src/serverless.ts` requires `ORIGINOS_AUTH_MODE=oidc` and authenticates every `/v2/*` request with `OidcJwtAuthenticator` (`packages/auth/src/index.ts`) — RS256 JWT verification against a configured issuer, audience, and remote JWKS, with a required scope and an `originos_agent_refs` claim mapped to `AuthenticatedPrincipal.permittedAgentRefs`.

Consequences: A principal's write authority is scoped to `permittedAgentRefs`, checked against `envelope.agentRef` at the transport layer (`packages/transport-http/src/index.ts`). No other field in a command envelope (`agencyRef`, `authorityRef`, `custodianRef`, etc.) is derived from or checked against the authenticated token — see the open cross-tenant read-scoping question tracked separately (issue #3) and the `agentRef`-vs-`Participant` identity question raised in issue #6. `packages/operator-web/src/auth.ts` implements the browser-side authorization-code-with-PKCE flow against the same issuer/audience/client, with no client secret ever present in served code.

Reversal: Swap `RequestAuthenticator` implementations behind the existing port; `StaticApiKeyAuthenticator` already demonstrates this is possible without changing `transport-http` or the kernel.
