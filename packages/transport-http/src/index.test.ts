import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OriginApplication, type ApplicationCommandEnvelope } from "@originos/application";
import type { RequestAuthenticator } from "@originos/auth";
import { JsonFileCanonicalRepository } from "@originos/repository";
import { createOriginHttpServer, JsonCommandReceiptStore } from "./index.js";

const servers: import("node:http").Server[] = [];
const authenticator: RequestAuthenticator = { authenticate: async (authorization) => authorization === "Bearer valid-key" ? { ok: true, principal: { principalId: "test-operator", permittedAgentRefs: ["originos:merchant-1"] } } : { ok: false } };
const authorized = { authorization: "Bearer valid-key" } as const;
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));
const start = async (storePath: string, receiptPath: string): Promise<{ baseUrl: string; application: OriginApplication }> => {
  const application = new OriginApplication(new JsonFileCanonicalRepository(storePath));
  const server = createOriginHttpServer(application, new JsonCommandReceiptStore(receiptPath), { authenticator }); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, application };
};
const command = (): ApplicationCommandEnvelope => ({
  commandId: "http-decision", agentRef: "originos:merchant-1", agencyRef: "originos:agency-cocoa-procurement",
  authorityRef: "originos:authority-cocoa-procurement", purposeRef: "originos:purpose-conforming-cocoa",
  evidenceRefs: ["originos:evidence-cocoa-receipt"], attributionRule: "originos:attribution-direct-agent",
  command: { commandType: "recordDecision", payload: { fixtureId: "http-decision", merchant: "originos:merchant-1", supplier: "originos:processor-1" } }
});
const transformationCommand = (): ApplicationCommandEnvelope => ({
  ...command(), commandId: "http-transformation",
  command: { commandType: "recordOutcome", payload: { fixtureId: "http-transformation", shipmentArrived: true, cocoaDamaged: false } }
});
const post = (baseUrl: string, envelope: ApplicationCommandEnvelope, key?: string, authorization = "Bearer valid-key") => fetch(`${baseUrl}/v2/commands`, {
  method: "POST", headers: { authorization, "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(envelope)
});

describe("Software Sprint 1 HTTP transport", () => {
  it("recovers a pending receipt after a crash window without partial or duplicate effects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-http-recovery-"));
    const storePath = join(directory, "canonical.json"); const receiptPath = join(directory, "receipts.json");
    const application = new OriginApplication(new JsonFileCanonicalRepository(storePath));
    const crashing = createOriginHttpServer(application, new JsonCommandReceiptStore(receiptPath, { afterOperationBeforeCommit: () => { throw new Error("simulated crash window"); } }), { authenticator });
    servers.push(crashing); await new Promise<void>((resolve) => crashing.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(crashing.address() as AddressInfo).port}`;
    expect((await post(baseUrl, transformationCommand(), "http-transformation")).status).toBe(400);
    expect(await application.all()).toHaveLength(3);
    await new Promise<void>((resolve) => servers.shift()?.close(() => resolve()));

    const restarted = await start(storePath, receiptPath);
    const recovered = await post(restarted.baseUrl, transformationCommand(), "http-transformation");
    expect(recovered.status).toBe(201);
    expect(recovered.headers.get("idempotency-replayed")).toBe("true");
    expect(await restarted.application.all()).toHaveLength(3);
  });

  it("replays without duplicate canonical effects, including after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-http-"));
    const storePath = join(directory, "canonical.json"); const receiptPath = join(directory, "receipts.json");
    const first = await start(storePath, receiptPath);
    const initial = await post(first.baseUrl, command(), "http-decision");
    expect(initial.status).toBe(201); expect(initial.headers.get("idempotency-replayed")).toBe("false");
    const replay = await post(first.baseUrl, command(), "http-decision");
    expect(replay.status).toBe(201); expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await first.application.all()).toHaveLength(1);
    await new Promise<void>((resolve) => servers.shift()?.close(() => resolve()));
    const restarted = await start(storePath, receiptPath);
    const persistedReplay = await post(restarted.baseUrl, command(), "http-decision");
    expect(persistedReplay.headers.get("idempotency-replayed")).toBe("true"); expect(await restarted.application.all()).toHaveLength(1);
    const all = await fetch(`${restarted.baseUrl}/v2/records`, { headers: authorized }).then((response) => response.json()) as { records: unknown[] };
    expect(all.records).toHaveLength(1);
    const id = encodeURIComponent("originos:decision-http-decision");
    expect((await fetch(`${restarted.baseUrl}/v2/records/${id}`, { headers: authorized })).status).toBe(200);
    const history = await fetch(`${restarted.baseUrl}/v2/records/${id}/history`, { headers: authorized }).then((response) => response.json()) as { records: unknown[] };
    expect(history.records).toHaveLength(1);
  });

  it("rejects key collisions and missing or mismatched keys", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-http-conflict-"));
    const { baseUrl, application } = await start(join(directory, "canonical.json"), join(directory, "receipts.json"));
    expect((await post(baseUrl, command())).status).toBe(400);
    expect((await post(baseUrl, command(), "different-key")).status).toBe(400);
    expect((await post(baseUrl, command(), "http-decision")).status).toBe(201);
    const conflict = await post(baseUrl, { ...command(), purposeRef: "originos:purpose-altered" }, "http-decision");
    expect(conflict.status).toBe(409);
    expect((await conflict.json() as { error: { code: string } }).error.code).toBe("C2C_E009_CONFLICT_UNRESOLVED");
    expect(await application.all()).toHaveLength(1);
  });

  it("publishes authenticated API v2 and rejects invalid structures before canonical execution", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-http-schema-"));
    const { baseUrl, application } = await start(join(directory, "canonical.json"), join(directory, "receipts.json"));
    const contract = await fetch(`${baseUrl}/openapi.json`);
    expect(contract.status).toBe(200);
    expect(contract.headers.get("x-originos-api-version")).toBe("2.0.0");
    expect((await contract.json() as { openapi: string }).openapi).toBe("3.1.0");
    const invalid = { ...command(), unexpected: true, command: { commandType: "registerCocoaLot", payload: { lotId: "bad", quantityKg: "1000", originRef: "originos:farm-1", custodianRef: "originos:warehouse-1" } } };
    const response = await fetch(`${baseUrl}/v2/commands`, { method: "POST", headers: { ...authorized, "content-type": "application/json", "idempotency-key": invalid.commandId }, body: JSON.stringify(invalid) });
    expect(response.status).toBe(400);
    const body = await response.json() as { error: { details: { issues: Array<{ path: string }> } } };
    expect(body.error.details.issues.map((issue) => issue.path)).toContain("$.command.payload.quantityKg");
    expect(await application.all()).toHaveLength(0);
    const media = await fetch(`${baseUrl}/v2/commands`, { method: "POST", headers: { ...authorized, "content-type": "text/plain", "idempotency-key": "plain" }, body: "{}" });
    expect(media.status).toBe(415);
  });

  it("rejects unauthenticated callers and unbound Agent declarations before side effects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-http-auth-"));
    const { baseUrl, application } = await start(join(directory, "canonical.json"), join(directory, "receipts.json"));
    const missing = await post(baseUrl, command(), "http-decision", "");
    expect(missing.status).toBe(401); expect(missing.headers.get("www-authenticate")).toBe("Bearer");
    const denied = await post(baseUrl, { ...command(), agentRef: "originos:unbound-agent", authorityRef: "originos:authority-cocoa-procurement" }, "http-decision");
    expect(denied.status).toBe(403);
    expect((await denied.json() as { error: { code: string } }).error.code).toBe("ORIGINOS_AUTH_002_AGENT_BINDING_DENIED");
    expect(await application.all()).toHaveLength(0);
    expect((await fetch(`${baseUrl}/v2/records`)).status).toBe(401);
  });
});
