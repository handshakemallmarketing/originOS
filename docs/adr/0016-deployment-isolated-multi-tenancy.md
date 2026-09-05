# ADR-0016: Physical deployment isolation as the multi-tenancy boundary

Status: Accepted

Context: Issue #3 found that `GET /v2/records`, `.current()`, and `.history()` (`packages/application/src/index.ts`, `packages/repository-postgres/src/index.ts`) have no tenant/organization scoping at any layer — any authenticated principal can read every canonical record in the database. The canonical domain model has no "Tenant" concept; the only identity-bearing envelope fields are `agentRef`/`agencyRef`/`authorityRef`, which are free-form strings supplied by the command's own payload rather than derived from a trusted claim.

Decision: Customer-organization isolation is achieved by **physical deployment separation** — one Vercel deployment, one Neon/PostgreSQL database, and one Auth0 (or equivalent OIDC) tenant per customer organization — not by an in-app "Tenant" primitive or row-level scoping. A single deployment/database is certified for exactly one organization's data.

Rationale:
- The canonical domain model (`Participant`, `Material`, `Location`, `Transformation`, `Purpose` — AM-001/AM-002) has no admitted "Tenant" primitive. Introducing one is a constitutional-canon decision under Article II/III of the Discovery Programme Constitution (Discovery Method: observation, elimination analysis, Merchant/Cocoa Test, cross-domain validation), not a routine schema change, and should not be improvised under pressure from an open security issue.
- The domain already requires legitimate cross-organization visibility *within* one supply chain: a single cocoa lot's canonical records are touched by a farm, a warehouse, a processor, and a merchant in turn — distinct real-world organizations that must see overlapping records for the same lot. A hard per-organization row filter would need to be lineage/party-scoped rather than a simple tenant wall to avoid breaking that, which is a materially harder and easier-to-get-wrong access-control design than physical isolation.
- Physical isolation requires no canonical or application code changes, gives a structural isolation guarantee that cannot regress via a missed `WHERE` clause or a forgotten scope check, and matches what `SW2_RC5_OIDC_IDENTITY_REPORT.md` already assumed about environment-level tenant provisioning being an operational responsibility.
- It is reversible: if a genuine shared-multi-organization product need is validated later (e.g. an explicit cross-organization network/marketplace), an in-app "Tenant" or "Network" concept can go through canonical admission then, informed by real requirements rather than an emergency patch.

Consequences:
- Operations must certify, before any production declaration, that each deployment's database is provisioned for exactly one organization (see `docs/deployment/tenant-isolation-checklist.md`).
- `GET /v2/records` and friends remaining unscoped-by-tenant is *intentional* under this model, not a residual defect — there is exactly one tenant per deployment to scope against.
- This does **not** resolve the separate, deployment-independent gap that `agencyRef`/`authorityRef` are unchecked against the authenticated principal's trusted bindings (misattribution within a single organization). That is fixed independently by `AuthenticatedPrincipal.permittedAgencyRefs`/`permittedAuthorityRefs` (`packages/auth/src/index.ts`) enforced in `packages/transport-http/src/index.ts`.
- `custodianRef` and other payload-level identity fields are out of scope for this ADR; they require per-command-type validation in the kernel/application layer and are tracked separately.

Reversal: If shared-multi-organization deployment is later required, this ADR is superseded by one admitting a canonical scoping concept and threading it through `RequestAuthenticator` → `AuthenticatedPrincipal` → `OriginApplication.all/current/history` → repository queries, with negative cross-organization tests added at that time.
