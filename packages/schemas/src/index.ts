export const apiVersion = "2.0.0" as const;
export const schemaCatalog = { document: "C2C-01", version: "0.7.0-alpha.1", schemas: [
  "canonical-record-envelope", "canonical-error", "canonical-bundle", "computation-result", "decision", "delegation", "act",
  "transformation", "transformation-event", "outcome", "consequence", "value-status", "material-lot", "custody-transfer",
  "application-command-envelope", "conformance-fixture"
] } as const;

type FieldType = "string" | "number" | "boolean" | "array";
interface CommandShape { readonly required: Readonly<Record<string, FieldType>>; readonly optional?: Readonly<Record<string, FieldType>> }
export interface ValidatedCommandEnvelope { readonly commandId: string; readonly agentRef: string; readonly agencyRef: string; readonly authorityRef: string; readonly purposeRef: string; readonly targetTransformationRef?: string; readonly evidenceRefs: readonly string[]; readonly attributionRule: string; readonly command: { readonly commandType: string; readonly payload: Readonly<Record<string, unknown>> } }
export interface ValidationIssue { readonly path: string; readonly message: string }
export type ValidationResult = { readonly ok: true; readonly value: ValidatedCommandEnvelope } | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const commandShapes = {
  authorizeAct: { required: { authorityRef: "string" } }, amendInventory: { required: { fixtureId: "string", inventoryVersion: "number" } },
  registerCocoaLot: { required: { lotId: "string", quantityKg: "number", originRef: "string", custodianRef: "string" } },
  transferCustody: { required: { transferId: "string", lotRef: "string", fromCustodianRef: "string", toCustodianRef: "string", quantityKg: "number" } },
  initiateCocoaProcessing: { required: { workflowId: "string", lotRef: "string", processorRef: "string" } },
  completeCocoaProcessing: { required: { completionId: "string", transformationRef: "string", processorRef: "string", outputQuantityKg: "number", accepted: "boolean", consequence: "string" } },
  materializeProcessedCocoaLot: { required: { processedLotId: "string", completionRef: "string" } },
  recordCocoaDeliveryValue: { required: { realizationId: "string", processedLotRef: "string", buyerRef: "string", purposeFulfilled: "boolean", considerationStatus: "string" } },
  compareCandidates: { required: { fixtureId: "string", candidates: "array", dominant: "string" } },
  recordDecision: { required: { fixtureId: "string" }, optional: { merchant: "string", actor: "string", supplier: "string", systemAccess: "boolean", amount: "number", approvalLimit: "number" } },
  evaluateShipment: { required: { fixtureId: "string", shipmentPossible: "boolean", clearance: "boolean" } },
  delegateAuthority: { required: { fixtureId: "string", delegate: "string", delegatorLimit: "number", requestedLimit: "number" } },
  attributeAct: { required: { fixtureId: "string", act: "string" }, optional: { authorizedAgent: "string", agent: "string", response: "string" } },
  recordOccurrence: { required: { fixtureId: "string", change: "string", cause: "string" } },
  recordTransformation: { required: { fixtureId: "string", change: "string", causeKind: "string" }, optional: { agencyRef: "string", actionRef: "string" } },
  markInterrupted: { required: { fixtureId: "string", loadingReady: "boolean", cause: "string" } },
  recordOutcome: { required: { fixtureId: "string", shipmentArrived: "boolean", cocoaDamaged: "boolean" } },
  recordValueStatus: { required: { fixtureId: "string", conformingDelivery: "boolean", buyerInsolvent: "boolean" } },
  verifySemanticRoundTrip: { required: { fixtureId: "string" } }
} as const satisfies Readonly<Record<string, CommandShape>>;
export const supportedCommandTypes = Object.freeze(Object.keys(commandShapes));
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const matches = (value: unknown, type: FieldType): boolean => type === "array" ? Array.isArray(value) : typeof value === type;
const envelopeKeys = new Set(["commandId", "agentRef", "agencyRef", "authorityRef", "purposeRef", "targetTransformationRef", "evidenceRefs", "attributionRule", "command"]);

export const validateApplicationCommandEnvelope = (candidate: unknown): ValidationResult => {
  const issues: ValidationIssue[] = [];
  if (!isObject(candidate)) return { ok: false, issues: [{ path: "$", message: "must be an object" }] };
  for (const key of Object.keys(candidate)) if (!envelopeKeys.has(key)) issues.push({ path: `$.${key}`, message: "is not allowed in API v2" });
  for (const key of ["commandId", "agentRef", "agencyRef", "authorityRef", "purposeRef", "attributionRule"] as const) if (typeof candidate[key] !== "string" || candidate[key].trim() === "") issues.push({ path: `$.${key}`, message: "must be a non-empty string" });
  if (candidate.targetTransformationRef !== undefined && (typeof candidate.targetTransformationRef !== "string" || candidate.targetTransformationRef.trim() === "")) issues.push({ path: "$.targetTransformationRef", message: "must be a non-empty string when supplied" });
  if (!Array.isArray(candidate.evidenceRefs) || candidate.evidenceRefs.length === 0 || candidate.evidenceRefs.some((item) => typeof item !== "string" || item.trim() === "")) issues.push({ path: "$.evidenceRefs", message: "must contain at least one non-empty string" });
  if (!isObject(candidate.command)) issues.push({ path: "$.command", message: "must be an object" });
  else {
    for (const key of Object.keys(candidate.command)) if (key !== "commandType" && key !== "payload") issues.push({ path: `$.command.${key}`, message: "is not allowed in API v2" });
    const commandType = candidate.command.commandType;
    const shape: CommandShape | undefined = typeof commandType === "string" ? commandShapes[commandType as keyof typeof commandShapes] : undefined;
    if (!shape) issues.push({ path: "$.command.commandType", message: `must be one of: ${supportedCommandTypes.join(", ")}` });
    if (!isObject(candidate.command.payload)) issues.push({ path: "$.command.payload", message: "must be an object" });
    else if (shape) {
      const allowed = { ...shape.required, ...(shape.optional ?? {}) } as Record<string, FieldType>;
      for (const [key, type] of Object.entries(shape.required)) if (!matches(candidate.command.payload[key], type)) issues.push({ path: `$.command.payload.${key}`, message: `must be ${type}` });
      for (const [key, value] of Object.entries(candidate.command.payload)) { const type = allowed[key]; if (!type) issues.push({ path: `$.command.payload.${key}`, message: `is not allowed for ${String(commandType)}` }); else if (!(key in shape.required) && value !== undefined && !matches(value, type)) issues.push({ path: `$.command.payload.${key}`, message: `must be ${type}` }); }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: candidate as unknown as ValidatedCommandEnvelope };
};

const stringSchema = { type: "string", minLength: 1 } as const;
const fieldSchema = (type: FieldType): Readonly<Record<string, unknown>> => type === "array"
  ? { type: "array", items: stringSchema }
  : type === "string" ? stringSchema : { type };
const commandSchemas = Object.entries(commandShapes).map(([commandType, shape]) => {
  const definition = shape as CommandShape;
  const fields = { ...definition.required, ...(definition.optional ?? {}) };
  return { type: "object", additionalProperties: false, required: ["commandType", "payload"], properties: {
    commandType: { const: commandType }, payload: { type: "object", additionalProperties: false,
      required: Object.keys(definition.required), properties: Object.fromEntries(Object.entries(fields).map(([key, type]) => [key, fieldSchema(type)])) }
  } } as const;
});
const envelopeSchema = {
  type: "object", additionalProperties: false,
  required: ["commandId", "agentRef", "agencyRef", "authorityRef", "purposeRef", "evidenceRefs", "attributionRule", "command"],
  properties: {
    commandId: stringSchema, agentRef: stringSchema, agencyRef: stringSchema, authorityRef: stringSchema,
    purposeRef: stringSchema, targetTransformationRef: stringSchema,
    evidenceRefs: { type: "array", minItems: 1, items: stringSchema }, attributionRule: stringSchema,
    command: { oneOf: commandSchemas }
  }
} as const;
export const openApiDocument = Object.freeze({
  openapi: "3.1.0",
  info: { title: "OriginOS Bounded Reference API", version: apiVersion, description: "Replaceable transport contract. Canonical meaning remains governed by C2C-01 and the application/kernel." },
  paths: {
    "/health": { get: { operationId: "health", responses: { "200": { description: "Adapter liveness" } } } },
    "/ready": { get: { operationId: "readiness", responses: { "200": { description: "Operational data integrity verified" }, "503": { description: "Operational integrity failure" } } } },
    "/openapi.json": { get: { operationId: "openApi", responses: { "200": { description: "This contract" } } } },
    "/v2/commands": { post: { operationId: "executeCommand", security: [{ BearerAuth: [] }], parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: stringSchema }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ApplicationCommandEnvelope" } } } }, responses: { "201": { description: "Executed or replayed" }, "400": { description: "Invalid request" }, "401": { description: "Operational caller is not authenticated" }, "403": { description: "Principal is not bound to the declared Agent, or canonical Authority is invalid" }, "409": { description: "Identity conflict" }, "415": { description: "Unsupported media type" } } } },
    "/v2/records": { get: { operationId: "allRecords", security: [{ BearerAuth: [] }], responses: { "200": { description: "All canonical versions" }, "401": { description: "Operational caller is not authenticated" } } } },
    "/v2/records/{id}": { get: { operationId: "currentRecord", security: [{ BearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: stringSchema }], responses: { "200": { description: "Current version" }, "401": { description: "Operational caller is not authenticated" }, "404": { description: "Unknown identity" } } } },
    "/v2/records/{id}/history": { get: { operationId: "recordHistory", security: [{ BearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: stringSchema }], responses: { "200": { description: "Immutable version history" }, "401": { description: "Operational caller is not authenticated" } } } }
  },
  components: { securitySchemes: { BearerAuth: { type: "http", scheme: "bearer", description: "Operational API key. Authentication does not confer canonical Authority." } }, schemas: { ApplicationCommandEnvelope: envelopeSchema } }
});
