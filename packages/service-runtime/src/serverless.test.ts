import { describe, expect, it } from "vitest";
import { loadServerlessConfig } from "./serverless.js";

describe("RC6 Vercel serverless configuration", () => {
  it("requires OIDC and PostgreSQL without accepting local fallback state", () => {
    expect(() => loadServerlessConfig({ ORIGINOS_AUTH_MODE: "static", ORIGINOS_DATABASE_URL: "postgres://db" })).toThrow(/requires.*oidc/i);
    expect(() => loadServerlessConfig({ ORIGINOS_AUTH_MODE: "oidc" })).toThrow(/ORIGINOS_DATABASE_URL/);
  });

  it("loads the bounded production configuration", () => {
    expect(loadServerlessConfig({ ORIGINOS_AUTH_MODE: "oidc", ORIGINOS_DATABASE_URL: "postgres://db", ORIGINOS_OIDC_ISSUER: "https://id.example", ORIGINOS_OIDC_AUDIENCE: "originos", ORIGINOS_OIDC_JWKS_URI: "https://id.example/jwks" })).toEqual({
      databaseUrl: "postgres://db", issuer: "https://id.example", audience: "originos", jwksUri: "https://id.example/jwks", agentRefsClaim: "originos_agent_refs", requiredScope: "originos:commands"
    });
  });
});
