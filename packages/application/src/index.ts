import { canonicalError, canonicalId, type CanonicalId, type CanonicalRecord, type Result } from "@originos/canonical-types";
import { applyCommand, type KernelCommand, type TransitionOutcome } from "@originos/kernel";
import type { CanonicalRepository } from "@originos/repository";

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
};
const commandFingerprint = (envelope: ApplicationCommandEnvelope): string => JSON.stringify(stable(envelope));

export interface ApplicationCommandEnvelope {
  readonly commandId: string;
  readonly agentRef: string;
  readonly agencyRef: string;
  readonly authorityRef: string;
  readonly purposeRef: string;
  readonly targetTransformationRef?: string;
  readonly evidenceRefs: readonly string[];
  readonly attributionRule: string;
  readonly command: KernelCommand;
}

export class OriginApplication {
  constructor(readonly repository: CanonicalRepository) {}

  async execute(envelope: ApplicationCommandEnvelope): Promise<Result<TransitionOutcome>> {
    if (!envelope.commandId || !envelope.agentRef || !envelope.agencyRef || !envelope.authorityRef || !envelope.purposeRef || envelope.evidenceRefs.length === 0 || !envelope.attributionRule) {
      return { ok: false, error: canonicalError("C2C_E004_PROVENANCE_MISSING", "Command envelope requires Agent, Agency, Authority, Purpose, evidence, and attribution", ["C2C-INV-003", "C2C-INV-004"]) };
    }
    let evidenceRefs: CanonicalId[];
    try { evidenceRefs = envelope.evidenceRefs.map(canonicalId); }
    catch { return { ok: false, error: canonicalError("C2C_E001_TYPE_MISMATCH", "Command evidence references must be canonical identifiers") }; }

    const fingerprint = commandFingerprint(envelope);
    const prior = (await this.repository.all()).filter((record) => {
      const content = record.content as Record<string, unknown>;
      const context = content?.commandContext as Record<string, unknown> | undefined;
      return context?.commandId === envelope.commandId;
    });
    if (prior.length > 0) {
      const priorContext = (prior[0]!.content as Record<string, unknown>).commandContext as Record<string, unknown>;
      if (priorContext.commandFingerprint !== fingerprint) return { ok: false, error: canonicalError("C2C_E009_CONFLICT_UNRESOLVED", "Command identity was reused with different meaning") };
      return { ok: true, value: { created: prior, superseded: [], facts: [] } };
    }

    const transition = applyCommand(await this.repository.all(), {
      ...envelope.command,
      payload: { ...envelope.command.payload, commandId: envelope.commandId, agentRef: envelope.agentRef, agencyRef: envelope.agencyRef,
        authorityRef: envelope.authorityRef, purposeRef: envelope.purposeRef, targetTransformationRef: envelope.targetTransformationRef,
        evidenceRefs: envelope.evidenceRefs, attributionRule: envelope.attributionRule }
    });
    if (!transition.ok) return transition;
    const records: CanonicalRecord[] = [];
    for (const candidate of transition.value.created) {
      const content = typeof candidate.content === "object" && candidate.content !== null ? candidate.content as Readonly<Record<string, unknown>> : { value: candidate.content };
      const record: CanonicalRecord = {
        ...candidate,
        provenance: { ...candidate.provenance, sourceRefs: evidenceRefs },
        reason: `Application command ${envelope.commandId}`,
        content: { ...content, commandContext: {
          commandId: envelope.commandId, commandFingerprint: fingerprint, agentRef: envelope.agentRef, agencyRef: envelope.agencyRef, authorityRef: envelope.authorityRef,
          purposeRef: envelope.purposeRef, targetTransformationRef: envelope.targetTransformationRef,
          attributionRule: envelope.attributionRule
        } }
      };
      records.push(record);
    }
    const appended = await this.repository.appendMany(records.map((record) => ({ record })));
    if (!appended.ok) return appended;
    return { ok: true, value: { created: appended.value, superseded: transition.value.superseded, facts: transition.value.facts } };
  }

  current(id: CanonicalId): Promise<Result<CanonicalRecord>> { return this.repository.current(id); }
  history(id: CanonicalId): Promise<readonly CanonicalRecord[]> { return this.repository.history(id); }
  all(): Promise<readonly CanonicalRecord[]> { return this.repository.all(); }
}

export interface CocoaWorkflowInput {
  readonly runId: string;
  readonly quantityKg: number;
  readonly originRef: string;
  readonly merchantRef: string;
  readonly warehouseRef: string;
  readonly processorRef: string;
}

export const cocoaWorkflowCommands = (input: CocoaWorkflowInput): readonly ApplicationCommandEnvelope[] => {
  const common = {
    agentRef: input.merchantRef, agencyRef: "originos:agency-cocoa-procurement", authorityRef: "originos:authority-cocoa-procurement",
    purposeRef: "originos:purpose-conforming-cocoa", evidenceRefs: ["originos:evidence-cocoa-receipt"], attributionRule: "originos:attribution-direct-agent"
  } as const;
  return [
    { ...common, commandId: `${input.runId}-lot`, command: { commandType: "registerCocoaLot", payload: { lotId: `${input.runId}-lot`, quantityKg: input.quantityKg, originRef: input.originRef, custodianRef: input.warehouseRef } } },
    { ...common, commandId: `${input.runId}-custody`, command: { commandType: "transferCustody", payload: { transferId: `${input.runId}-custody`, lotRef: `originos:material-lot-${input.runId}-lot`, fromCustodianRef: input.warehouseRef, toCustodianRef: input.processorRef, quantityKg: input.quantityKg } } },
    { ...common, commandId: `${input.runId}-comparison`, command: { commandType: "compareCandidates", payload: { fixtureId: `${input.runId}-comparison`, candidates: [input.warehouseRef, input.processorRef], dominant: input.processorRef } } },
    { ...common, commandId: `${input.runId}-decision`, command: { commandType: "recordDecision", payload: { fixtureId: `${input.runId}-decision`, merchant: input.merchantRef, supplier: input.processorRef } } },
    { ...common, commandId: `${input.runId}-act`, command: { commandType: "attributeAct", payload: { fixtureId: `${input.runId}-act`, authorizedAgent: input.merchantRef, act: "release-cocoa-for-processing" } } },
    { ...common, commandId: `${input.runId}-transformation`, targetTransformationRef: `originos:transformation-${input.runId}-transformation`, command: { commandType: "recordTransformation", payload: { fixtureId: `${input.runId}-transformation`, change: "raw-cocoa-to-processed-cocoa", causeKind: "agentic", actionRef: `originos:act-${input.runId}-act` } } },
    { ...common, commandId: `${input.runId}-outcome`, command: { commandType: "recordOutcome", payload: { fixtureId: `${input.runId}-outcome`, shipmentArrived: true, cocoaDamaged: false } } },
    { ...common, commandId: `${input.runId}-value`, command: { commandType: "recordValueStatus", payload: { fixtureId: `${input.runId}-value`, conformingDelivery: true, buyerInsolvent: false } } }
  ];
};

export const runCocoaProcurementAndProcessing = async (application: OriginApplication, input: CocoaWorkflowInput): Promise<Result<readonly CanonicalRecord[]>> => {
  const commands = cocoaWorkflowCommands(input);
  const records: CanonicalRecord[] = [];
  for (const command of commands) {
    const result = await application.execute(command);
    if (!result.ok) return result;
    records.push(...result.value.created);
  }
  return { ok: true, value: records };
};
