import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export interface AuthenticatedPrincipal {
  readonly principalId: string;
  readonly permittedAgentRefs: readonly string[];
  /** Undefined means unrestricted (backward-compatible default). When set, the declared Agency on a command envelope must be a member. */
  readonly permittedAgencyRefs?: readonly string[];
  /** Undefined means unrestricted (backward-compatible default). When set, the declared Authority on a command envelope must be a member. */
  readonly permittedAuthorityRefs?: readonly string[];
}
export type AuthenticationResult = { readonly ok: true; readonly principal: AuthenticatedPrincipal } | { readonly ok: false };
export interface RequestAuthenticator { authenticate(authorization: string | undefined): Promise<AuthenticationResult> }
export interface OidcJwtAuthenticatorOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUri: string;
  readonly agentRefsClaim?: string;
  /** Optional Agency-binding claim. Absent from a token's payload means unrestricted (backward-compatible default); present but malformed rejects the token. */
  readonly agencyRefsClaim?: string;
  /** Optional Authority-binding claim. Absent from a token's payload means unrestricted (backward-compatible default); present but malformed rejects the token. */
  readonly authorityRefsClaim?: string;
  readonly requiredScope?: string;
}
interface PrincipalConfig { readonly principalId: string; readonly apiKeySha256: string; readonly permittedAgentRefs: readonly string[]; readonly permittedAgencyRefs?: readonly string[]; readonly permittedAuthorityRefs?: readonly string[] }
interface AuthConfig { readonly version: 1; readonly principals: readonly PrincipalConfig[] }
export const hashApiKey = (apiKey: string): string => createHash("sha256").update(apiKey, "utf8").digest("hex");
const parseConfig = (value: unknown): AuthConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("auth config must be an object");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !["version", "principals"].includes(key)) || object.version !== 1 || !Array.isArray(object.principals) || object.principals.length === 0) throw new Error("auth config must contain version 1 and at least one principal");
  const optionalRefs = (candidate: Record<string, unknown>, key: string, index: number): readonly string[] | undefined => {
    if (candidate[key] === undefined) return undefined;
    if (!Array.isArray(candidate[key]) || (candidate[key] as unknown[]).length === 0 || (candidate[key] as unknown[]).some((ref) => typeof ref !== "string" || ref.trim() === "")) throw new Error(`principal ${index} is invalid`);
    return Object.freeze([...new Set(candidate[key] as string[])]);
  };
  const principals = object.principals.map((entry, index): PrincipalConfig => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`principal ${index} must be an object`);
    const candidate = entry as Record<string, unknown>;
    if (Object.keys(candidate).some((key) => !["principalId", "apiKeySha256", "permittedAgentRefs", "permittedAgencyRefs", "permittedAuthorityRefs"].includes(key)) || typeof candidate.principalId !== "string" || candidate.principalId.trim() === "" || typeof candidate.apiKeySha256 !== "string" || !/^[a-f0-9]{64}$/.test(candidate.apiKeySha256) || !Array.isArray(candidate.permittedAgentRefs) || candidate.permittedAgentRefs.length === 0 || candidate.permittedAgentRefs.some((ref) => typeof ref !== "string" || ref.trim() === "")) throw new Error(`principal ${index} is invalid`);
    const permittedAgencyRefs = optionalRefs(candidate, "permittedAgencyRefs", index);
    const permittedAuthorityRefs = optionalRefs(candidate, "permittedAuthorityRefs", index);
    return Object.freeze({ principalId: candidate.principalId, apiKeySha256: candidate.apiKeySha256, permittedAgentRefs: Object.freeze([...new Set(candidate.permittedAgentRefs as string[])]), ...(permittedAgencyRefs ? { permittedAgencyRefs } : {}), ...(permittedAuthorityRefs ? { permittedAuthorityRefs } : {}) });
  });
  if (new Set(principals.map((principal) => principal.principalId)).size !== principals.length) throw new Error("principalId values must be unique");
  if (new Set(principals.map((principal) => principal.apiKeySha256)).size !== principals.length) throw new Error("apiKeySha256 values must be unique");
  return Object.freeze({ version: 1, principals: Object.freeze(principals) });
};
export class StaticApiKeyAuthenticator implements RequestAuthenticator {
  readonly #principals: readonly PrincipalConfig[];
  private constructor(config: AuthConfig) { this.#principals = config.principals; }
  static async fromFile(filePath: string): Promise<StaticApiKeyAuthenticator> { let parsed: unknown; try { parsed = JSON.parse(await readFile(filePath, "utf8")); } catch (error) { throw new Error(`unable to load auth config: ${error instanceof Error ? error.message : "invalid file"}`); } return new StaticApiKeyAuthenticator(parseConfig(parsed)); }
  async authenticate(authorization: string | undefined): Promise<AuthenticationResult> {
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? ""); if (!match?.[1]) return { ok: false };
    const suppliedHash = Buffer.from(hashApiKey(match[1]), "hex");
    for (const candidate of this.#principals) if (timingSafeEqual(suppliedHash, Buffer.from(candidate.apiKeySha256, "hex"))) return { ok: true, principal: Object.freeze({ principalId: candidate.principalId, permittedAgentRefs: candidate.permittedAgentRefs, ...(candidate.permittedAgencyRefs ? { permittedAgencyRefs: candidate.permittedAgencyRefs } : {}), ...(candidate.permittedAuthorityRefs ? { permittedAuthorityRefs: candidate.permittedAuthorityRefs } : {}) }) };
    return { ok: false };
  }
}

const requiredText = (value: string, name: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
};

export class OidcJwtAuthenticator implements RequestAuthenticator {
  readonly #issuer: string;
  readonly #audience: string;
  readonly #agentRefsClaim: string;
  readonly #agencyRefsClaim: string;
  readonly #authorityRefsClaim: string;
  readonly #requiredScope: string;
  readonly #keySet: JWTVerifyGetKey;

  constructor(options: OidcJwtAuthenticatorOptions, keySet?: JWTVerifyGetKey) {
    const configuredIssuer = requiredText(options.issuer, "OIDC issuer");
    let issuerUrl: URL;
    try { issuerUrl = new URL(configuredIssuer); } catch { throw new Error("OIDC issuer must be a valid URL"); }
    if (issuerUrl.protocol !== "https:") throw new Error("OIDC issuer must use HTTPS");
    issuerUrl.pathname = issuerUrl.pathname.replace(/\/+$/, "") + "/";
    issuerUrl.search = "";
    issuerUrl.hash = "";
    this.#issuer = issuerUrl.toString();
    this.#audience = requiredText(options.audience, "OIDC audience");
    this.#agentRefsClaim = requiredText(options.agentRefsClaim ?? "originos_agent_refs", "OIDC Agent refs claim");
    this.#agencyRefsClaim = requiredText(options.agencyRefsClaim ?? "originos_agency_refs", "OIDC Agency refs claim");
    this.#authorityRefsClaim = requiredText(options.authorityRefsClaim ?? "originos_authority_refs", "OIDC Authority refs claim");
    this.#requiredScope = requiredText(options.requiredScope ?? "originos:commands", "OIDC required scope");
    let jwks: URL;
    try { jwks = new URL(requiredText(options.jwksUri, "OIDC JWKS URI")); } catch { throw new Error("OIDC JWKS URI must be a valid URL"); }
    if (jwks.protocol !== "https:") throw new Error("OIDC JWKS URI must use HTTPS");
    this.#keySet = keySet ?? createRemoteJWKSet(jwks, { timeoutDuration: 5_000 });
  }

  async authenticate(authorization: string | undefined): Promise<AuthenticationResult> {
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization ?? "");
    if (!match?.[1]) return { ok: false };
    try {
      const { payload } = await jwtVerify(match[1], this.#keySet, {
        algorithms: ["RS256"], issuer: this.#issuer, audience: this.#audience,
        clockTolerance: 30, maxTokenAge: "15m", requiredClaims: ["sub", "iat", "exp"]
      });
      if (typeof payload.sub !== "string" || payload.sub.trim() === "") return { ok: false };
      const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [];
      if (!scopes.includes(this.#requiredScope)) return { ok: false };
      const refs = payload[this.#agentRefsClaim];
      if (!Array.isArray(refs) || refs.length === 0 || refs.some((ref) => typeof ref !== "string" || ref.trim() === "")) return { ok: false };
      const optionalRefs = (claim: string): readonly string[] | undefined => {
        const value = payload[claim];
        if (value === undefined) return undefined;
        if (!Array.isArray(value) || value.length === 0 || value.some((ref) => typeof ref !== "string" || ref.trim() === "")) throw new Error("invalid optional refs claim");
        return Object.freeze([...new Set(value as string[])]);
      };
      const permittedAgencyRefs = optionalRefs(this.#agencyRefsClaim);
      const permittedAuthorityRefs = optionalRefs(this.#authorityRefsClaim);
      return { ok: true, principal: Object.freeze({ principalId: payload.sub, permittedAgentRefs: Object.freeze([...new Set(refs as string[])]), ...(permittedAgencyRefs ? { permittedAgencyRefs } : {}), ...(permittedAuthorityRefs ? { permittedAuthorityRefs } : {}) }) };
    } catch { return { ok: false }; }
  }
}
