import { installGracefulShutdown, loadServiceConfig, startOriginService } from "./index.js";

const config = loadServiceConfig(process.env);
const service = await startOriginService(config);
installGracefulShutdown(service);
console.log(JSON.stringify({ event: "originos.service.started", baseUrl: service.baseUrl, dataDirectory: config.dataDirectory, storage: config.databaseUrl ? "postgresql" : "json", version: "0.17.0-rc.3", apiVersion: "2.0.0" }));
