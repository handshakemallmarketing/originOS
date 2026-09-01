import { describe, expect, it } from "vitest";
import { canonicalId, instant, recordVersion, type CanonicalRecord } from "@originos/canonical-types";
import { exportCanonicalBundle, importCanonicalBundle, InMemoryCanonicalRepository, semanticallyEquivalent } from "./index.js";

const makeRecord = (version: number): CanonicalRecord => ({
  canonicalId: canonicalId("originos:test-record"), canonicalType: "test-record", schemaVersion: "1.0.0",
  recordVersion: recordVersion(version), ...(version > 1 ? { predecessorVersion: recordVersion(version - 1) } : {}),
  lifecycleStatus: "active", assertionStatus: "known",
  scope: { contextRef: canonicalId("originos:test-context"), boundaryRefs: [] },
  time: { validTime: { from: instant("2026-08-29T00:00:00Z") }, recordedTime: instant("2026-08-29T00:00:00Z") },
  provenance: { sourceRefs: [canonicalId("originos:test-source")], producerRef: canonicalId("originos:test-producer") },
  reason: `version ${version}`, content: { version }
});

describe("semantic round trip", () => {
  it("preserves identity, version, status, provenance, relations, uncertainty, and history", async () => {
    const repository = new InMemoryCanonicalRepository();
    const first = makeRecord(1);
    const second = { ...makeRecord(2), predecessorVersion: recordVersion(1), assertionStatus: "stale" as const,
      content: { relations: ["originos:related-1"], uncertainty: { confidence: 0.75 } } };
    expect((await repository.append({ record: first })).ok).toBe(true);
    expect((await repository.append({ record: second, expectedCurrentVersion: recordVersion(1) })).ok).toBe(true);
    const history = await repository.history(first.canonicalId);
    const imported = importCanonicalBundle(exportCanonicalBundle(history));
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(semanticallyEquivalent(history, imported.value.records)).toBe(true);
      expect(imported.value.records.map((record) => record.recordVersion)).toEqual([1, 2]);
      expect(imported.value.records[1]?.content).toEqual(second.content);
    }
  });

  it("rejects an incomplete imported record", () => {
    const imported = importCanonicalBundle(JSON.stringify({ profile: "OriginOS-Software-Sprint-0", schemaVersion: "0.1.0", records: [{}] }));
    expect(imported.ok).toBe(false);
  });
});

describe("InMemoryCanonicalRepository", () => {
  it("commits batches atomically", async () => {
    const repository = new InMemoryCanonicalRepository();
    const result = await repository.appendMany([{ record: makeRecord(1) }, { record: makeRecord(1) }]);
    expect(result.ok).toBe(false);
    expect(await repository.all()).toHaveLength(0);
  });

  it("appends immutable versions and preserves history", async () => {
    const repository = new InMemoryCanonicalRepository();
    expect((await repository.append({ record: makeRecord(1) })).ok).toBe(true);
    expect((await repository.append({ record: makeRecord(2), expectedCurrentVersion: recordVersion(1) })).ok).toBe(true);
    const history = await repository.history(canonicalId("originos:test-record"));
    expect(history.map((record) => record.recordVersion)).toEqual([1, 2]);
    expect(Object.isFrozen(history[0])).toBe(true);
  });

  it("rejects overwrite and stale expected version", async () => {
    const repository = new InMemoryCanonicalRepository();
    await repository.append({ record: makeRecord(1) });
    const result = await repository.append({ record: makeRecord(2), expectedCurrentVersion: recordVersion(2) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID");
  });
});
