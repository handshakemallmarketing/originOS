export type Brand<T, B extends string> = T & { readonly __brand: B };
export type CanonicalId = Brand<string, "CanonicalId">;
export type CanonicalTypeId = Brand<string, "CanonicalTypeId">;
export type RecordVersion = Brand<number, "RecordVersion">;
export type Instant = Brand<string, "Iso8601Instant">;

export const recordVersion = (value: number): RecordVersion => {
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid record version: ${value}`);
  return value as RecordVersion;
};
export const instant = (value: string): Instant => {
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid instant: ${value}`);
  return value as Instant;
};

export const canonicalId = (value: string): CanonicalId => {
  if (!/^[a-z][a-z0-9-]*:[a-zA-Z0-9._~-]+$/.test(value)) throw new Error(`Invalid canonical id: ${value}`);
  return value as CanonicalId;
};

export const canonicalStatuses = [
  "known", "unknown", "undefined", "conditional", "disputed", "incomplete",
  "incomparable", "stale", "superseded", "invalid", "unauthorized", "rejected", "not_applicable"
] as const;
export type CanonicalStatus = typeof canonicalStatuses[number];

export const evaluationFamilies = [
  "FEASIBILITY", "SUFFICIENCY", "ADMISSIBILITY", "PREDICTION", "COMPARISON", "PURPOSE_FULFILLMENT"
] as const;
export type EvaluationFamily = typeof evaluationFamilies[number];

export interface ComputationResultContent {
  readonly family: EvaluationFamily;
  readonly target: Readonly<Record<string, unknown>>;
  readonly result: Readonly<Record<string, unknown>>;
  readonly inputSnapshot: Readonly<Record<string, unknown>>;
  readonly ruleOrModelVersion: string;
  readonly uncertainty: Readonly<Record<string, unknown>>;
}

export interface DecisionContent {
  readonly deciderRef: string;
  readonly question: string;
  readonly determination: Readonly<Record<string, unknown>>;
  readonly bindingClaimed: boolean;
}

export interface DelegationContent {
  readonly delegatorRef: string;
  readonly delegateRef: string;
  readonly power: string;
  readonly limit: number;
  readonly revocable: boolean;
}

export interface ActContent {
  readonly agentRef: string;
  readonly conduct: string;
  readonly authorizationStatus: "authorized" | "unauthorized" | "unknown";
  readonly intendedEffect?: string;
}

export interface TransformationContent {
  readonly change: string;
  readonly causeKind: "natural" | "agentic" | "mixed" | "unknown";
  readonly agencyRef?: string;
  readonly actionRef?: string;
}

export interface TransformationEventContent {
  readonly transformationRef: string;
  readonly eventKind: "initiation" | "interruption" | "completion";
  readonly cause?: string;
}

export interface OutcomeContent {
  readonly transformationRef: string;
  readonly result: string;
  readonly accepted: boolean;
}

export interface ConsequenceContent {
  readonly outcomeRef: string;
  readonly effect: string;
}

export interface ValueStatusContent {
  readonly outcomeRef: string;
  readonly realizationStatus: "known" | "incomplete" | "rejected" | "unknown";
  readonly purposeFulfillmentAsserted: boolean;
}

export interface TimeEnvelope {
  readonly validTime: { readonly from: Instant; readonly to?: Instant };
  readonly observedTime?: Instant;
  readonly recordedTime: Instant;
}

export interface ScopeEnvelope {
  readonly enterpriseScope?: CanonicalId;
  readonly contextRef: CanonicalId;
  readonly boundaryRefs: readonly CanonicalId[];
  readonly perspectiveRef?: CanonicalId;
}

export interface ProvenanceEnvelope {
  readonly sourceRefs: readonly CanonicalId[];
  readonly producerRef: CanonicalId;
  readonly methodRef?: CanonicalId;
  readonly ruleOrModelVersion?: string;
}

export interface CanonicalRecord<TType extends string = string, TContent = unknown> {
  readonly canonicalId: CanonicalId;
  readonly canonicalType: TType;
  readonly schemaVersion: string;
  readonly recordVersion: RecordVersion;
  readonly predecessorVersion?: RecordVersion;
  readonly lifecycleStatus: "active" | "deprecated" | "superseded" | "quarantined" | "withdrawn";
  readonly assertionStatus: CanonicalStatus;
  readonly scope: ScopeEnvelope;
  readonly time: TimeEnvelope;
  readonly provenance: ProvenanceEnvelope;
  readonly reason: string;
  readonly content: TContent;
}

export interface CanonicalError {
  readonly code: CanonicalErrorCode;
  readonly message: string;
  readonly invariantRefs: readonly string[];
  readonly details: Readonly<Record<string, unknown>>;
}

export const canonicalErrorCodes = [
  "C2C_E001_TYPE_MISMATCH", "C2C_E002_SCOPE_UNRESOLVED", "C2C_E003_TEMPORAL_CONFLICT",
  "C2C_E004_PROVENANCE_MISSING", "C2C_E005_AUTHORITY_INVALID", "C2C_E006_INVARIANT_VIOLATION",
  "C2C_E007_DEPENDENCY_STALE", "C2C_E008_MODEL_INAPPLICABLE", "C2C_E009_CONFLICT_UNRESOLVED",
  "C2C_E010_TRANSITION_INVALID", "C2C_E011_IDENTITY_AMBIGUOUS", "C2C_E012_UNSUPPORTED_EXTENSION",
  "C2C_E013_INCOMPARABLE", "C2C_E014_UNCERTAINTY_UNREPRESENTABLE"
] as const;
export type CanonicalErrorCode = typeof canonicalErrorCodes[number];

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CanonicalError };
export const notImplemented = (capability: string): Result<never> => ({
  ok: false,
  error: { code: "C2C_E012_UNSUPPORTED_EXTENSION", message: `${capability} is outside the implemented Sprint 0 transition profile`, invariantRefs: [], details: { capability } }
});

export const canonicalError = (
  code: CanonicalErrorCode,
  message: string,
  invariantRefs: readonly string[] = [],
  details: Readonly<Record<string, unknown>> = {}
): CanonicalError => ({ code, message, invariantRefs, details });
