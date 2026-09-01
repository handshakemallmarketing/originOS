import { mkdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { isAbsolute, join, resolve } from "node:path";
import { OriginApplication } from "@originos/application";
import { StaticApiKeyAuthenticator } from "@originos/auth";
import { acquireOperationalLock, checkDataIntegrity, JsonlAuditLog } from "@originos/operations";
import { JsonFileCanonicalRepository } from "@originos/repository";
import type { CanonicalRepository } from "@originos/repository";
import { PostgresCanonicalRepository } from "@originos/repository-postgres";
import { createOriginHttpServer, JsonCommandReceiptStore } from "@originos/transport-http";

export interface ServiceConfig { readonly host: string; readonly port: number; readonly dataDirectory: string; readonly authConfigPath: string; readonly databaseUrl?: string }
export interface OriginService {
  readonly application: OriginApplication;
  readonly config: ServiceConfig;
  readonly baseUrl: string;
  close(): Promise<void>;
}

export const loadServiceConfig = (environment: NodeJS.ProcessEnv): ServiceConfig => {
  const host = environment.ORIGINOS_HOST?.trim() || "127.0.0.1";
  const rawPort = environment.ORIGINOS_PORT?.trim() || "3000";
  if (!/^\d+$/.test(rawPort)) throw new Error("ORIGINOS_PORT must be an integer from 0 through 65535");
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("ORIGINOS_PORT must be an integer from 0 through 65535");
  const suppliedDirectory = environment.ORIGINOS_DATA_DIR?.trim() || "./data/originos";
  const dataDirectory = isAbsolute(suppliedDirectory) ? suppliedDirectory : resolve(suppliedDirectory);
  const suppliedAuthConfig = environment.ORIGINOS_AUTH_CONFIG?.trim();
  if (!suppliedAuthConfig) throw new Error("ORIGINOS_AUTH_CONFIG is required");
  const authConfigPath = isAbsolute(suppliedAuthConfig) ? suppliedAuthConfig : resolve(suppliedAuthConfig);
  const databaseUrl = environment.ORIGINOS_DATABASE_URL?.trim();
  return Object.freeze(databaseUrl ? { host, port, dataDirectory, authConfigPath, databaseUrl } : { host, port, dataDirectory, authConfigPath });
};

export const startOriginService = async (config: ServiceConfig): Promise<OriginService> => {
  await mkdir(config.dataDirectory, { recursive: true });
  const startupIntegrity = await checkDataIntegrity(config.dataDirectory);
  const startupChecks = config.databaseUrl ? startupIntegrity.checks.filter((check) => check.name !== "canonical-store") : startupIntegrity.checks;
  if (startupChecks.some((check) => !check.ok)) throw new Error(`OriginOS data integrity check failed: ${startupChecks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.detail}`).join("; ")}`);
  const releaseLock = await acquireOperationalLock(config.dataDirectory);
  let authenticator: StaticApiKeyAuthenticator;
  try { authenticator = await StaticApiKeyAuthenticator.fromFile(config.authConfigPath); } catch (error) { await releaseLock(); throw error; }
  let repository: CanonicalRepository;
  let postgres: PostgresCanonicalRepository | undefined;
  if (config.databaseUrl) {
    postgres = new PostgresCanonicalRepository({ connectionString: config.databaseUrl });
    try { await postgres.migrate(); } catch (error) { await postgres.close(); await releaseLock(); throw error; }
    repository = postgres;
  } else repository = new JsonFileCanonicalRepository(join(config.dataDirectory, "canonical-store.json"));
  const application = new OriginApplication(repository);
  const auditLog = new JsonlAuditLog(join(config.dataDirectory, "audit-log.jsonl"));
  const server = createOriginHttpServer(application, new JsonCommandReceiptStore(join(config.dataDirectory, "command-receipts.json")), {
    authenticator, auditSink: auditLog, readiness: async () => {
      const fileIntegrity = await checkDataIntegrity(config.dataDirectory);
      if (!postgres) return fileIntegrity;
      const database = await postgres.check();
      const fileChecks = fileIntegrity.checks.filter((check) => check.name !== "canonical-store");
      return { ok: fileChecks.every((check) => check.ok) && database.ok, checks: [...fileChecks, { name: "postgresql-canonical-store", ...database }] };
    }
  });
  try { await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject); server.listen(config.port, config.host, () => { server.off("error", reject); resolveListen(); });
  }); } catch (error) { await postgres?.close(); await releaseLock(); throw error; }
  const address = server.address() as AddressInfo;
  let closed: Promise<void> | undefined;
  return {
    application, config, baseUrl: `http://${config.host}:${address.port}`,
    close: () => closed ??= new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
      .finally(async () => { await postgres?.close(); await releaseLock(); })
  };
};

export const installGracefulShutdown = (service: OriginService): (() => void) => {
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void service.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return () => { process.off("SIGINT", stop); process.off("SIGTERM", stop); };
};
