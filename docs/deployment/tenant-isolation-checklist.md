# Deployment isolation certification checklist

Companion to ADR-0016 (`docs/adr/0016-deployment-isolated-multi-tenancy.md`). OriginOS achieves customer-organization isolation through **physical deployment separation**, not in-app row-level scoping. `GET /v2/records`, `.current()`, and `.history()` return every canonical record visible to the database they're pointed at, with no tenant filter — that is only safe when the checklist below holds.

A deployment is **not** certified for production use by more than one organization until every item below is confirmed true for it.

## 1. Database

- [ ] The Postgres/Neon database backing this deployment holds canonical records for **exactly one** customer organization. It has never been shared with, migrated from, or restored into a database used by another organization.
- [ ] No cross-deployment replication, shared read replica, or shared connection pool exposes this database's rows to another deployment's application code.
- [ ] Database credentials (`DATABASE_URL` or equivalent) are unique to this deployment and not reused across environments/organizations.

## 2. Identity provider

- [ ] The OIDC issuer/tenant configured for this deployment (`OidcJwtAuthenticator` issuer + audience, `packages/auth/src/index.ts`) issues tokens only to operators of this organization. A shared identity-provider tenant serving multiple customer organizations against the same OriginOS deployment violates this model.
- [ ] `originos_agent_refs` (and, where configured, `originos_agency_refs` / `originos_authority_refs` — see below) claims issued by this tenant are scoped to Agents/Agencies/Authorities belonging to this organization.

## 3. Agency/Authority binding (independent of isolation model — fixes issue #3's secondary finding)

- [ ] If this deployment's principals should be restricted to specific Agencies or Authorities (beyond Agent binding), the identity provider issues `originos_agency_refs`/`originos_authority_refs` claims (OIDC) or the static auth config sets `permittedAgencyRefs`/`permittedAuthorityRefs` (`StaticApiKeyAuthenticator`). Leaving these unset is a valid choice for a single-organization deployment where every bound Agent may legitimately act for any Agency/Authority in the envelope — but it should be a deliberate choice, not an oversight.

## 4. Deployment configuration

- [ ] `ORIGINOS_AUTH_MODE=oidc` in production (per `SW2_RC5_OIDC_IDENTITY_REPORT.md`) — static API keys are a local-development mode only.
- [ ] This deployment's URL/domain is not documented or marketed as a shared/multi-organization endpoint.
- [ ] Any planned expansion to serve a second organization is provisioned as a **new** deployment + database + identity-provider tenant, never as an additional principal against this one.

## 5. Verification

- [ ] `GET /v2/records` was exercised with a valid token for this organization and confirmed to return only records this organization's commands created (trivially true for a freshly provisioned database; re-confirm after any data migration or restore).
- [ ] No superseded/legacy database snapshot containing another organization's records is reachable from this deployment's connection string.

## Escalation

If any item above cannot be checked, this deployment must not be represented as production-ready for that organization. Do not work around this checklist by adding ad hoc tenant-filtering code outside the model in ADR-0016 — if a genuine shared-deployment need exists, it requires the canonical-admission path described there, not a local patch.
