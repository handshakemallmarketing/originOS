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
const repository = async (statements?: string[]): Promise<PostgresCanonicalRepository> => {
  const database = newDb();
  database.public.registerFunction({ name: "pg_advisory_xact_lock", args: [DataType.integer], returns: DataType.bool, implementation: () => true });
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool() as unknown as SqlPool;
  if (statements) {
    const connect = pool.connect.bind(pool);
    pool.connect = async () => {
      const client = await connect();
      const query = client.query.bind(client);
      client.query = ((text: string, values?: readonly unknown[]) => {
        statements.push(text);
        return query(text, [...(values ?? [])]);
      }) as typeof client.query;
      return client;
    };
  }
  const result = new PostgresCanonicalRepository(pool); await result.migrate(); return result;
};

describe("PostgreSQL canonical repository", () => {
  it("persists immutable history and reports readiness", async () => {
    const store = await repository();
    expect((await store.append({ record: makeRecord(1) })).ok).toBe(true);
    expect((await store.append({ record: makeRecord(2), expectedCurrentVersion: recordVersion(1) })).ok).toBe(true);
    expect((await store.history(canonicalId("originos:postgres-record"))).map(({ recordVersion }) => recordVersion)).toEqual([1, 2]);
    expect(await store.check()).toEqual({ ok: true, detail: "2 canonical versions, 0 committed command receipts, and 0 transactional audit events reachable" });
    await store.close();
  });
  it("rolls back an invalid multi-record batch", async () => {
    const store = await repository();
    const result = await store.appendMany([{ record: makeRecord(1) }, { record: makeRecord(1) }]);
    expect(result.ok).toBe(false); expect(await store.all()).toHaveLength(0); await store.close();
  });
  it("commits the canonical batch and command receipt once, then replays the response", async () => {
    const store = await repository();
    const receipts = store.receiptStore();
    let calls = 0;
    const operation = async () => {
      calls += 1;
      const appended = await store.append({ record: makeRecord(1) });
      expect(appended.ok).toBe(true);
      return { statusCode: 200, body: { ok: true, version: 1 }, transactionalAuditEvent: { commandId: "command-one", outcome: "accepted" } };
    };
    const digest = "a".repeat(64);
    expect(await receipts.execute("command-one", digest, operation)).toEqual({ replayed: false, statusCode: 200, body: { ok: true, version: 1 } });
    expect(await receipts.execute("command-one", digest, operation)).toEqual({ replayed: true, statusCode: 200, body: { ok: true, version: 1 } });
    expect(calls).toBe(1);
    expect(await store.all()).toHaveLength(1);
    expect(await store.check()).toEqual({ ok: true, detail: "1 canonical versions, 1 committed command receipts, and 1 transactional audit events reachable" });
    expect(await store.transactionalAuditEvents()).toEqual([{ commandId: "command-one", outcome: "accepted" }]);
    expect((await receipts.execute("command-one", "b".repeat(64), operation)).statusCode).toBe(409);
    expect(calls).toBe(1);
    await store.close();
  });
  it("issues rollback when receipt commit fails", async () => {
    const statements: string[] = [];
    const store = await repository(statements);
    const receipts = store.receiptStore({ afterOperationBeforeCommit: () => { throw new Error("injected failure"); } });
    await expect(receipts.execute("command-failure", "c".repeat(64), async () => {
      expect((await store.append({ record: makeRecord(1) })).ok).toBe(true);
      return { statusCode: 200, body: { ok: true }, transactionalAuditEvent: { commandId: "command-failure", outcome: "accepted" } };
    })).rejects.toThrow("injected failure");
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some((statement) => statement.startsWith("INSERT INTO originos_canonical_records"))).toBe(true);
    expect(statements).toContain("INSERT INTO originos_transactional_audit_events (idempotency_key, event) VALUES ($1, $2::jsonb)");
    expect(statements).not.toContain("COMMIT");
    await store.close();
  });
});
