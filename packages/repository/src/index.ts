import { canonicalError, type CanonicalId, type CanonicalRecord, type RecordVersion, type Result } from "@originos/canonical-types";

export interface AppendRequest { readonly record: CanonicalRecord; readonly expectedCurrentVersion?: RecordVersion }
export interface CanonicalRepository {
  append(request: AppendRequest): Promise<Result<CanonicalRecord>>;
  appendMany(requests: readonly AppendRequest[]): Promise<Result<readonly CanonicalRecord[]>>;
  current(id: CanonicalId): Promise<Result<CanonicalRecord>>;
  history(id: CanonicalId): Promise<readonly CanonicalRecord[]>;
  all(): Promise<readonly CanonicalRecord[]>;
}

export interface CanonicalBundle {
  readonly profile: "OriginOS-Software-Sprint-0";
  readonly schemaVersion: "0.1.0";
  readonly records: readonly CanonicalRecord[];
}

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
};

export const exportCanonicalBundle = (records: readonly CanonicalRecord[]): string => JSON.stringify(stable({
  profile: "OriginOS-Software-Sprint-0", schemaVersion: "0.1.0", records
} satisfies CanonicalBundle));

export const importCanonicalBundle = (serialized: string): Result<CanonicalBundle> => {
  let candidate: unknown;
  try { candidate = JSON.parse(serialized); }
  catch { return { ok: false, error: canonicalError("C2C_E001_TYPE_MISMATCH", "Canonical bundle is not valid JSON", ["C2C-INV-020"]) }; }
  const bundle = candidate as Partial<CanonicalBundle>;
  if (bundle.profile !== "OriginOS-Software-Sprint-0" || bundle.schemaVersion !== "0.1.0" || !Array.isArray(bundle.records)) {
    return { ok: false, error: canonicalError("C2C_E001_TYPE_MISMATCH", "Canonical bundle envelope is invalid", ["C2C-INV-020"]) };
  }
  const invalid = bundle.records.some((record) => !record.canonicalId || !record.canonicalType || !record.recordVersion || !record.assertionStatus || !record.scope?.contextRef || !record.provenance?.producerRef);
  return invalid
    ? { ok: false, error: canonicalError("C2C_E006_INVARIANT_VIOLATION", "Canonical bundle contains an incomplete record", ["C2C-INV-001", "C2C-INV-020"]) }
    : { ok: true, value: deepFreeze(bundle as CanonicalBundle) };
};

export const semanticallyEquivalent = (left: readonly CanonicalRecord[], right: readonly CanonicalRecord[]): boolean =>
  JSON.stringify(stable(left)) === JSON.stringify(stable(right));

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
};

export class InMemoryCanonicalRepository implements CanonicalRepository {
  readonly #records = new Map<CanonicalId, CanonicalRecord[]>();

  async append(request: AppendRequest): Promise<Result<CanonicalRecord>> {
    const result = await this.appendMany([request]);
    return result.ok ? { ok: true, value: result.value[0]! } : result;
  }

  async appendMany(requests: readonly AppendRequest[]): Promise<Result<readonly CanonicalRecord[]>> {
    const staged = new Map([...this.#records].map(([id, history]) => [id, [...history]]));
    const storedRecords: CanonicalRecord[] = [];
    for (const { record, expectedCurrentVersion } of requests) {
    const history = staged.get(record.canonicalId) ?? [];
    const current = history.at(-1);
    if (expectedCurrentVersion !== undefined && current?.recordVersion !== expectedCurrentVersion) {
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Expected version does not match current version", [], { expectedCurrentVersion, actualCurrentVersion: current?.recordVersion }) };
    }
    const expectedNext = (current?.recordVersion ?? 0) + 1;
    if (record.recordVersion !== expectedNext) {
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Record version is not the next immutable version", [], { expectedNext, supplied: record.recordVersion }) };
    }
    if (current && record.predecessorVersion !== current.recordVersion) {
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Predecessor version does not reference current version") };
    }
    const stored = deepFreeze(structuredClone(record));
    staged.set(record.canonicalId, [...history, stored]);
    storedRecords.push(stored);
    }
    this.#records.clear();
    for (const [id, history] of staged) this.#records.set(id, history);
    return { ok: true, value: Object.freeze(storedRecords) };
  }

  async current(id: CanonicalId): Promise<Result<CanonicalRecord>> {
    const record = this.#records.get(id)?.at(-1);
    return record ? { ok: true, value: record } : { ok: false, error: canonicalError("C2C_E011_IDENTITY_AMBIGUOUS", "Canonical identity is not present", [], { id }) };
  }

  async history(id: CanonicalId): Promise<readonly CanonicalRecord[]> {
    return Object.freeze([...(this.#records.get(id) ?? [])]);
  }

  async all(): Promise<readonly CanonicalRecord[]> {
    return Object.freeze([...this.#records.values()].flatMap((history) => history));
  }
}

export { JsonFileCanonicalRepository } from "./file-repository.js";
