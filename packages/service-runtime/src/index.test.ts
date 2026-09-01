import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cocoaWorkflowCommands } from "@originos/application";
import { hashApiKey } from "@originos/auth";
import { checkDataIntegrity, createOperationalBackup, restoreOperationalBackup } from "@originos/operations";
import { loadServiceConfig, startOriginService, type OriginService } from "./index.js";

const closeQuietly = async (service: OriginService | undefined): Promise<void> => { if (service) await service.close(); };

describe("SW1-04 service runtime", () => {
  it("loads bounded configuration and rejects invalid ports", () => {
    expect(loadServiceConfig({ ORIGINOS_HOST: "127.0.0.1", ORIGINOS_PORT: "8080", ORIGINOS_DATA_DIR: "runtime-data", ORIGINOS_AUTH_CONFIG: "auth.json" })).toEqual({
      host: "127.0.0.1", port: 8080, dataDirectory: resolve("runtime-data"), authConfigPath: resolve("auth.json")
    });
    expect(loadServiceConfig({ ORIGINOS_AUTH_CONFIG: "auth.json", ORIGINOS_DATABASE_URL: "postgres://originos@db/originos" }).databaseUrl).toBe("postgres://originos@db/originos");
    expect(() => loadServiceConfig({ ORIGINOS_PORT: "not-a-port" })).toThrow(/ORIGINOS_PORT/);
    expect(() => loadServiceConfig({ ORIGINOS_PORT: "65536" })).toThrow(/ORIGINOS_PORT/);
    expect(() => loadServiceConfig({})).toThrow(/ORIGINOS_AUTH_CONFIG/);
  });

  it("runs the complete Cocoa workflow through HTTP and preserves it across graceful restart", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "originos-service-"));
    const backupPath = `${dataDirectory}.backup.json`;
    const authConfigPath = `${dataDirectory}.auth.json`;
    const apiKey = "service-test-secret";
    await writeFile(authConfigPath, JSON.stringify({ version: 1, principals: [{ principalId: "cocoa-operator", apiKeySha256: hashApiKey(apiKey), permittedAgentRefs: ["originos:merchant-1", "originos:warehouse-1", "originos:processor-1"] }] }), "utf8");
    const config = { host: "127.0.0.1", port: 0, dataDirectory, authConfigPath } as const;
    const authHeaders = { authorization: `Bearer ${apiKey}` } as const;
    let service: OriginService | undefined;
    try {
      service = await startOriginService(config);
      await expect(startOriginService(config)).rejects.toThrow(/running|locked/);
      await expect(createOperationalBackup(dataDirectory, backupPath)).rejects.toThrow(/stop it before backup/);
      expect(await fetch(`${service.baseUrl}/health`).then((response) => response.json())).toEqual({ status: "ok" });
      const shell = await fetch(service.baseUrl);
      expect(shell.status).toBe(200); expect(shell.headers.get("content-type")).toBe("text/html; charset=utf-8"); expect(await shell.text()).toContain("Cocoa operations");
      expect(await fetch(`${service.baseUrl}/lots`).then((response) => response.text())).toContain("Cocoa lots");
      expect((await fetch(`${service.baseUrl}/ready`)).status).toBe(200);
      const commands = cocoaWorkflowCommands({
        runId: "api-cocoa", quantityKg: 1000, originRef: "originos:farm-ghana-1",
        merchantRef: "originos:merchant-1", warehouseRef: "originos:warehouse-1", processorRef: "originos:processor-1"
      });
      for (const command of commands) {
        const response = await fetch(`${service.baseUrl}/v2/commands`, {
          method: "POST", headers: { ...authHeaders, "content-type": "application/json", "idempotency-key": command.commandId }, body: JSON.stringify(command)
        });
        expect(response.status).toBe(201);
      }
      expect((await fetch(`${service.baseUrl}/v2/records`)).status).toBe(401);
      const before = await fetch(`${service.baseUrl}/v2/records`, { headers: authHeaders }).then((response) => response.json()) as { records: Array<{ canonicalType: string }> };
      expect(before.records).toHaveLength(11);
      expect(before.records.map((record) => record.canonicalType)).toEqual([
        "material-lot", "custody-transfer", "comparison-result", "decision", "act", "transformation",
        "completion", "outcome", "consequence", "outcome", "value-status"
      ]);
      await service.close(); service = undefined;

      const integrity = await checkDataIntegrity(dataDirectory);
      expect(integrity.ok).toBe(true);
      expect(integrity.checks.find((check) => check.name === "audit-log")?.detail).toBe("8 chained entries verified");
      const audit = await readFile(join(dataDirectory, "audit-log.jsonl"), "utf8");
      expect(audit).not.toContain(apiKey); expect(audit).not.toContain("originos:farm-ghana-1"); expect(audit).toContain("cocoa-operator");
      await createOperationalBackup(dataDirectory, backupPath, new Date("2026-09-01T02:00:00Z"));
      await writeFile(join(dataDirectory, "canonical-store.json"), "corrupt", "utf8");
      await expect(startOriginService(config)).rejects.toThrow(/integrity check failed/);
      const restored = await restoreOperationalBackup(backupPath, dataDirectory);
      expect(restored.rollbackDirectory).toBeTruthy();
      expect(await readFile(join(restored.rollbackDirectory!, "canonical-store.json"), "utf8")).toBe("corrupt");

      service = await startOriginService(config);
      const after = await fetch(`${service.baseUrl}/v2/records`, { headers: authHeaders }).then((response) => response.json()) as { records: unknown[] };
      expect(after.records).toHaveLength(11);
      const replay = await fetch(`${service.baseUrl}/v2/commands`, {
        method: "POST", headers: { ...authHeaders, "content-type": "application/json", "idempotency-key": commands[0]!.commandId }, body: JSON.stringify(commands[0])
      });
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      expect(await service.application.all()).toHaveLength(11);
    } finally { await closeQuietly(service); }
  });
});
