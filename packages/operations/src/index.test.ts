import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportCanonicalBundle } from "@originos/repository";
import { acquireOperationalLock, checkDataIntegrity, createOperationalBackup, JsonlAuditLog, restoreOperationalBackup, verifyAuditLog } from "./index.js";

describe("SW1-06 operational integrity", () => {
  it("verifies hash-chained audit entries and detects tampering", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-audit-"));
    const path = join(directory, "audit-log.jsonl");
    const log = new JsonlAuditLog(path, () => new Date("2026-09-01T00:00:00Z"));
    await log.record({ event: "command-request", commandId: "one", commandType: "recordDecision", statusCode: 201, replayed: false, outcome: "accepted" });
    await log.record({ event: "command-request", commandId: "one", commandType: "recordDecision", statusCode: 201, replayed: true, outcome: "accepted" });
    const serialized = await readFile(path, "utf8");
    expect(verifyAuditLog(serialized)).toMatchObject({ ok: true, detail: "2 chained entries verified" });
    expect(verifyAuditLog(serialized.replace("recordDecision", "alteredCommand"))).toMatchObject({ ok: false });
  });

  it("creates a verified backup and restores atomically while preserving rollback data", async () => {
    const root = await mkdtemp(join(tmpdir(), "originos-backup-"));
    const data = join(root, "data");
    const backup = join(root, "backup.json");
    await mkdir(data);
    const log = new JsonlAuditLog(join(data, "audit-log.jsonl"), () => new Date("2026-09-01T00:00:00Z"));
    await writeFile(join(data, "canonical-store.json"), exportCanonicalBundle([]), "utf8");
    await writeFile(join(data, "command-receipts.json"), JSON.stringify({ version: 1, receipts: [] }), "utf8");
    await log.record({ event: "command-request", statusCode: 400, outcome: "validation-rejected" });
    const release = await acquireOperationalLock(data);
    await expect(createOperationalBackup(data, backup)).rejects.toThrow(/stop it before backup/);
    await release();
    expect((await checkDataIntegrity(data)).ok).toBe(true);
    await createOperationalBackup(data, backup, new Date("2026-09-01T01:00:00Z"));

    await writeFile(join(data, "canonical-store.json"), "corrupt", "utf8");
    expect((await checkDataIntegrity(data)).ok).toBe(false);
    const restored = await restoreOperationalBackup(backup, data);
    expect(restored.rollbackDirectory).toBeTruthy();
    expect((await checkDataIntegrity(data)).ok).toBe(true);
    expect(await readFile(join(restored.rollbackDirectory!, "canonical-store.json"), "utf8")).toBe("corrupt");

    const candidate = JSON.parse(await readFile(backup, "utf8")) as { files: Array<{ content: string }> };
    candidate.files[0]!.content += "tampered";
    await writeFile(backup, JSON.stringify(candidate), "utf8");
    await expect(restoreOperationalBackup(backup, join(root, "tampered-target"))).rejects.toThrow(/hash mismatch/);
  });
});
