import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export interface AuthenticatedPrincipal { readonly principalId: string; readonly permittedAgentRefs: readonly string[] }
export type AuthenticationResult = { readonly ok: true; readonly principal: AuthenticatedPrincipal } | { readonly ok: false };
export interface RequestAuthenticator { authenticate(authorization: string | undefined): Promise<AuthenticationResult> }
export interface OidcJwtAuthenticatorOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUri: string;
  readonly agentRefsClaim?: string;
  readonly requiredScope?: string;
}
interface PrincipalConfig { readonly principalId: string; readonly apiKeySha256: string; readonly permittedAgentRefs: readonly string[] }
interface AuthConfig { readonly version: 1; readonly principals: readonly PrincipalConfig[] }
export const hashApiKey = (apiKey: string): string => createHash("sha256").update(apiKey, "utf8").digest("hex");
const parseConfig = (value: unknown): AuthConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("auth config must be an object");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !["version", "principals"].includes(key)) || object.version !== 1 || !Array.isArray(object.principals) || object.principals.length === 0) throw new Error("auth config must contain version 1 and at least one principal");
  const principals = object.principals.map((entry, index): PrincipalConfig => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`principal ${index} must be an object`);
    const candidate = entry as Record<string, unknown>;
    if (Object.keys(candidate).some((key) => !["principalId", "apiKeySha256", "permittedAgentRefs"].includes(key)) || typeof candidate.principalId !== "string" || candidate.principalId.trim() === "" || typeof candidate.apiKeySha256 !== "string" || !/^[a-f0-9]{64}$/.test(candidate.apiKeySha256) || !Array.isArray(candidate.permittedAgentRefs) || candidate.permittedAgentRefs.length === 0 || candidate.permittedAgentRefs.some((ref) => typeof ref !== "string" || ref.trim() === "")) throw new Error(`principal ${index} is invalid`);
    return Object.freeze({ principalId: candidate.principalId, apiKeySha256: candidate.apiKeySha256, permittedAgentRefs: Object.freeze([...new Set(candidate.permittedAgentRefs as string[])]) });
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
    for (const candidate of this.#principals) if (timingSafeEqual(suppliedHash, Buffer.from(candidate.apiKeySha256, "hex"))) return { ok: true, principal: Object.freeze({ principalId: candidate.principalId, permittedAgentRefs: candidate.permittedAgentRefs }) };
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
  readonly #requiredScope: string;
  readonly #keySet: JWTVerifyGetKey;

  constructor(options: OidcJwtAuthenticatorOptions, keySet?: JWTVerifyGetKey) {
    this.#issuer = requiredText(options.issuer, "OIDC issuer");
    let issuerUrl: URL;
    try { issuerUrl = new URL(this.#issuer); } catch { throw new Error("OIDC issuer must be a valid URL"); }
    if (issuerUrl.protocol !== "https:") throw new Error("OIDC issuer must use HTTPS");
    this.#audience = requiredText(options.audience, "OIDC audience");
    this.#agentRefsClaim = requiredText(options.agentRefsClaim ?? "originos_agent_refs", "OIDC Agent refs claim");
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
      return { ok: true, principal: Object.freeze({ principalId: payload.sub, permittedAgentRefs: Object.freeze([...new Set(refs as string[])]) }) };
    } catch { return { ok: false }; }
  }
}
