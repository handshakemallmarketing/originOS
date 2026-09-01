import { installGracefulShutdown, loadServiceConfig, startOriginService } from "./index.js";

const config = loadServiceConfig(process.env);
const service = await startOriginService(config);
installGracefulShutdown(service);
console.log(JSON.stringify({ event: "originos.service.started", baseUrl: service.baseUrl, dataDirectory: config.dataDirectory, storage: config.databaseUrl ? "postgresql" : "json", version: "0.9.0-alpha.1", apiVersion: "2.0.0" }));
