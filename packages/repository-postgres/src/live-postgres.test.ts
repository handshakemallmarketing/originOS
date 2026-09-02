import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { canonicalId, instant, recordVersion, type CanonicalRecord } from "@originos/canonical-types";
import { PostgresCanonicalRepository } from "./index.js";

const databaseUrl = process.env.ORIGINOS_TEST_DATABASE_URL;
const liveDescribe = databaseUrl ? describe : describe.skip;
const record = (id: string): CanonicalRecord => ({
  canonicalId: canonicalId(`originos:${id}`), canonicalType: "live-postgres-certification", schemaVersion: "1.0.0",
  recordVersion: recordVersion(1), lifecycleStatus: "active", assertionStatus: "known",
  scope: { contextRef: canonicalId("originos:live-postgres-certification"), boundaryRefs: [] },
  time: { validTime: { from: instant("2026-09-02T00:00:00Z") }, recordedTime: instant("2026-09-02T00:00:00Z") },
  provenance: { sourceRefs: [canonicalId("originos:live-postgres-evidence")], producerRef: canonicalId("originos:live-postgres-test") },
  reason: "live PostgreSQL certification", content: { id }
});

liveDescribe("live PostgreSQL transaction certification", () => {
  it("proves migration, rollback, restart, replay, concurrency, and audit completeness", async () => {
    if (!databaseUrl) throw new Error("ORIGINOS_TEST_DATABASE_URL is required");
    const administration = new Pool({ connectionString: databaseUrl });
    await administration.query("DROP TABLE IF EXISTS originos_transactional_audit_events, originos_command_receipts, originos_canonical_records CASCADE");

    let store = new PostgresCanonicalRepository({ connectionString: databaseUrl });
    await store.migrate();
    await store.migrate();

    const failingReceipts = store.receiptStore({ afterOperationBeforeCommit: () => { throw new Error("live injected failure"); } });
    await expect(failingReceipts.execute("live-rollback", "a".repeat(64), async () => {
      const appended = await store.append({ record: record("live-rollback") });
      expect(appended.ok).toBe(true);
      return { statusCode: 201, body: appended, transactionalAuditEvent: { commandId: "live-rollback", outcome: "accepted" } };
    })).rejects.toThrow("live injected failure");
    expect(await store.all()).toHaveLength(0);
    expect(await store.transactionalAuditEvents()).toHaveLength(0);
    expect(await store.check()).toEqual({ ok: true, detail: "0 canonical versions, 0 committed command receipts, and 0 transactional audit events reachable" });

    let operationCalls = 0;
    const receipts = store.receiptStore();
    const committed = async () => {
      operationCalls += 1;
      const appended = await store.append({ record: record("live-committed") });
      expect(appended.ok).toBe(true);
      return { statusCode: 201, body: { ok: true }, transactionalAuditEvent: { commandId: "live-committed", outcome: "accepted" } };
    };
    expect((await receipts.execute("live-committed", "b".repeat(64), committed)).replayed).toBe(false);
    expect((await receipts.execute("live-committed", "b".repeat(64), committed)).replayed).toBe(true);
    expect(operationCalls).toBe(1);
    expect(await store.transactionalAuditEvents()).toEqual([{ commandId: "live-committed", outcome: "accepted" }]);

    await store.close();
    store = new PostgresCanonicalRepository({ connectionString: databaseUrl });
    await store.migrate();
    expect(await store.all()).toHaveLength(1);
    expect((await store.receiptStore().execute("live-committed", "b".repeat(64), committed)).replayed).toBe(true);
    expect(await store.transactionalAuditEvents()).toHaveLength(1);

    await administration.query("TRUNCATE originos_transactional_audit_events, originos_command_receipts, originos_canonical_records RESTART IDENTITY CASCADE");
    const compete = (key: string) => store.receiptStore().execute(key, key === "live-race-a" ? "c".repeat(64) : "d".repeat(64), async () => {
      const appended = await store.append({ record: record("live-race-record") });
      const statusCode = appended.ok ? 201 : 409;
      return { statusCode, body: appended, transactionalAuditEvent: { commandId: key, outcome: appended.ok ? "accepted" : "rejected" } };
    });
    const concurrent = await Promise.all([compete("live-race-a"), compete("live-race-b")]);
    expect(concurrent.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    expect(await store.all()).toHaveLength(1);
    expect(await store.transactionalAuditEvents()).toHaveLength(2);
    expect(await store.check()).toEqual({ ok: true, detail: "1 canonical versions, 2 committed command receipts, and 2 transactional audit events reachable" });

    await store.close();
    await administration.end();
  }, 30_000);
});
