import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { hashApiKey, OidcJwtAuthenticator, StaticApiKeyAuthenticator } from "./index.js";
const configFile = async (content: unknown): Promise<string> => { const path = join(await mkdtemp(join(tmpdir(), "originos-auth-")), "auth.json"); await writeFile(path, JSON.stringify(content), "utf8"); return path; };
describe("static operational authentication", () => {
  it("authenticates a hashed key and returns only its explicit Agent binding", async () => { const auth = await StaticApiKeyAuthenticator.fromFile(await configFile({ version: 1, principals: [{ principalId: "ops-merchant", apiKeySha256: hashApiKey("test-secret"), permittedAgentRefs: ["originos:merchant-1"] }] })); expect(await auth.authenticate("Bearer test-secret")).toEqual({ ok: true, principal: { principalId: "ops-merchant", permittedAgentRefs: ["originos:merchant-1"] } }); expect(await auth.authenticate("Bearer wrong")).toEqual({ ok: false }); expect(await auth.authenticate(undefined)).toEqual({ ok: false }); });
  it("rejects plaintext-like hashes and duplicate identities", async () => { await expect(StaticApiKeyAuthenticator.fromFile(await configFile({ version: 1, principals: [{ principalId: "p", apiKeySha256: "secret", permittedAgentRefs: ["a"] }] }))).rejects.toThrow(/invalid/); const duplicate = { version: 1, principals: [{ principalId: "p", apiKeySha256: hashApiKey("a"), permittedAgentRefs: ["a"] }, { principalId: "p", apiKeySha256: hashApiKey("b"), permittedAgentRefs: ["b"] }] }; await expect(StaticApiKeyAuthenticator.fromFile(await configFile(duplicate))).rejects.toThrow(/unique/); });
  it("returns explicit Agency and Authority bindings when configured, and omits them when not", async () => {
    const bound = await StaticApiKeyAuthenticator.fromFile(await configFile({ version: 1, principals: [{ principalId: "ops-merchant", apiKeySha256: hashApiKey("test-secret"), permittedAgentRefs: ["originos:merchant-1"], permittedAgencyRefs: ["originos:agency-1"], permittedAuthorityRefs: ["originos:authority-1"] }] }));
    expect(await bound.authenticate("Bearer test-secret")).toEqual({ ok: true, principal: { principalId: "ops-merchant", permittedAgentRefs: ["originos:merchant-1"], permittedAgencyRefs: ["originos:agency-1"], permittedAuthorityRefs: ["originos:authority-1"] } });
    const unbound = await StaticApiKeyAuthenticator.fromFile(await configFile({ version: 1, principals: [{ principalId: "ops-merchant", apiKeySha256: hashApiKey("test-secret"), permittedAgentRefs: ["originos:merchant-1"] }] }));
    const result = await unbound.authenticate("Bearer test-secret");
    expect(result.ok && result.principal.permittedAgencyRefs).toBeUndefined();
    expect(result.ok && result.principal.permittedAuthorityRefs).toBeUndefined();
  });
  it("rejects an empty or non-string Agency/Authority refs list", async () => {
    await expect(StaticApiKeyAuthenticator.fromFile(await configFile({ version: 1, principals: [{ principalId: "p", apiKeySha256: hashApiKey("a"), permittedAgentRefs: ["a"], permittedAgencyRefs: [] }] }))).rejects.toThrow(/invalid/);
    await expect(StaticApiKeyAuthenticator.fromFile(await configFile({ version: 1, principals: [{ principalId: "p", apiKeySha256: hashApiKey("a"), permittedAgentRefs: ["a"], permittedAuthorityRefs: [""] }] }))).rejects.toThrow(/invalid/);
  });
});

describe("OIDC JWT authentication", () => {
  const fixture = async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey); publicJwk.kid = "test-key"; publicJwk.alg = "RS256";
    const authenticator = new OidcJwtAuthenticator({ issuer: "https://identity.example.test", audience: "originos-api", jwksUri: "https://identity.example.test/.well-known/jwks.json" }, createLocalJWKSet({ keys: [publicJwk] }));
    const token = (claims: Record<string, unknown> = {}, audience = "originos-api") => new SignJWT({ scope: "originos:commands", originos_agent_refs: ["originos:merchant-1"], ...claims }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("operator-42").setIssuer("https://identity.example.test/").setAudience(audience).setIssuedAt().setExpirationTime("5m").sign(privateKey);
    return { authenticator, token };
  };

  it("verifies a signed, bounded token and returns its explicit Agent bindings", async () => {
    const { authenticator, token } = await fixture();
    expect(await authenticator.authenticate(`Bearer ${await token()}`)).toEqual({ ok: true, principal: { principalId: "operator-42", permittedAgentRefs: ["originos:merchant-1"] } });
  });

  it("rejects tokens with the wrong audience, missing command scope, or missing Agent bindings", async () => {
    const { authenticator, token } = await fixture();
    expect(await authenticator.authenticate(`Bearer ${await token({}, "other-api")}`)).toEqual({ ok: false });
    expect(await authenticator.authenticate(`Bearer ${await token({ scope: "profile" })}`)).toEqual({ ok: false });
    expect(await authenticator.authenticate(`Bearer ${await token({ originos_agent_refs: [] })}`)).toEqual({ ok: false });
  });

  it("requires HTTPS key discovery and rejects malformed bearer input", async () => {
    expect(() => new OidcJwtAuthenticator({ issuer: "https://identity.example.test", audience: "originos-api", jwksUri: "http://identity.example.test/jwks" })).toThrow(/HTTPS/);
    const { authenticator } = await fixture();
    expect(await authenticator.authenticate("Bearer not-a-jwt")).toEqual({ ok: false });
    expect(await authenticator.authenticate("Basic secret")).toEqual({ ok: false });
  });

  it("returns explicit Agency and Authority bindings when the token declares them, and omits them when it does not", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey); publicJwk.kid = "test-key"; publicJwk.alg = "RS256";
    const authenticator = new OidcJwtAuthenticator({ issuer: "https://identity.example.test", audience: "originos-api", jwksUri: "https://identity.example.test/.well-known/jwks.json" }, createLocalJWKSet({ keys: [publicJwk] }));
    const boundToken = await new SignJWT({ scope: "originos:commands", originos_agent_refs: ["originos:merchant-1"], originos_agency_refs: ["originos:agency-1"], originos_authority_refs: ["originos:authority-1"] }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("operator-42").setIssuer("https://identity.example.test/").setAudience("originos-api").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    expect(await authenticator.authenticate(`Bearer ${boundToken}`)).toEqual({ ok: true, principal: { principalId: "operator-42", permittedAgentRefs: ["originos:merchant-1"], permittedAgencyRefs: ["originos:agency-1"], permittedAuthorityRefs: ["originos:authority-1"] } });
    const unboundResult = await authenticator.authenticate(`Bearer ${await new SignJWT({ scope: "originos:commands", originos_agent_refs: ["originos:merchant-1"] }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("operator-42").setIssuer("https://identity.example.test/").setAudience("originos-api").setIssuedAt().setExpirationTime("5m").sign(privateKey)}`);
    expect(unboundResult.ok && unboundResult.principal.permittedAgencyRefs).toBeUndefined();
    expect(unboundResult.ok && unboundResult.principal.permittedAuthorityRefs).toBeUndefined();
  });

  it("rejects a token with an empty or malformed Agency/Authority refs claim", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey); publicJwk.kid = "test-key"; publicJwk.alg = "RS256";
    const authenticator = new OidcJwtAuthenticator({ issuer: "https://identity.example.test", audience: "originos-api", jwksUri: "https://identity.example.test/.well-known/jwks.json" }, createLocalJWKSet({ keys: [publicJwk] }));
    const malformed = await new SignJWT({ scope: "originos:commands", originos_agent_refs: ["originos:merchant-1"], originos_agency_refs: [] }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("operator-42").setIssuer("https://identity.example.test/").setAudience("originos-api").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    expect(await authenticator.authenticate(`Bearer ${malformed}`)).toEqual({ ok: false });
  });
});
