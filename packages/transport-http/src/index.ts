import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import type { ApplicationCommandEnvelope, OriginApplication } from "@originos/application";
import type { AuthenticatedPrincipal, RequestAuthenticator } from "@originos/auth";
import { canonicalId, type CanonicalErrorCode } from "@originos/canonical-types";
import { apiVersion, openApiDocument, validateApplicationCommandEnvelope } from "@originos/schemas";

export interface CommandReceipt { readonly key: string; readonly requestDigest: string; readonly state: "pending" | "committed"; readonly statusCode?: number; readonly body?: unknown }
interface ReceiptFile { readonly version: 1; readonly receipts: readonly CommandReceipt[] }
export interface ReceiptExecution { readonly replayed: boolean; readonly statusCode: number; readonly body: unknown }
export interface CommandReceiptStore { execute(key: string, digest: string, operation: () => Promise<Omit<ReceiptExecution, "replayed">>): Promise<ReceiptExecution> }
export interface ReceiptStoreOptions { readonly afterOperationBeforeCommit?: () => void | Promise<void> }
export interface TransportAuditEvent { readonly event: "command-request"; readonly principalId?: string; readonly commandId?: string; readonly commandType?: string; readonly statusCode: number; readonly replayed?: boolean; readonly outcome: string }
export interface OriginHttpOptions {
  readonly authenticator: RequestAuthenticator;
  readonly auditSink?: { record(event: TransportAuditEvent): Promise<void> };
  readonly readiness?: () => Promise<{ readonly ok: boolean; readonly checks: readonly unknown[] }>;
}

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
};
export const requestDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

export class JsonCommandReceiptStore implements CommandReceiptStore {
  #receipts: Map<string, CommandReceipt> | undefined;
  #queue: Promise<unknown> = Promise.resolve();
  constructor(readonly filePath: string, readonly options: ReceiptStoreOptions = {}) {}
  async #load(): Promise<Map<string, CommandReceipt>> {
    if (this.#receipts) return this.#receipts;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<ReceiptFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.receipts)) throw new Error("invalid receipt file");
      const normalized = parsed.receipts.map((receipt) => receipt.state ? receipt : { ...receipt, state: "committed" as const });
      this.#receipts = new Map(normalized.map((receipt) => [receipt.key, receipt]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.#receipts = new Map();
    }
    return this.#receipts;
  }
  async #persist(receipts: Map<string, CommandReceipt>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(stable({ version: 1, receipts: [...receipts.values()] } satisfies ReceiptFile)), "utf8");
    await rename(temporaryPath, this.filePath);
  }
  execute(key: string, digest: string, operation: () => Promise<Omit<ReceiptExecution, "replayed">>): Promise<ReceiptExecution> {
    const execution = this.#queue.then(async () => {
      const receipts = await this.#load();
      const existing = receipts.get(key);
      if (existing?.state === "committed") {
        if (existing.requestDigest !== digest) return { replayed: false, statusCode: 409, body: { ok: false, error: { code: "C2C_E009_CONFLICT_UNRESOLVED", message: "Idempotency key was already used for a different command" } } };
        return { replayed: true, statusCode: existing.statusCode ?? 500, body: existing.body };
      }
      if (existing && existing.requestDigest !== digest) return { replayed: false, statusCode: 409, body: { ok: false, error: { code: "C2C_E009_CONFLICT_UNRESOLVED", message: "Idempotency key was already used for a different command" } } };
      if (!existing) { receipts.set(key, { key, requestDigest: digest, state: "pending" }); await this.#persist(receipts); }
      const result = await operation();
      await this.options.afterOperationBeforeCommit?.();
      const receipt: CommandReceipt = { key, requestDigest: digest, state: "committed", statusCode: result.statusCode, body: result.body };
      receipts.set(key, receipt);
      try { await this.#persist(receipts); } catch (error) { receipts.delete(key); throw error; }
      return { replayed: existing?.state === "pending", ...result };
    });
    this.#queue = execution.then(() => undefined, () => undefined);
    return execution;
  }
}

const json = (response: ServerResponse, statusCode: number, body: unknown, headers: Readonly<Record<string, string>> = {}): void => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "x-originos-api-version": apiVersion, ...headers });
  response.end(JSON.stringify(body));
};
const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); length += buffer.length;
    if (length > 1_048_576) throw new Error("request body exceeds 1 MiB"); chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};
const statusFor = (code: CanonicalErrorCode): number => code === "C2C_E009_CONFLICT_UNRESOLVED" || code === "C2C_E010_TRANSITION_INVALID" ? 409 : code === "C2C_E005_AUTHORITY_INVALID" ? 403 : 400;

export const createOriginHttpServer = (application: OriginApplication, receipts: CommandReceiptStore, options: OriginHttpOptions): Server => createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://originos.local");
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });
    if (request.method === "GET" && url.pathname === "/ready") {
      const readiness = options.readiness ? await options.readiness() : { ok: true, checks: [] };
      return json(response, readiness.ok ? 200 : 503, readiness);
    }
    if (request.method === "GET" && url.pathname === "/openapi.json") return json(response, 200, openApiDocument);
    let principal: AuthenticatedPrincipal | undefined;
    if (url.pathname.startsWith("/v2/")) {
      const authentication = await options.authenticator.authenticate(typeof request.headers.authorization === "string" ? request.headers.authorization : undefined);
      if (!authentication.ok) {
        if (request.method === "POST" && url.pathname === "/v2/commands" && options.auditSink) try { await options.auditSink.record({ event: "command-request", statusCode: 401, outcome: "authentication-rejected" }); } catch { /* response remains authoritative */ }
        return json(response, 401, { ok: false, error: { code: "ORIGINOS_AUTH_001_UNAUTHENTICATED", message: "A valid Bearer API key is required" } }, { "www-authenticate": "Bearer", "cache-control": "no-store" });
      }
      principal = authentication.principal;
    }
    if (request.method === "POST" && url.pathname === "/v2/commands") {
      const audited = async (statusCode: number, body: unknown, event: TransportAuditEvent, headers: Readonly<Record<string, string>> = {}): Promise<void> => {
        let auditStatus = "not-configured";
        if (options.auditSink) { try { await options.auditSink.record(principal ? { ...event, principalId: principal.principalId } : event); auditStatus = "recorded"; } catch { auditStatus = "failed"; } }
        json(response, statusCode, body, { "x-originos-audit": auditStatus, ...headers });
      };
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || key.trim() === "") return audited(400, { ok: false, error: { code: "C2C_E001_TYPE_MISMATCH", message: "Idempotency-Key header is required" } }, { event: "command-request", statusCode: 400, outcome: "validation-rejected" });
      if (request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return audited(415, { ok: false, error: { code: "C2C_E001_TYPE_MISMATCH", message: "Content-Type must be application/json" } }, { event: "command-request", commandId: key, statusCode: 415, outcome: "media-rejected" });
      const validated = validateApplicationCommandEnvelope(await readJson(request));
      if (!validated.ok) return audited(400, { ok: false, error: { code: "C2C_E001_TYPE_MISMATCH", message: "Command envelope does not match API v2", details: { issues: validated.issues } } }, { event: "command-request", commandId: key, statusCode: 400, outcome: "schema-rejected" });
      const envelope = validated.value as ApplicationCommandEnvelope;
      if (!principal?.permittedAgentRefs.includes(envelope.agentRef)) return audited(403, { ok: false, error: { code: "ORIGINOS_AUTH_002_AGENT_BINDING_DENIED", message: "Authenticated principal is not bound to the declared Agent" } }, { event: "command-request", commandId: envelope.commandId, commandType: envelope.command.commandType, statusCode: 403, outcome: "agent-binding-rejected" }, { "cache-control": "no-store" });
      if (envelope.commandId !== key) return audited(400, { ok: false, error: { code: "C2C_E001_TYPE_MISMATCH", message: "Idempotency-Key must equal commandId" } }, { event: "command-request", commandId: envelope.commandId, commandType: envelope.command.commandType, statusCode: 400, outcome: "identity-rejected" });
      const execution = await receipts.execute(key, requestDigest(envelope), async () => {
        const result = await application.execute(envelope);
        return result.ok ? { statusCode: 201, body: result } : { statusCode: statusFor(result.error.code), body: result };
      });
      return audited(execution.statusCode, execution.body, { event: "command-request", commandId: envelope.commandId, commandType: envelope.command.commandType, statusCode: execution.statusCode, replayed: execution.replayed, outcome: execution.statusCode < 400 ? "accepted" : "application-rejected" }, { "idempotency-replayed": String(execution.replayed) });
    }
    if (request.method === "GET" && url.pathname === "/v2/records") return json(response, 200, { records: await application.all() }, { "cache-control": "no-store" });
    const historyMatch = /^\/v2\/records\/([^/]+)\/history$/.exec(url.pathname);
    if (request.method === "GET" && historyMatch?.[1]) return json(response, 200, { records: await application.history(canonicalId(decodeURIComponent(historyMatch[1]))) });
    const currentMatch = /^\/v2\/records\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && currentMatch?.[1]) {
      const result = await application.current(canonicalId(decodeURIComponent(currentMatch[1])));
      return json(response, result.ok ? 200 : 404, result);
    }
    return json(response, 404, { ok: false, error: { code: "C2C_E011_IDENTITY_AMBIGUOUS", message: "Route is not present" } });
  } catch (error) {
    return json(response, 400, { ok: false, error: { code: "C2C_E001_TYPE_MISMATCH", message: error instanceof Error ? error.message : "Invalid request" } });
  }
});
