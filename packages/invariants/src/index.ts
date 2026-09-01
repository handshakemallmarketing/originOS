import { canonicalError, evaluationFamilies, type CanonicalError, type CanonicalRecord } from "@originos/canonical-types";

export const sprint0InvariantIds = Array.from({ length: 20 }, (_, i) => `C2C-INV-${String(i + 1).padStart(3, "0")}`) as readonly string[];
export interface InvariantContext { readonly records: readonly CanonicalRecord[]; readonly command?: unknown }
export type InvariantValidator = (context: InvariantContext) => readonly CanonicalError[];

export class InvariantRegistry {
  readonly #validators = new Map<string, InvariantValidator>();
  register(id: string, validator: InvariantValidator): void { this.#validators.set(id, validator); }
  validate(context: InvariantContext): readonly CanonicalError[] {
    return [...this.#validators.values()].flatMap((validator) => validator(context));
  }
  get registeredIds(): readonly string[] { return [...this.#validators.keys()]; }
}

const containsNull = (value: unknown): boolean => value === null || (typeof value === "object" && value !== null && Object.values(value).some(containsNull));

export const validateNoUntypedNull: InvariantValidator = ({ command }) =>
  containsNull(command) ? [canonicalError("C2C_E006_INVARIANT_VIOLATION", "Untyped null is prohibited at canonical boundaries", ["C2C-INV-019"])] : [];

export const validateClosedEvaluationFamilies: InvariantValidator = ({ command }) => {
  const family = (command as { payload?: { family?: unknown } } | undefined)?.payload?.family;
  return typeof family === "string" && !evaluationFamilies.includes(family as never)
    ? [canonicalError("C2C_E012_UNSUPPORTED_EXTENSION", `Unsupported canonical evaluation family: ${family}`, ["C2C-INV-018"], { family })]
    : [];
};

export const validateRecordFoundation: InvariantValidator = ({ records }) => records.flatMap((record) => {
  const errors: CanonicalError[] = [];
  if (!record.scope.contextRef) errors.push(canonicalError("C2C_E002_SCOPE_UNRESOLVED", "Canonical record requires Context", ["C2C-INV-001"]));
  if (!record.provenance.producerRef || record.provenance.sourceRefs.length === 0) errors.push(canonicalError("C2C_E004_PROVENANCE_MISSING", "Canonical record requires producer and source provenance", ["C2C-INV-001","C2C-INV-002"]));
  return errors;
});

export const validateCollectiveAttribution: InvariantValidator = ({ command }) => {
  const candidate = command as { commandType?: unknown; payload?: { agent?: unknown; collectiveAttributionRule?: unknown } } | undefined;
  return candidate?.commandType === "attributeAct" && candidate.payload?.agent === "enterprise-1" && candidate.payload.collectiveAttributionRule !== true
    ? [canonicalError("C2C_E006_INVARIANT_VIOLATION", "Enterprise act attribution requires an explicit collective-attribution rule", ["C2C-INV-017"])]
    : [];
};

export const validateAgenticTransformation: InvariantValidator = ({ command }) => {
  const candidate = command as { commandType?: unknown; payload?: { causeKind?: unknown; agencyRef?: unknown; actionRef?: unknown } } | undefined;
  if (candidate?.commandType !== "recordTransformation" || candidate.payload?.causeKind !== "agentic") return [];
  return typeof candidate.payload.agencyRef !== "string" || typeof candidate.payload.actionRef !== "string"
    ? [canonicalError("C2C_E006_INVARIANT_VIOLATION", "Agentic Transformation requires explicit executable Agency and Action", ["C2C-INV-009"])]
    : [];
};

export const validateRealizationHasOutcome: InvariantValidator = ({ records, command }) => {
  const candidate = command as { commandType?: unknown; payload?: { outcomeRef?: unknown } } | undefined;
  if (candidate?.commandType !== "recordRealization") return [];
  const outcomeRef = candidate.payload?.outcomeRef;
  const outcomeExists = typeof outcomeRef === "string" && records.some((record) => record.canonicalType === "outcome" && record.canonicalId === outcomeRef);
  return outcomeExists ? [] : [canonicalError("C2C_E006_INVARIANT_VIOLATION", "Value Realization cannot be asserted without an actual Outcome", ["C2C-INV-012"], { outcomeRef })];
};

const prohibitedInference = (commandType: string, flag: string, invariant: string, distinction: string): InvariantValidator => ({ command }) => {
  const candidate = command as { commandType?: unknown; payload?: Readonly<Record<string, unknown>> } | undefined;
  return candidate?.commandType === commandType && candidate.payload?.[flag] === true
    ? [canonicalError("C2C_E006_INVARIANT_VIOLATION", `${distinction} cannot be inferred by side effect`, [invariant])]
    : [];
};

export const foundationInvariantRegistry = new InvariantRegistry();
foundationInvariantRegistry.register("C2C-INV-001/002", validateRecordFoundation);
foundationInvariantRegistry.register("C2C-INV-018", validateClosedEvaluationFamilies);
foundationInvariantRegistry.register("C2C-INV-019", validateNoUntypedNull);
foundationInvariantRegistry.register("C2C-INV-017", validateCollectiveAttribution);
foundationInvariantRegistry.register("C2C-INV-009", validateAgenticTransformation);
foundationInvariantRegistry.register("C2C-INV-012", validateRealizationHasOutcome);
foundationInvariantRegistry.register("C2C-INV-001", prohibitedInference("inferActualityFromRecord", "inferActuality", "C2C-INV-001", "Reality"));
foundationInvariantRegistry.register("C2C-INV-002", prohibitedInference("deriveComputation", "inferTruth", "C2C-INV-002", "Truth or Knowledge"));
foundationInvariantRegistry.register("C2C-INV-003", prohibitedInference("createParticipant", "inferAgent", "C2C-INV-003", "Agency"));
foundationInvariantRegistry.register("C2C-INV-008", prohibitedInference("formCommitment", "inferOccurrence", "C2C-INV-008", "Occurrence"));
foundationInvariantRegistry.register("C2C-INV-013", prohibitedInference("linkCausalContribution", "inferResponsibility", "C2C-INV-013", "Responsibility"));
foundationInvariantRegistry.register("C2C-INV-014", prohibitedInference("determinePersistence", "inferSustainability", "C2C-INV-014", "Sustainability"));
foundationInvariantRegistry.register("C2C-INV-015", prohibitedInference("recordFailure", "inferDissolution", "C2C-INV-015", "Dissolution"));
foundationInvariantRegistry.register("C2C-INV-016", prohibitedInference("determineDissolution", "eraseHistory", "C2C-INV-016", "Historical erasure"));
