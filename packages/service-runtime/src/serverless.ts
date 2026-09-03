import type { IncomingMessage, ServerResponse } from "node:http";
import { OriginApplication } from "@originos/application";
import { OidcJwtAuthenticator } from "@originos/auth";
import { createOperatorWebApp } from "@originos/operator-web";
import { PostgresCanonicalRepository } from "@originos/repository-postgres";
import { createOriginHttpHandler, type OriginHttpHandler } from "@originos/transport-http";

export interface ServerlessConfig {
  readonly databaseUrl: string;
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUri: string;
  readonly clientId: string;
  readonly agentRefsClaim: string;
  readonly requiredScope: string;
}

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const loadServerlessConfig = (environment: NodeJS.ProcessEnv): ServerlessConfig => {
  if (environment.ORIGINOS_AUTH_MODE?.trim().toLowerCase() !== "oidc") throw new Error("Vercel runtime requires ORIGINOS_AUTH_MODE=oidc");
  return Object.freeze({
    databaseUrl: required(environment, "ORIGINOS_DATABASE_URL"),
    issuer: required(environment, "ORIGINOS_OIDC_ISSUER"),
    audience: required(environment, "ORIGINOS_OIDC_AUDIENCE"),
    jwksUri: required(environment, "ORIGINOS_OIDC_JWKS_URI"),
    clientId: required(environment, "ORIGINOS_OIDC_CLIENT_ID"),
    agentRefsClaim: environment.ORIGINOS_OIDC_AGENT_REFS_CLAIM?.trim() || "originos_agent_refs",
    requiredScope: environment.ORIGINOS_OIDC_REQUIRED_SCOPE?.trim() || "originos:commands"
  });
};

export const createServerlessRuntime = async (config: ServerlessConfig): Promise<OriginHttpHandler> => {
  const repository = new PostgresCanonicalRepository({ connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 });
  await repository.migrate();
  const application = new OriginApplication(repository);
  const authenticator = new OidcJwtAuthenticator(config);
  return createOriginHttpHandler(application, repository.receiptStore(), {
    authenticator,
    auditSink: repository.requestAuditSink(),
    webApp: createOperatorWebApp({ issuer: config.issuer, clientId: config.clientId, audience: config.audience }),
    readiness: async () => {
      const database = await repository.check();
      return { ok: database.ok, checks: [{ name: "postgresql-transaction-store", ...database }] };
    }
  });
};

let runtime: Promise<OriginHttpHandler> | undefined;
export default async function vercelHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    runtime ??= createServerlessRuntime(loadServerlessConfig(process.env));
    await (await runtime)(request, response);
  }
  catch (error) {
    runtime = undefined;
    if (!response.headersSent) response.writeHead(503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: false, error: { code: "ORIGINOS_RUNTIME_UNAVAILABLE", message: "Service is temporarily unavailable" } }));
    if (error instanceof Error) console.error("originos.serverless.request.failed", error.message);
  }
}
