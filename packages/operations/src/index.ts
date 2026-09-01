import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { importCanonicalBundle } from "@originos/repository";

const managedFiles = ["canonical-store.json", "command-receipts.json", "audit-log.jsonl"] as const;
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const readOptional = async (path: string): Promise<string | undefined> => {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
};
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const lockName = "service.lock";
const pidIsActive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } };
const removeStaleLock = async (dataDirectory: string): Promise<void> => {
  const path = join(dataDirectory, lockName);
  const serialized = await readOptional(path); if (serialized === undefined) return;
  let pid = -1; try { const parsed = JSON.parse(serialized) as { pid?: unknown }; if (typeof parsed.pid === "number") pid = parsed.pid; } catch { /* malformed lock is treated as stale */ }
  if (pid > 0 && pidIsActive(pid)) throw new Error(`OriginOS service is running with pid ${pid}; stop it before backup or restore`);
  await unlink(path);
};

export const acquireOperationalLock = async (dataDirectory: string): Promise<() => Promise<void>> => {
  await mkdir(dataDirectory, { recursive: true }); await removeStaleLock(dataDirectory);
  const path = join(dataDirectory, lockName); const token = randomUUID();
  try { await writeFile(path, JSON.stringify({ version: 1, pid: process.pid, token, startedAt: new Date().toISOString() }), { encoding: "utf8", flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("OriginOS data directory is already locked"); throw error; }
  return async () => {
    const serialized = await readOptional(path); if (serialized === undefined) return;
    const parsed = JSON.parse(serialized) as { token?: unknown };
    if (parsed.token !== token) throw new Error("OriginOS operational lock ownership changed");
    await unlink(path);
  };
};

export interface IntegrityCheck { readonly name: string; readonly ok: boolean; readonly detail: string }
export interface IntegrityReport { readonly ok: boolean; readonly checks: readonly IntegrityCheck[] }

const checkReceipts = (serialized: string): IntegrityCheck => {
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.receipts)) throw new Error("invalid receipt envelope");
    const keys = new Set<string>();
    for (const item of value.receipts) {
      if (!isObject(item) || typeof item.key !== "string" || !/^[a-f0-9]{64}$/.test(String(item.requestDigest)) || (item.state !== undefined && item.state !== "pending" && item.state !== "committed")) throw new Error("invalid receipt entry");
      if (keys.has(item.key)) throw new Error("duplicate receipt key");
      keys.add(item.key);
      if ((item.state === "committed" || item.state === undefined) && typeof item.statusCode !== "number") throw new Error("committed receipt lacks status");
    }
    return { name: "command-receipts", ok: true, detail: `${value.receipts.length} receipts verified` };
  } catch (error) { return { name: "command-receipts", ok: false, detail: error instanceof Error ? error.message : "invalid receipts" }; }
};

export interface AuditEvent { readonly event: string; readonly commandId?: string; readonly commandType?: string; readonly statusCode: number; readonly replayed?: boolean; readonly outcome: string }
export interface AuditEntry extends AuditEvent { readonly version: 1; readonly sequence: number; readonly timestamp: string; readonly previousHash: string; readonly hash: string }
const auditHash = (entry: Omit<AuditEntry, "hash">): string => sha256(JSON.stringify(entry));

export const verifyAuditLog = (serialized: string): IntegrityCheck => {
  try {
    const lines = serialized.trim() === "" ? [] : serialized.trimEnd().split("\n");
    let previousHash = "GENESIS";
    lines.forEach((line, index) => {
      const entry = JSON.parse(line) as AuditEntry;
      const { hash, ...unsigned } = entry;
      if (entry.version !== 1 || entry.sequence !== index + 1 || entry.previousHash !== previousHash || hash !== auditHash(unsigned)) throw new Error(`audit chain invalid at sequence ${index + 1}`);
      previousHash = hash;
    });
    return { name: "audit-log", ok: true, detail: `${lines.length} chained entries verified` };
  } catch (error) { return { name: "audit-log", ok: false, detail: error instanceof Error ? error.message : "invalid audit log" }; }
};

export class JsonlAuditLog {
  #queue: Promise<unknown> = Promise.resolve();
  #state: { sequence: number; hash: string } | undefined;
  constructor(readonly filePath: string, readonly now: () => Date = () => new Date()) {}
  async #load(): Promise<{ sequence: number; hash: string }> {
    if (this.#state) return this.#state;
    const serialized = await readOptional(this.filePath) ?? "";
    const verified = verifyAuditLog(serialized);
    if (!verified.ok) throw new Error(verified.detail);
    const lines = serialized.trim() === "" ? [] : serialized.trimEnd().split("\n");
    const last = lines.length ? JSON.parse(lines.at(-1)!) as AuditEntry : undefined;
    return this.#state = { sequence: lines.length, hash: last?.hash ?? "GENESIS" };
  }
  record(event: AuditEvent): Promise<void> {
    const operation = this.#queue.then(async () => {
      const state = await this.#load();
      const unsigned: Omit<AuditEntry, "hash"> = { version: 1, sequence: state.sequence + 1, timestamp: this.now().toISOString(), previousHash: state.hash, ...event };
      const entry: AuditEntry = { ...unsigned, hash: auditHash(unsigned) };
      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
      this.#state = { sequence: entry.sequence, hash: entry.hash };
    });
    this.#queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

export const checkDataIntegrity = async (dataDirectory: string): Promise<IntegrityReport> => {
  const checks: IntegrityCheck[] = [];
  const canonical = await readOptional(join(dataDirectory, managedFiles[0]));
  if (canonical === undefined) checks.push({ name: "canonical-store", ok: true, detail: "not initialized" });
  else { const imported = importCanonicalBundle(canonical); checks.push(imported.ok ? { name: "canonical-store", ok: true, detail: `${imported.value.records.length} records verified` } : { name: "canonical-store", ok: false, detail: imported.error.message }); }
  const receipts = await readOptional(join(dataDirectory, managedFiles[1]));
  checks.push(receipts === undefined ? { name: "command-receipts", ok: true, detail: "not initialized" } : checkReceipts(receipts));
  const audit = await readOptional(join(dataDirectory, managedFiles[2]));
  checks.push(audit === undefined ? { name: "audit-log", ok: true, detail: "not initialized" } : verifyAuditLog(audit));
  return { ok: checks.every((check) => check.ok), checks };
};

interface BackupFile { readonly name: typeof managedFiles[number]; readonly bytes: number; readonly sha256: string; readonly content: string }
interface BackupBundle { readonly format: "OriginOS-Operational-Backup"; readonly version: 1; readonly createdAt: string; readonly files: readonly BackupFile[] }

const validateBackup = (value: unknown): BackupBundle => {
  if (!isObject(value) || value.format !== "OriginOS-Operational-Backup" || value.version !== 1 || typeof value.createdAt !== "string" || !Array.isArray(value.files)) throw new Error("invalid backup envelope");
  const names = new Set<string>();
  for (const file of value.files) {
    if (!isObject(file) || !managedFiles.includes(file.name as typeof managedFiles[number]) || typeof file.content !== "string" || typeof file.bytes !== "number" || typeof file.sha256 !== "string") throw new Error("invalid backup file entry");
    if (names.has(String(file.name))) throw new Error("duplicate backup file"); names.add(String(file.name));
    if (Buffer.byteLength(file.content) !== file.bytes || sha256(file.content) !== file.sha256) throw new Error(`backup hash mismatch for ${String(file.name)}`);
  }
  return value as unknown as BackupBundle;
};

export const createOperationalBackup = async (dataDirectory: string, backupPath: string, now = new Date()): Promise<BackupBundle> => {
  await removeStaleLock(dataDirectory);
  const integrity = await checkDataIntegrity(dataDirectory);
  if (!integrity.ok) throw new Error("source data failed integrity checks");
  const files: BackupFile[] = [];
  for (const name of managedFiles) { const content = await readOptional(join(dataDirectory, name)); if (content !== undefined) files.push({ name, bytes: Buffer.byteLength(content), sha256: sha256(content), content }); }
  const bundle: BackupBundle = { format: "OriginOS-Operational-Backup", version: 1, createdAt: now.toISOString(), files };
  await mkdir(dirname(backupPath), { recursive: true });
  const temporary = `${backupPath}.tmp`; await writeFile(temporary, JSON.stringify(bundle), "utf8"); await rename(temporary, backupPath);
  return bundle;
};

export const restoreOperationalBackup = async (backupPath: string, dataDirectory: string): Promise<{ readonly rollbackDirectory?: string }> => {
  await removeStaleLock(dataDirectory);
  const bundle = validateBackup(JSON.parse(await readFile(backupPath, "utf8")) as unknown);
  const parent = dirname(dataDirectory); await mkdir(parent, { recursive: true });
  const stage = join(parent, `.originos-restore-${randomUUID()}`); await mkdir(stage);
  for (const file of bundle.files) await writeFile(join(stage, file.name), file.content, "utf8");
  const stagedIntegrity = await checkDataIntegrity(stage); if (!stagedIntegrity.ok) throw new Error("staged restore failed integrity checks");
  let rollbackDirectory: string | undefined;
  try { const entries = await readdir(dataDirectory); if (entries.length >= 0) { rollbackDirectory = join(parent, `.originos-pre-restore-${randomUUID()}`); await rename(dataDirectory, rollbackDirectory); } }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await rename(stage, dataDirectory);
  return rollbackDirectory ? { rollbackDirectory } : {};
};
