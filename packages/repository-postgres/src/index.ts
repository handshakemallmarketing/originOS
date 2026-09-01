import { canonicalError, type CanonicalId, type CanonicalRecord, type Result } from "@originos/canonical-types";
import type { AppendRequest, CanonicalRepository } from "@originos/repository";
import { Pool, type PoolClient, type PoolConfig, type QueryResult } from "pg";

export interface SqlQueryable { query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>> }
export interface SqlPool extends SqlQueryable { connect(): Promise<PoolClient>; end(): Promise<void> }
const frozen = <T>(value: T): T => Object.freeze(structuredClone(value));
const absent = (id: CanonicalId): Result<CanonicalRecord> => ({ ok: false, error: canonicalError("C2C_E011_IDENTITY_AMBIGUOUS", "Canonical identity is not present", [], { id }) });

export class PostgresCanonicalRepository implements CanonicalRepository {
  readonly #pool: SqlPool;
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
  }

  async append(request: AppendRequest): Promise<Result<CanonicalRecord>> {
    const result = await this.appendMany([request]); return result.ok ? { ok: true, value: result.value[0]! } : result;
  }

  async appendMany(requests: readonly AppendRequest[]): Promise<Result<readonly CanonicalRecord[]>> {
    if (requests.length === 0) return { ok: true, value: Object.freeze([]) };
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock(741387)");
      const currentById = new Map<string, CanonicalRecord>();
      const ids = [...new Set(requests.map(({ record }) => record.canonicalId))];
      const current = await client.query<{ canonical_id: string; record: CanonicalRecord }>(`SELECT DISTINCT ON (canonical_id) canonical_id, record
        FROM originos_canonical_records WHERE canonical_id = ANY($1::text[]) ORDER BY canonical_id, record_version DESC`, [ids]);
      for (const row of current.rows) currentById.set(row.canonical_id, row.record);
      const stored: CanonicalRecord[] = [];
      for (const { record, expectedCurrentVersion } of requests) {
        const prior = currentById.get(record.canonicalId);
        if (expectedCurrentVersion !== undefined && prior?.recordVersion !== expectedCurrentVersion) {
          await client.query("ROLLBACK");
          return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Expected version does not match current version", [], { expectedCurrentVersion, actualCurrentVersion: prior?.recordVersion }) };
        }
        const expectedNext = (prior?.recordVersion ?? 0) + 1;
        if (record.recordVersion !== expectedNext || (prior && record.predecessorVersion !== prior.recordVersion)) {
          await client.query("ROLLBACK");
          return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Record does not extend the current immutable version", [], { expectedNext, supplied: record.recordVersion }) };
        }
        const copy = frozen(record); currentById.set(record.canonicalId, copy); stored.push(copy);
      }
      for (const record of stored) await client.query("INSERT INTO originos_canonical_records (canonical_id, record_version, canonical_type, record) VALUES ($1, $2, $3, $4::jsonb)", [record.canonicalId, record.recordVersion, record.canonicalType, JSON.stringify(record)]);
      await client.query("COMMIT");
      return { ok: true, value: Object.freeze(stored) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "PostgreSQL canonical transaction could not be committed", [], { cause: error instanceof Error ? error.message : "database failure" }) };
    } finally { client.release(); }
  }

  async current(id: CanonicalId): Promise<Result<CanonicalRecord>> {
    const result = await this.#pool.query<{ record: CanonicalRecord }>("SELECT record FROM originos_canonical_records WHERE canonical_id = $1 ORDER BY record_version DESC LIMIT 1", [id]);
    return result.rows[0] ? { ok: true, value: frozen(result.rows[0].record) } : absent(id);
  }
  async history(id: CanonicalId): Promise<readonly CanonicalRecord[]> {
    const result = await this.#pool.query<{ record: CanonicalRecord }>("SELECT record FROM originos_canonical_records WHERE canonical_id = $1 ORDER BY record_version", [id]);
    return Object.freeze(result.rows.map(({ record }) => frozen(record)));
  }
  async all(): Promise<readonly CanonicalRecord[]> {
    const result = await this.#pool.query<{ record: CanonicalRecord }>("SELECT record FROM originos_canonical_records ORDER BY canonical_id, record_version");
    return Object.freeze(result.rows.map(({ record }) => frozen(record)));
  }
  async check(): Promise<{ readonly ok: boolean; readonly detail: string }> {
    try { const result = await this.#pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM originos_canonical_records"); return { ok: true, detail: `${result.rows[0]?.count ?? "0"} canonical versions reachable` }; }
    catch (error) { return { ok: false, detail: error instanceof Error ? error.message : "database unavailable" }; }
  }
  close(): Promise<void> { return this.#pool.end(); }
}
