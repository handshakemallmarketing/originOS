import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { apiVersion, openApiDocument, supportedCommandTypes, validateApplicationCommandEnvelope } from "./index.js";

const valid = { commandId: "schema-command", agentRef: "originos:merchant-1", agencyRef: "originos:agency-1",
  authorityRef: "originos:authority-1", purposeRef: "originos:purpose-1", evidenceRefs: ["originos:evidence-1"],
  attributionRule: "originos:attribution-direct", command: { commandType: "registerCocoaLot", payload: {
    lotId: "schema-lot", quantityKg: 1000, originRef: "originos:farm-1", custodianRef: "originos:warehouse-1"
  } } };

describe("OriginOS API v2 schemas", () => {
  it("accepts the declared envelope and rejects unknown, missing, and mistyped fields with paths", () => {
    expect(validateApplicationCommandEnvelope(valid).ok).toBe(true);
    const invalid = validateApplicationCommandEnvelope({ ...valid, unexpected: true, command: { ...valid.command, payload: { ...valid.command.payload, quantityKg: "1000", extra: true } } });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.issues.map((issue) => issue.path)).toEqual(["$.unexpected", "$.command.payload.quantityKg", "$.command.payload.extra"]);
  });

  it("publishes a stable machine-readable compatibility contract", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.info.version).toBe(apiVersion);
    expect(openApiDocument.components.schemas.ApplicationCommandEnvelope.additionalProperties).toBe(false);
    expect(openApiDocument.components.schemas.ApplicationCommandEnvelope.properties.command.oneOf.map((schema) => schema.properties.commandType.const)).toEqual(supportedCommandTypes);
    expect(openApiDocument.paths["/v2/commands"].post.security).toEqual([{ BearerAuth: [] }]);
    expect(createHash("sha256").update(JSON.stringify(openApiDocument)).digest("hex")).toBe("69cfbe6ae0b70be64413c019826bfb3060ac9b2730c65fdba75afcad222b8ceb");
  });
});
