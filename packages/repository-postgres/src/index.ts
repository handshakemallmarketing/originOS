import { canonicalError, type CanonicalId, type CanonicalRecord, type Result } from "@originos/canonical-types";
import type { AppendRequest, CanonicalRepository } from "@originos/repository";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type PoolConfig, type QueryResult } from "pg";

export interface SqlQueryable { query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>> }
export interface SqlPool extends SqlQueryable { connect(): Promise<PoolClient>; end(): Promise<void> }
export interface PostgresReceiptStoreOptions { readonly afterOperationBeforeCommit?: () => void | Promise<void> }
export interface PostgresReceiptExecution { readonly replayed: boolean; readonly statusCode: number; readonly body: unknown }
export interface PostgresReceiptOperationResult extends Omit<PostgresReceiptExecution, "replayed"> { readonly transactionalAuditEvent?: unknown }
const frozen = <T>(value: T): T => Object.freeze(structuredClone(value));
const absent = (id: CanonicalId): Result<CanonicalRecord> => ({ ok: false, error: canonicalError("C2C_E011_IDENTITY_AMBIGUOUS", "Canonical identity is not present", [], { id }) });

export class PostgresCanonicalRepository implements CanonicalRepository {
  readonly #pool: SqlPool;
  readonly #transaction = new AsyncLocalStorage<PoolClient>();
  constructor(config: PoolConfig | SqlPool) { this.#pool = "connect" in config ? config : new Pool(config); }

  async migrate(): Promise<void> {
    await this.#pool.query(`CREATE TABLE IF NOT EXISTS originos_canonical_records (
      canonical_id text NOT NULL,
      record_version integer NOT NULL CHECK (record_version > 0),
      canonical_type text NOT NULL,
      record jsonb NOT NULL,
      inserted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (canonical_id, record_version)
    )`);
    await this.#pool.query("CREATE INDEX IF NOT EXISTS originos_canonical_records_type_idx ON originos_canonical_records (canonical_type)");
    await this.#pool.query(`CREATE TABLE IF NOT EXISTS originos_command_receipts (
      idempotency_key text PRIMARY KEY,
      request_digest text NOT NULL,
      state text NOT NULL CHECK (state IN ('pending', 'committed')),
      status_code integer,
      response_body jsonb,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK ((state = 'pending' AND status_code IS NULL) OR (state = 'committed' AND status_code IS NOT NULL))
    )`);
    await this.#pool.query(`CREATE TABLE IF NOT EXISTS originos_transactional_audit_events (
      sequence bigserial PRIMARY KEY,
      idempotency_key text NOT NULL UNIQUE REFERENCES originos_command_receipts(idempotency_key),
      event jsonb NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  async append(request: AppendRequest): Promise<Result<CanonicalRecord>> {
    const result = await this.appendMany([request]); return result.ok ? { ok: true, value: result.value[0]! } : result;
  }

  async appendMany(requests: readonly AppendRequest[]): Promise<Result<readonly CanonicalRecord[]>> {
    if (requests.length === 0) return { ok: true, value: Object.freeze([]) };
    const contextualClient = this.#transaction.getStore();
    const client = contextualClient ?? await this.#pool.connect();
    try {
      if (!contextualClient) { await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE"); await client.query("SELECT pg_advisory_xact_lock(741387)"); }
      const currentById = new Map<string, CanonicalRecord>();
      const ids = [...new Set(requests.map(({ record }) => record.canonicalId))];
      const current = await client.query<{ canonical_id: string; record: CanonicalRecord }>(`SELECT DISTINCT ON (canonical_id) canonical_id, record
        FROM originos_canonical_records WHERE canonical_id = ANY($1::text[]) ORDER BY canonical_id, record_version DESC`, [ids]);
      for (const row of current.rows) currentById.set(row.canonical_id, row.record);
      const stored: CanonicalRecord[] = [];
      for (const { record, expectedCurrentVersion } of requests) {
        const prior = currentById.get(record.canonicalId);
        if (expectedCurrentVersion !== undefined && prior?.recordVersion !== expectedCurrentVersion) {
          if (!contextualClient) await client.query("ROLLBACK");
          return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Expected version does not match current version", [], { expectedCurrentVersion, actualCurrentVersion: prior?.recordVersion }) };
        }
        const expectedNext = (prior?.recordVersion ?? 0) + 1;
        if (record.recordVersion !== expectedNext || (prior && record.predecessorVersion !== prior.recordVersion)) {
          if (!contextualClient) await client.query("ROLLBACK");
          return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Record does not extend the current immutable version", [], { expectedNext, supplied: record.recordVersion }) };
        }
        const copy = frozen(record); currentById.set(record.canonicalId, copy); stored.push(copy);
      }
      for (const record of stored) await client.query("INSERT INTO originos_canonical_records (canonical_id, record_version, canonical_type, record) VALUES ($1, $2, $3, $4::jsonb)", [record.canonicalId, record.recordVersion, record.canonicalType, JSON.stringify(record)]);
      if (!contextualClient) await client.query("COMMIT");
      return { ok: true, value: Object.freeze(stored) };
    } catch (error) {
      if (!contextualClient) try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "PostgreSQL canonical transaction could not be committed", [], { cause: error instanceof Error ? error.message : "database failure" }) };
    } finally { if (!contextualClient) client.release(); }
  }

  async current(id: CanonicalId): Promise<Result<CanonicalRecord>> {
    const result = await this.#query<{ record: CanonicalRecord }>("SELECT record FROM originos_canonical_records WHERE canonical_id = $1 ORDER BY record_version DESC LIMIT 1", [id]);
    return result.rows[0] ? { ok: true, value: frozen(result.rows[0].record) } : absent(id);
  }
  async history(id: CanonicalId): Promise<readonly CanonicalRecord[]> {
    const result = await this.#query<{ record: CanonicalRecord }>("SELECT record FROM originos_canonical_records WHERE canonical_id = $1 ORDER BY record_version", [id]);
    return Object.freeze(result.rows.map(({ record }) => frozen(record)));
  }
  async all(): Promise<readonly CanonicalRecord[]> {
    const result = await this.#query<{ record: CanonicalRecord }>("SELECT record FROM originos_canonical_records ORDER BY canonical_id, record_version");
    return Object.freeze(result.rows.map(({ record }) => frozen(record)));
  }
  async check(): Promise<{ readonly ok: boolean; readonly detail: string }> {
    try {
      const canonical = await this.#pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM originos_canonical_records");
      const receipts = await this.#pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM originos_command_receipts WHERE state = 'committed'");
      const audit = await this.#pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM originos_transactional_audit_events");
      return { ok: true, detail: `${canonical.rows[0]?.count ?? "0"} canonical versions, ${receipts.rows[0]?.count ?? "0"} committed command receipts, and ${audit.rows[0]?.count ?? "0"} transactional audit events reachable` };
    }
    catch (error) { return { ok: false, detail: error instanceof Error ? error.message : "database unavailable" }; }
  }
  async transactionalAuditEvents(): Promise<readonly unknown[]> {
    const result = await this.#pool.query<{ event: unknown }>("SELECT event FROM originos_transactional_audit_events ORDER BY sequence");
    return Object.freeze(result.rows.map(({ event }) => frozen(event)));
  }
  close(): Promise<void> { return this.#pool.end(); }
  #query<T extends Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>> {
    const client = this.#transaction.getStore();
    return client ? client.query<T>(text, [...(values ?? [])]) : this.#pool.query<T>(text, values);
  }
  receiptStore(options: PostgresReceiptStoreOptions = {}): PostgresCommandReceiptStore { return new PostgresCommandReceiptStore(this.#pool, this.#transaction, options); }
}

export class PostgresCommandReceiptStore {
  constructor(readonly pool: SqlPool, readonly transaction: AsyncLocalStorage<PoolClient>, readonly options: PostgresReceiptStoreOptions = {}) {}
  async execute(key: string, digest: string, operation: () => Promise<PostgresReceiptOperationResult>): Promise<PostgresReceiptExecution> {
    if (!key.trim()) throw new Error("Idempotency key is required");
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Request digest must be a lowercase SHA-256 hex string");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock(741387)");
      const found = await client.query<{ request_digest: string; state: string; status_code: number | null; response_body: unknown }>("SELECT request_digest, state, status_code, response_body FROM originos_command_receipts WHERE idempotency_key = $1 FOR UPDATE", [key]);
      const existing = found.rows[0];
      if (existing?.request_digest !== undefined && existing.request_digest !== digest) {
        await client.query("ROLLBACK");
        return { replayed: false, statusCode: 409, body: { ok: false, error: { code: "C2C_E009_CONFLICT_UNRESOLVED", message: "Idempotency key was already used for a different command" } } };
      }
      if (existing?.state === "committed") {
        await client.query("COMMIT");
        return { replayed: true, statusCode: existing.status_code ?? 500, body: existing.response_body };
      }
      if (!existing) await client.query("INSERT INTO originos_command_receipts (idempotency_key, request_digest, state) VALUES ($1, $2, 'pending')", [key, digest]);
      const { transactionalAuditEvent, ...result } = await this.transaction.run(client, operation);
      if (transactionalAuditEvent !== undefined) await client.query("INSERT INTO originos_transactional_audit_events (idempotency_key, event) VALUES ($1, $2::jsonb)", [key, JSON.stringify(transactionalAuditEvent)]);
      await this.options.afterOperationBeforeCommit?.();
      await client.query("UPDATE originos_command_receipts SET state = 'committed', status_code = $2, response_body = $3::jsonb, updated_at = CURRENT_TIMESTAMP WHERE idempotency_key = $1", [key, result.statusCode, JSON.stringify(result.body)]);
      await client.query("COMMIT");
      return { replayed: false, ...result };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }
}
