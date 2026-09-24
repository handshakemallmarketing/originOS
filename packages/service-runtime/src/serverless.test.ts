import { describe, expect, it } from "vitest";
import { loadServerlessConfig } from "./serverless.js";

describe("RC6 Vercel serverless configuration", () => {
  it("requires OIDC and PostgreSQL without accepting local fallback state", () => {
    expect(() => loadServerlessConfig({ ORIGINOS_AUTH_MODE: "static", ORIGINOS_DATABASE_URL: "postgres://db" })).toThrow(/requires.*oidc/i);
    expect(() => loadServerlessConfig({ ORIGINOS_AUTH_MODE: "oidc" })).toThrow(/ORIGINOS_DATABASE_URL/);
  });

  it("loads the bounded production configuration", () => {
    expect(loadServerlessConfig({ ORIGINOS_AUTH_MODE: "oidc", ORIGINOS_DATABASE_URL: "postgres://db", ORIGINOS_OIDC_ISSUER: "https://id.example", ORIGINOS_OIDC_AUDIENCE: "originos", ORIGINOS_OIDC_JWKS_URI: "https://id.example/jwks", ORIGINOS_OIDC_CLIENT_ID: "web-client" })).toEqual({
      databaseUrl: "postgres://db", issuer: "https://id.example", audience: "originos", jwksUri: "https://id.example/jwks", clientId: "web-client", agentRefsClaim: "originos_agent_refs", requiredScope: "originos:commands"
    });
  });

  it("loads optional Agency/Authority/Custodian claim overrides when declared", () => {
    expect(loadServerlessConfig({ ORIGINOS_AUTH_MODE: "oidc", ORIGINOS_DATABASE_URL: "postgres://db", ORIGINOS_OIDC_ISSUER: "https://id.example", ORIGINOS_OIDC_AUDIENCE: "originos", ORIGINOS_OIDC_JWKS_URI: "https://id.example/jwks", ORIGINOS_OIDC_CLIENT_ID: "web-client", ORIGINOS_OIDC_AGENCY_REFS_CLAIM: "custom_agency_refs", ORIGINOS_OIDC_AUTHORITY_REFS_CLAIM: "custom_authority_refs", ORIGINOS_OIDC_CUSTODIAN_REFS_CLAIM: "custom_custodian_refs" })).toEqual({
      databaseUrl: "postgres://db", issuer: "https://id.example", audience: "originos", jwksUri: "https://id.example/jwks", clientId: "web-client", agentRefsClaim: "originos_agent_refs", requiredScope: "originos:commands",
      agencyRefsClaim: "custom_agency_refs", authorityRefsClaim: "custom_authority_refs", custodianRefsClaim: "custom_custodian_refs"
    });
  });
});
