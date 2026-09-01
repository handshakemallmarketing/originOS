import { canonicalError, canonicalId, instant, notImplemented, recordVersion, type CanonicalRecord, type Result } from "@originos/canonical-types";
import { foundationInvariantRegistry } from "@originos/invariants";
import { exportCanonicalBundle, importCanonicalBundle, semanticallyEquivalent } from "@originos/repository";

export interface KernelCommand { readonly commandType: string; readonly payload: Readonly<Record<string, unknown>> }
export interface TransitionOutcome { readonly created: readonly CanonicalRecord[]; readonly superseded: readonly CanonicalRecord[]; readonly facts: readonly Readonly<Record<string, unknown>>[] }

const foundationRecord = (type: string, status: CanonicalRecord["assertionStatus"], content: Readonly<Record<string, unknown>>): CanonicalRecord => ({
  canonicalId: canonicalId(`originos:${type}-${String(content.fixtureId ?? "sw0-03")}`), canonicalType: type, schemaVersion: "0.1.0",
  recordVersion: recordVersion(1), lifecycleStatus: "active", assertionStatus: status,
  scope: { contextRef: canonicalId("originos:sprint0-context"), boundaryRefs: [] },
  time: { validTime: { from: instant("2026-08-29T00:00:00Z") }, recordedTime: instant("2026-08-29T00:00:00Z") },
  provenance: { sourceRefs: [canonicalId("originos:c2c-01-v1.0")], producerRef: canonicalId("originos:reference-kernel") },
  reason: "SW0-03 foundation transition", content
});

const materialLotState = (records: readonly CanonicalRecord[], lotRef: unknown): { readonly lot: CanonicalRecord; readonly currentCustodianRef: unknown } | undefined => {
  const lot = typeof lotRef === "string" ? records.filter((record) => record.canonicalId === lotRef && record.canonicalType === "material-lot").at(-1) : undefined;
  if (!lot) return undefined;
  const transfers = records.filter((record) => record.canonicalType === "custody-transfer" && (record.content as Readonly<Record<string, unknown>>).lotRef === lotRef);
  const latest = transfers.at(-1)?.content as Readonly<Record<string, unknown>> | undefined;
  return { lot, currentCustodianRef: latest?.toCustodianRef ?? (lot.content as Readonly<Record<string, unknown>>).custodianRef };
};

export const applyCommand = (records: readonly CanonicalRecord[], command: KernelCommand): Result<TransitionOutcome> => {
  if (command.commandType === "authorizeAct" && command.payload.authorityRef == null) {
    return { ok: false, error: canonicalError("C2C_E005_AUTHORITY_INVALID", "Authority reference is required and cannot be inferred", ["C2C-INV-004","C2C-INV-019"]) };
  }
  const invariantErrors = foundationInvariantRegistry.validate({ records, command });
  if (invariantErrors.length) return { ok: false, error: invariantErrors[0]! };

  if (command.commandType === "amendInventory") {
    const stale = foundationRecord("computation-result", "stale", { dependency: "inventory", inventoryVersion: command.payload.inventoryVersion });
    return { ok: true, value: { created: [stale], superseded: [], facts: [{ recordType: "computation-result", status: "stale" }] } };
  }
  if (command.commandType === "registerCocoaLot") {
    if (typeof command.payload.quantityKg !== "number" || !Number.isFinite(command.payload.quantityKg) || command.payload.quantityKg <= 0) {
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Cocoa-lot quantity must be a positive finite number") };
    }
    const lot = foundationRecord("material-lot", "known", {
      fixtureId: command.payload.lotId, material: "cocoa", quantityKg: command.payload.quantityKg,
      originRef: command.payload.originRef, custodianRef: command.payload.custodianRef,
      lineage: { parentLotRefs: [], conservationBasis: "measured-mass" }
    });
    return { ok: true, value: { created: [lot], superseded: [], facts: [{ recordType: "material-lot", quantityKg: command.payload.quantityKg }] } };
  }
  if (command.commandType === "transferCustody") {
    const lotRef = command.payload.lotRef;
    const state = materialLotState(records, lotRef);
    if (!state) return { ok: false, error: canonicalError("C2C_E011_IDENTITY_AMBIGUOUS", "Custody transfer requires an existing material lot", [], { lotRef }) };
    const lotContent = state.lot.content as Readonly<Record<string, unknown>>;
    const currentCustodianRef = state.currentCustodianRef;
    if (command.payload.fromCustodianRef !== currentCustodianRef) {
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Transferor is not the lot's current custodian", [], { lotRef, currentCustodianRef, supplied: command.payload.fromCustodianRef }) };
    }
    if (typeof command.payload.quantityKg !== "number" || !Number.isFinite(command.payload.quantityKg) || command.payload.quantityKg !== lotContent.quantityKg) {
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Custody transfer must conserve the complete measured lot quantity", [], { lotRef, lotQuantityKg: lotContent.quantityKg, supplied: command.payload.quantityKg }) };
    }
    if (typeof command.payload.toCustodianRef !== "string" || command.payload.toCustodianRef === currentCustodianRef) {
      return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Custody transfer requires a distinct receiving custodian", [], { lotRef, currentCustodianRef }) };
    }
    const transfer = foundationRecord("custody-transfer", "known", {
      fixtureId: command.payload.transferId, lotRef: command.payload.lotRef,
      fromCustodianRef: command.payload.fromCustodianRef, toCustodianRef: command.payload.toCustodianRef,
      quantityKg: command.payload.quantityKg, conservationCheck: "balanced"
    });
    return { ok: true, value: { created: [transfer], superseded: [], facts: [{ recordType: "custody-transfer", status: "known" }] } };
  }
  if (command.commandType === "initiateCocoaProcessing") {
    const { lotRef, processorRef, workflowId, agentRef, agencyRef, authorityRef } = command.payload;
    const state = materialLotState(records, lotRef);
    if (!state) return { ok: false, error: canonicalError("C2C_E011_IDENTITY_AMBIGUOUS", "Processing initiation requires an existing material lot", [], { lotRef }) };
    if (state.currentCustodianRef !== processorRef) return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Processing may only be initiated by the lot's current custodian", [], { lotRef, currentCustodianRef: state.currentCustodianRef, processorRef }) };
    if (typeof authorityRef !== "string" || authorityRef.trim() === "") return { ok: false, error: canonicalError("C2C_E005_AUTHORITY_INVALID", "Processing initiation requires explicit Authority", ["C2C-INV-004"]) };
    if (typeof agentRef !== "string" || agentRef.trim() === "" || typeof agencyRef !== "string" || agencyRef.trim() === "") return { ok: false, error: canonicalError("C2C_E004_PROVENANCE_MISSING", "Processing initiation requires explicit Agent and Agency", ["C2C-INV-003"]) };
    const duplicate = records.some((record) => record.canonicalType === "transformation" && (record.content as Readonly<Record<string, unknown>>).lotRef === lotRef && (record.content as Readonly<Record<string, unknown>>).initiationStatus === "initiated");
    if (duplicate) return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Processing has already been initiated for this lot", [], { lotRef }) };
    const decisionRef = `originos:decision-${String(workflowId)}-decision`;
    const actionRef = `originos:act-${String(workflowId)}-act`;
    const decision = foundationRecord("decision", "known", { fixtureId: `${String(workflowId)}-decision`, workflowId, lotRef, processorRef, deciderRef: agentRef, commitment: "process-cocoa" });
    const act = foundationRecord("act", "known", { fixtureId: `${String(workflowId)}-act`, workflowId, lotRef, agentRef, authorityRef, decisionRef, conduct: "authorize-cocoa-processing", authorizationStatus: "authorized" });
    const transformation = foundationRecord("transformation", "known", { fixtureId: `${String(workflowId)}-transformation`, workflowId, lotRef, processorRef, change: "raw-cocoa-to-processed-cocoa", causeKind: "agentic", agencyRef, actionRef, initiationStatus: "initiated" });
    return { ok: true, value: { created: [decision, act, transformation], superseded: [], facts: [{ recordType: "decision" }, { recordType: "act" }, { recordType: "transformation", status: "initiated" }] } };
  }
  if (command.commandType === "completeCocoaProcessing") {
    const { completionId, transformationRef, processorRef, outputQuantityKg, accepted, consequence } = command.payload;
    const transformation = typeof transformationRef === "string" ? records.filter((record) => record.canonicalId === transformationRef && record.canonicalType === "transformation").at(-1) : undefined;
    const transformationContent = transformation?.content as Readonly<Record<string, unknown>> | undefined;
    if (!transformation || transformationContent?.initiationStatus !== "initiated") return { ok: false, error: canonicalError("C2C_E011_IDENTITY_AMBIGUOUS", "Processing completion requires an initiated cocoa Transformation", [], { transformationRef }) };
    if (transformationContent.processorRef !== processorRef) return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Only the initiating processor may complete this Transformation", [], { transformationRef, expectedProcessorRef: transformationContent.processorRef, processorRef }) };
    const state = materialLotState(records, transformationContent.lotRef);
    if (!state || state.currentCustodianRef !== processorRef) return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "The processor must retain current custody at completion", [], { transformationRef, currentCustodianRef: state?.currentCustodianRef, processorRef }) };
    const inputQuantityKg = (state.lot.content as Readonly<Record<string, unknown>>).quantityKg;
    if (typeof outputQuantityKg !== "number" || !Number.isFinite(outputQuantityKg) || outputQuantityKg <= 0 || typeof inputQuantityKg !== "number" || outputQuantityKg > inputQuantityKg) return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Processed output must be positive and cannot exceed the input lot quantity", [], { transformationRef, inputQuantityKg, outputQuantityKg }) };
    if (typeof accepted !== "boolean" || typeof consequence !== "string" || consequence.trim() === "") return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "Processing completion requires an explicit acceptance result and consequence", [], { transformationRef }) };
    const alreadyCompleted = records.some((record) => record.canonicalType === "completion" && (record.content as Readonly<Record<string, unknown>>).transformationRef === transformationRef);
    if (alreadyCompleted) return { ok: false, error: canonicalError("C2C_E010_TRANSITION_INVALID", "This Transformation is already complete", [], { transformationRef }) };
    const completionRef = `originos:completion-${String(completionId)}`;
    const outcomeRef = `originos:outcome-${String(completionId)}-outcome`;
    const completion = foundationRecord("completion", "known", { fixtureId: completionId, workflowId: transformationContent.workflowId, transformationRef, lotRef: transformationContent.lotRef, processorRef, inputQuantityKg, outputQuantityKg, yieldPercent: outputQuantityKg / inputQuantityKg * 100, completionStatus: "completed" });
    const outcome = foundationRecord("outcome", accepted === true ? "known" : "rejected", { fixtureId: `${String(completionId)}-outcome`, workflowId: transformationContent.workflowId, transformationRef, completionRef, accepted, result: accepted === true ? "processed-cocoa-accepted" : "processed-cocoa-rejected" });
    const consequenceRecord = foundationRecord("consequence", "known", { fixtureId: `${String(completionId)}-consequence`, workflowId: transformationContent.workflowId, transformationRef, outcomeRef, effect: consequence });
    return { ok: true, value: { created: [completion, outcome, consequenceRecord], superseded: [], facts: [{ recordType: "completion", status: "completed" }, { recordType: "outcome", accepted }, { recordType: "consequence", effect: consequence }] } };
  }
  if (command.commandType === "compareCandidates") {
    const comparison = foundationRecord("comparison-result", "known", {
      fixtureId: command.payload.fixtureId, family: "COMPARISON", candidates: command.payload.candidates,
      relation: "dominates", dominant: command.payload.dominant, ruleOrModelVersion: "comparison-reference-0.1.0",
      uncertainty: { status: "known" }
    });
    return { ok: true, value: { created: [comparison], superseded: [], facts: [{ recordType: "comparison-result", status: "known" }] } };
  }
  if (command.commandType === "recordDecision") {
    const amount = typeof command.payload.amount === "number" ? command.payload.amount : undefined;
    const approvalLimit = typeof command.payload.approvalLimit === "number" ? command.payload.approvalLimit : undefined;
    if (command.payload.systemAccess === true && amount !== undefined && approvalLimit !== undefined && amount > approvalLimit) {
      return { ok: false, error: canonicalError("C2C_E005_AUTHORITY_INVALID", "System access does not provide Authority above the declared approval scope", ["C2C-INV-004"], { amount, approvalLimit }) };
    }
    const decision = foundationRecord("decision", "known", {
      fixtureId: command.payload.fixtureId, deciderRef: command.payload.merchant ?? command.payload.actor ?? "unknown-decider",
      question: "supplier determination", determination: { supplier: command.payload.supplier }, bindingClaimed: false
    });
    return { ok: true, value: { created: [decision], superseded: [], facts: [{ recordType: "decision" }] } };
  }
  if (command.commandType === "evaluateShipment") {
    const feasibility = foundationRecord("computation-result", "known", {
      fixtureId: `${String(command.payload.fixtureId)}-feasibility`, family: "FEASIBILITY", result: "feasible",
      inputSnapshot: { shipmentPossible: command.payload.shipmentPossible }, ruleOrModelVersion: "feasibility-reference-0.1.0", uncertainty: { status: "known" }
    });
    const admissibility = foundationRecord("computation-result", "known", {
      fixtureId: `${String(command.payload.fixtureId)}-admissibility`, family: "ADMISSIBILITY", result: command.payload.clearance === true ? "allowed" : "prohibited",
      inputSnapshot: { clearance: command.payload.clearance }, ruleOrModelVersion: "admissibility-reference-0.1.0", uncertainty: { status: "known" }
    });
    return { ok: true, value: { created: [feasibility, admissibility], superseded: [], facts: [
      { family: "FEASIBILITY", status: "known", result: "feasible" },
      { family: "ADMISSIBILITY", result: command.payload.clearance === true ? "allowed" : "prohibited" }
    ] } };
  }
  if (command.commandType === "delegateAuthority") {
    const delegatorLimit = typeof command.payload.delegatorLimit === "number" ? command.payload.delegatorLimit : 0;
    const requestedLimit = typeof command.payload.requestedLimit === "number" ? command.payload.requestedLimit : 0;
    if (requestedLimit > delegatorLimit) {
      return { ok: false, error: canonicalError("C2C_E005_AUTHORITY_INVALID", "Delegation cannot exceed the delegator's Authority scope", ["C2C-INV-004"], { delegatorLimit, requestedLimit }) };
    }
    const delegation = foundationRecord("delegation", "known", { fixtureId: command.payload.fixtureId, delegateRef: command.payload.delegate, limit: requestedLimit, revocable: true });
    return { ok: true, value: { created: [delegation], superseded: [], facts: [{ recordType: "delegation" }] } };
  }
  if (command.commandType === "attributeAct") {
    const agentRef = String(command.payload.authorizedAgent ?? command.payload.agent ?? "unknown-agent");
    const act = foundationRecord("act", "known", {
      fixtureId: command.payload.fixtureId, agentRef, conduct: command.payload.act,
      authorizationStatus: command.payload.authorizedAgent ? "authorized" : "unknown", response: command.payload.response
    });
    return { ok: true, value: { created: [act], superseded: [], facts: [{ recordType: "act" }] } };
  }
  if (command.commandType === "recordOccurrence") {
    const transformation = foundationRecord("transformation", "known", {
      fixtureId: command.payload.fixtureId, change: command.payload.change,
      causeKind: command.payload.cause === "natural" ? "natural" : "unknown"
    });
    return { ok: true, value: { created: [transformation], superseded: [], facts: [{ recordType: "transformation" }] } };
  }
  if (command.commandType === "recordTransformation") {
    const transformation = foundationRecord("transformation", "known", {
      fixtureId: command.payload.fixtureId, change: command.payload.change,
      causeKind: command.payload.causeKind, agencyRef: command.payload.agencyRef, actionRef: command.payload.actionRef
    });
    return { ok: true, value: { created: [transformation], superseded: [], facts: [{ recordType: "transformation" }] } };
  }
  if (command.commandType === "markInterrupted") {
    const initiation = foundationRecord("initiation", "known", { fixtureId: `${String(command.payload.fixtureId)}-initiation`, eventKind: "initiation", loadingReady: command.payload.loadingReady });
    const interruption = foundationRecord("interruption", "known", { fixtureId: `${String(command.payload.fixtureId)}-interruption`, eventKind: "interruption", cause: command.payload.cause });
    return { ok: true, value: { created: [initiation, interruption], superseded: [], facts: [{ recordType: "initiation" }, { recordType: "interruption" }] } };
  }
  if (command.commandType === "recordOutcome") {
    const completion = foundationRecord("completion", "known", { fixtureId: `${String(command.payload.fixtureId)}-completion`, shipmentArrived: command.payload.shipmentArrived });
    const outcome = foundationRecord("outcome", command.payload.cocoaDamaged === true ? "rejected" : "known", { fixtureId: `${String(command.payload.fixtureId)}-outcome`, accepted: command.payload.cocoaDamaged !== true });
    const consequence = foundationRecord("consequence", "known", { fixtureId: `${String(command.payload.fixtureId)}-consequence`, effect: command.payload.cocoaDamaged === true ? "damage" : "none" });
    return { ok: true, value: { created: [completion, outcome, consequence], superseded: [], facts: [{ recordType: "completion" }, { recordType: "outcome", status: outcome.assertionStatus }, { recordType: "consequence", effect: command.payload.cocoaDamaged === true ? "damage" : "none" }] } };
  }
  if (command.commandType === "recordValueStatus") {
    const outcome = foundationRecord("outcome", "known", { fixtureId: `${String(command.payload.fixtureId)}-outcome`, result: "conforming-delivery", accepted: command.payload.conformingDelivery === true });
    const valueStatus = foundationRecord("value-status", command.payload.buyerInsolvent === true ? "incomplete" : "known", { fixtureId: `${String(command.payload.fixtureId)}-value`, outcomeRef: outcome.canonicalId, purposeFulfillmentAsserted: false });
    return { ok: true, value: { created: [outcome, valueStatus], superseded: [], facts: [{ recordType: "outcome", status: "known" }, { recordType: "value-status", status: valueStatus.assertionStatus }] } };
  }
  if (command.commandType === "verifySemanticRoundTrip") {
    const original = [foundationRecord("round-trip-sample", "known", {
      fixtureId: command.payload.fixtureId, relations: ["originos:related-sample"],
      uncertainty: { confidence: 0.75 }, history: { predecessorVersions: [] }
    })];
    const imported = importCanonicalBundle(exportCanonicalBundle(original));
    if (!imported.ok) return imported;
    return { ok: true, value: { created: [], superseded: [], facts: [{
      semanticEquivalent: semanticallyEquivalent(original, imported.value.records)
    }] } };
  }
  return notImplemented(`kernel command ${command.commandType}`);
};

export const exportedKernelCapabilities = [
  "identity", "epistemic", "computation", "normative", "agency", "transformation", "realization", "interchange"
] as const;
