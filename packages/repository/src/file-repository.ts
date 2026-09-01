import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalError, type CanonicalId, type CanonicalRecord, type Result } from "@originos/canonical-types";
import { exportCanonicalBundle, importCanonicalBundle, InMemoryCanonicalRepository, type AppendRequest, type CanonicalRepository } from "./index.js";

export class JsonFileCanonicalRepository implements CanonicalRepository {
  #memory = new InMemoryCanonicalRepository();
  #loaded = false;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async #load(): Promise<Result<true>> {
    if (this.#loaded) return { ok: true, value: true };
    let serialized: string;
    try { serialized = await readFile(this.filePath, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") { this.#loaded = true; return { ok: true, value: true }; }
      return { ok: false, error: canonicalError("C2C_E004_PROVENANCE_MISSING", "Canonical store could not be read", [], { filePath: this.filePath }) };
    }
    const imported = importCanonicalBundle(serialized);
    if (!imported.ok) return imported;
    for (const record of imported.value.records) {
      const appended = await this.#memory.append({ record });
      if (!appended.ok) return appended;
    }
    this.#loaded = true;
    return { ok: true, value: true };
  }

  async #persist(records = this.#memory.all()): Promise<Result<true>> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, exportCanonicalBundle(await records), "utf8");
      await rename(temporaryPath, this.filePath);
      return { ok: true, value: true };
    } catch {
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Canonical store could not be committed atomically", [], { filePath: this.filePath }) };
    }
  }

  async append(request: AppendRequest): Promise<Result<CanonicalRecord>> {
    const result = await this.appendMany([request]);
    return result.ok ? { ok: true, value: result.value[0]! } : result;
  }

  async appendMany(requests: readonly AppendRequest[]): Promise<Result<readonly CanonicalRecord[]>> {
    const operation = this.#queue.then(async () => {
      const loaded = await this.#load();
      if (!loaded.ok) return loaded;
      const staged = new InMemoryCanonicalRepository();
      for (const record of await this.#memory.all()) {
        const copied = await staged.append({ record });
        if (!copied.ok) return copied;
      }
      const appended = await staged.appendMany(requests);
      if (!appended.ok) return appended;
      const persisted = await this.#persist(staged.all());
      if (!persisted.ok) return persisted;
      this.#memory = staged;
      return appended;
    });
    this.#queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async current(id: CanonicalId): Promise<Result<CanonicalRecord>> {
    await this.#queue;
    const loaded = await this.#load();
    return loaded.ok ? this.#memory.current(id) : loaded;
  }

  async history(id: CanonicalId): Promise<readonly CanonicalRecord[]> {
    await this.#queue;
    const loaded = await this.#load();
    return loaded.ok ? this.#memory.history(id) : [];
  }

  async all(): Promise<readonly CanonicalRecord[]> {
    await this.#queue;
    const loaded = await this.#load();
    return loaded.ok ? this.#memory.all() : [];
  }
}
