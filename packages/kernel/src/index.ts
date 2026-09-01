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
    const lot = foundationRecord("material-lot", "known", {
      fixtureId: command.payload.lotId, material: "cocoa", quantityKg: command.payload.quantityKg,
      originRef: command.payload.originRef, custodianRef: command.payload.custodianRef,
      lineage: { parentLotRefs: [], conservationBasis: "measured-mass" }
    });
    return { ok: true, value: { created: [lot], superseded: [], facts: [{ recordType: "material-lot", quantityKg: command.payload.quantityKg }] } };
  }
  if (command.commandType === "transferCustody") {
    const transfer = foundationRecord("custody-transfer", "known", {
      fixtureId: command.payload.transferId, lotRef: command.payload.lotRef,
      fromCustodianRef: command.payload.fromCustodianRef, toCustodianRef: command.payload.toCustodianRef,
      quantityKg: command.payload.quantityKg, conservationCheck: "balanced"
    });
    return { ok: true, value: { created: [transfer], superseded: [], facts: [{ recordType: "custody-transfer", status: "known" }] } };
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
