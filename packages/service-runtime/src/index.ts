import { mkdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { isAbsolute, join, resolve } from "node:path";
import { OriginApplication } from "@originos/application";
import { OidcJwtAuthenticator, StaticApiKeyAuthenticator, type RequestAuthenticator } from "@originos/auth";
import { acquireOperationalLock, checkDataIntegrity, JsonlAuditLog } from "@originos/operations";
import { operatorWebApp } from "@originos/operator-web";
import { JsonFileCanonicalRepository } from "@originos/repository";
import type { CanonicalRepository } from "@originos/repository";
import { PostgresCanonicalRepository } from "@originos/repository-postgres";
import { createOriginHttpServer, JsonCommandReceiptStore, type CommandReceiptStore } from "@originos/transport-http";

export type ServiceAuthenticationConfig =
  | { readonly mode: "oidc"; readonly issuer: string; readonly audience: string; readonly jwksUri: string; readonly agentRefsClaim: string; readonly requiredScope: string }
  | { readonly mode: "static"; readonly configPath: string };
export interface ServiceConfig { readonly host: string; readonly port: number; readonly dataDirectory: string; readonly authentication: ServiceAuthenticationConfig; readonly databaseUrl?: string }
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
  const mode = environment.ORIGINOS_AUTH_MODE?.trim().toLowerCase();
  let authentication: ServiceAuthenticationConfig;
  if (mode === "oidc") {
    const issuer = environment.ORIGINOS_OIDC_ISSUER?.trim();
    const audience = environment.ORIGINOS_OIDC_AUDIENCE?.trim();
    const jwksUri = environment.ORIGINOS_OIDC_JWKS_URI?.trim();
    if (!issuer || !audience || !jwksUri) throw new Error("ORIGINOS_OIDC_ISSUER, ORIGINOS_OIDC_AUDIENCE, and ORIGINOS_OIDC_JWKS_URI are required in OIDC mode");
    authentication = Object.freeze({ mode, issuer, audience, jwksUri, agentRefsClaim: environment.ORIGINOS_OIDC_AGENT_REFS_CLAIM?.trim() || "originos_agent_refs", requiredScope: environment.ORIGINOS_OIDC_REQUIRED_SCOPE?.trim() || "originos:commands" });
  } else if (mode === "static") {
    if (environment.NODE_ENV === "production") throw new Error("static authentication is unavailable when NODE_ENV=production");
    const suppliedAuthConfig = environment.ORIGINOS_AUTH_CONFIG?.trim();
    if (!suppliedAuthConfig) throw new Error("ORIGINOS_AUTH_CONFIG is required in static mode");
    authentication = Object.freeze({ mode, configPath: isAbsolute(suppliedAuthConfig) ? suppliedAuthConfig : resolve(suppliedAuthConfig) });
  } else throw new Error("ORIGINOS_AUTH_MODE must be oidc or static");
  const databaseUrl = environment.ORIGINOS_DATABASE_URL?.trim();
  return Object.freeze(databaseUrl ? { host, port, dataDirectory, authentication, databaseUrl } : { host, port, dataDirectory, authentication });
};

export const startOriginService = async (config: ServiceConfig): Promise<OriginService> => {
  await mkdir(config.dataDirectory, { recursive: true });
  const startupIntegrity = await checkDataIntegrity(config.dataDirectory);
  const startupChecks = config.databaseUrl ? startupIntegrity.checks.filter((check) => check.name !== "canonical-store") : startupIntegrity.checks;
  if (startupChecks.some((check) => !check.ok)) throw new Error(`OriginOS data integrity check failed: ${startupChecks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.detail}`).join("; ")}`);
  const releaseLock = await acquireOperationalLock(config.dataDirectory);
  let authenticator: RequestAuthenticator;
  try {
    authenticator = config.authentication.mode === "static"
      ? await StaticApiKeyAuthenticator.fromFile(config.authentication.configPath)
      : new OidcJwtAuthenticator({ ...config.authentication, jwksUri: config.authentication.jwksUri });
  } catch (error) { await releaseLock(); throw error; }
  let repository: CanonicalRepository;
  let postgres: PostgresCanonicalRepository | undefined;
  if (config.databaseUrl) {
    postgres = new PostgresCanonicalRepository({ connectionString: config.databaseUrl });
    try { await postgres.migrate(); } catch (error) { await postgres.close(); await releaseLock(); throw error; }
    repository = postgres;
  } else repository = new JsonFileCanonicalRepository(join(config.dataDirectory, "canonical-store.json"));
  const application = new OriginApplication(repository);
  const auditLog = new JsonlAuditLog(join(config.dataDirectory, "audit-log.jsonl"));
  const receiptStore: CommandReceiptStore = postgres?.receiptStore() ?? new JsonCommandReceiptStore(join(config.dataDirectory, "command-receipts.json"));
  const server = createOriginHttpServer(application, receiptStore, {
    authenticator, auditSink: auditLog, webApp: operatorWebApp, readiness: async () => {
      const fileIntegrity = await checkDataIntegrity(config.dataDirectory);
      if (!postgres) return fileIntegrity;
      const database = await postgres.check();
      const fileChecks = fileIntegrity.checks.filter((check) => check.name !== "canonical-store");
      return { ok: fileChecks.every((check) => check.ok) && database.ok, checks: [...fileChecks, { name: "postgresql-transaction-store", ...database }] };
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
