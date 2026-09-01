import { describe, expect, it } from "vitest";
import { DataType, newDb } from "pg-mem";
import { canonicalId, instant, recordVersion, type CanonicalRecord } from "@originos/canonical-types";
import { PostgresCanonicalRepository, type SqlPool } from "./index.js";

const makeRecord = (version: number): CanonicalRecord => ({
  canonicalId: canonicalId("originos:postgres-record"), canonicalType: "test-record", schemaVersion: "1.0.0",
  recordVersion: recordVersion(version), ...(version > 1 ? { predecessorVersion: recordVersion(version - 1) } : {}),
  lifecycleStatus: "active", assertionStatus: "known",
  scope: { contextRef: canonicalId("originos:test-context"), boundaryRefs: [] },
  time: { validTime: { from: instant("2026-09-01T00:00:00Z") }, recordedTime: instant("2026-09-01T00:00:00Z") },
  provenance: { sourceRefs: [canonicalId("originos:test-source")], producerRef: canonicalId("originos:test-producer") },
  reason: `version ${version}`, content: { version }
});
const repository = async (): Promise<PostgresCanonicalRepository> => {
  const database = newDb();
  database.public.registerFunction({ name: "pg_advisory_xact_lock", args: [DataType.integer], returns: DataType.bool, implementation: () => true });
  const adapter = database.adapters.createPg();
  const result = new PostgresCanonicalRepository(new adapter.Pool() as unknown as SqlPool); await result.migrate(); return result;
};

describe("PostgreSQL canonical repository", () => {
  it("persists immutable history and reports readiness", async () => {
    const store = await repository();
    expect((await store.append({ record: makeRecord(1) })).ok).toBe(true);
    expect((await store.append({ record: makeRecord(2), expectedCurrentVersion: recordVersion(1) })).ok).toBe(true);
    expect((await store.history(canonicalId("originos:postgres-record"))).map(({ recordVersion }) => recordVersion)).toEqual([1, 2]);
    expect(await store.check()).toEqual({ ok: true, detail: "2 canonical versions reachable" });
    await store.close();
  });
  it("rolls back an invalid multi-record batch", async () => {
    const store = await repository();
    const result = await store.appendMany([{ record: makeRecord(1) }, { record: makeRecord(1) }]);
    expect(result.ok).toBe(false); expect(await store.all()).toHaveLength(0); await store.close();
  });
});
