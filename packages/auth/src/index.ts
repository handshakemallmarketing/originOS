import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
export interface AuthenticatedPrincipal { readonly principalId: string; readonly permittedAgentRefs: readonly string[] }
export type AuthenticationResult = { readonly ok: true; readonly principal: AuthenticatedPrincipal } | { readonly ok: false };
export interface RequestAuthenticator { authenticate(authorization: string | undefined): Promise<AuthenticationResult> }
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
