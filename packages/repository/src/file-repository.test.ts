import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalId, instant, recordVersion, type CanonicalRecord } from "@originos/canonical-types";
import { JsonFileCanonicalRepository } from "./file-repository.js";

const record = (version: number): CanonicalRecord => ({
  canonicalId: canonicalId("originos:persistent-cocoa-lot"), canonicalType: "material-lot", schemaVersion: "0.1.0",
  recordVersion: recordVersion(version), ...(version > 1 ? { predecessorVersion: recordVersion(version - 1) } : {}),
  lifecycleStatus: "active", assertionStatus: "known", scope: { contextRef: canonicalId("originos:cocoa-context"), boundaryRefs: [] },
  time: { validTime: { from: instant("2026-08-29T00:00:00Z") }, recordedTime: instant("2026-08-29T00:00:00Z") },
  provenance: { sourceRefs: [canonicalId("originos:cocoa-receipt")], producerRef: canonicalId("originos:sprint1-application") },
  reason: "persistence test", content: { quantityKg: 100 - version }
});

describe("JSON-file canonical repository", () => {
  it("does not persist the valid prefix of an invalid batch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-store-batch-"));
    const path = join(directory, "canonical.json");
    const repository = new JsonFileCanonicalRepository(path);
    expect((await repository.appendMany([{ record: record(1) }, { record: record(1) }])).ok).toBe(false);
    expect(await repository.all()).toHaveLength(0);
  });

  it("preserves immutable history across process-like restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-store-"));
    const path = join(directory, "canonical.json");
    const firstSession = new JsonFileCanonicalRepository(path);
    expect((await firstSession.append({ record: record(1) })).ok).toBe(true);
    expect((await firstSession.append({ record: record(2), expectedCurrentVersion: recordVersion(1) })).ok).toBe(true);
    const restarted = new JsonFileCanonicalRepository(path);
    expect((await restarted.history(canonicalId("originos:persistent-cocoa-lot"))).map((item) => item.recordVersion)).toEqual([1, 2]);
    expect(JSON.parse(await readFile(path, "utf8")).records).toHaveLength(2);
  });
});
