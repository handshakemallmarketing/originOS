import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashApiKey, StaticApiKeyAuthenticator } from "./index.js";
const configFile = async (content: unknown): Promise<string> => { const path = join(await mkdtemp(join(tmpdir(), "originos-auth-")), "auth.json"); await writeFile(path, JSON.stringify(content), "utf8"); return path; };
describe("static operational authentication", () => {
  it("authenticates a hashed key and returns only its explicit Agent binding", async () => { const auth = await StaticApiKeyAuthenticator.fromFile(await configFile({ version: 1, principals: [{ principalId: "ops-merchant", apiKeySha256: hashApiKey("test-secret"), permittedAgentRefs: ["originos:merchant-1"] }] })); expect(await auth.authenticate("Bearer test-secret")).toEqual({ ok: true, principal: { principalId: "ops-merchant", permittedAgentRefs: ["originos:merchant-1"] } }); expect(await auth.authenticate("Bearer wrong")).toEqual({ ok: false }); expect(await auth.authenticate(undefined)).toEqual({ ok: false }); });
  it("rejects plaintext-like hashes and duplicate identities", async () => { await expect(StaticApiKeyAuthenticator.fromFile(await configFile({ version: 1, principals: [{ principalId: "p", apiKeySha256: "secret", permittedAgentRefs: ["a"] }] }))).rejects.toThrow(/invalid/); const duplicate = { version: 1, principals: [{ principalId: "p", apiKeySha256: hashApiKey("a"), permittedAgentRefs: ["a"] }, { principalId: "p", apiKeySha256: hashApiKey("b"), permittedAgentRefs: ["b"] }] }; await expect(StaticApiKeyAuthenticator.fromFile(await configFile(duplicate))).rejects.toThrow(/unique/); });
});
