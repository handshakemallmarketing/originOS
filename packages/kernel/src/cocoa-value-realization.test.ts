import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "@originos/canonical-types";
import { applyCommand, type KernelCommand } from "./index.js";

const chain: readonly KernelCommand[] = [
  { commandType: "registerCocoaLot", payload: { lotId: "value-source", quantityKg: 750, originRef: "originos:farm-1", custodianRef: "originos:warehouse-1" } },
  { commandType: "transferCustody", payload: { transferId: "value-source-transfer", lotRef: "originos:material-lot-value-source", fromCustodianRef: "originos:warehouse-1", toCustodianRef: "originos:processor-1", quantityKg: 750 } },
  { commandType: "initiateCocoaProcessing", payload: { workflowId: "value-workflow", lotRef: "originos:material-lot-value-source", processorRef: "originos:processor-1", agentRef: "originos:merchant-1", agencyRef: "originos:agency-1", authorityRef: "originos:authority-1" } },
  { commandType: "completeCocoaProcessing", payload: { completionId: "value-completion", transformationRef: "originos:transformation-value-workflow-transformation", processorRef: "originos:processor-1", outputQuantityKg: 700, accepted: true, consequence: "processing-yield-recorded" } },
  { commandType: "materializeProcessedCocoaLot", payload: { processedLotId: "value-processed", completionRef: "originos:completion-value-completion" } }
];
const deliver: KernelCommand = { commandType: "transferCustody", payload: { transferId: "value-delivery", lotRef: "originos:material-lot-value-processed", fromCustodianRef: "originos:processor-1", toCustodianRef: "originos:buyer-1", quantityKg: 700 } };
const realize: KernelCommand = { commandType: "recordCocoaDeliveryValue", payload: { realizationId: "value-1", processedLotRef: "originos:material-lot-value-processed", buyerRef: "originos:buyer-1", purposeFulfilled: true, considerationStatus: "settled", purposeRef: "originos:purpose-conforming-cocoa", evidenceRefs: ["originos:evidence-payment-1"] } };
const applied = (records: readonly CanonicalRecord[], command: KernelCommand): readonly CanonicalRecord[] => { const result = applyCommand(records, command); expect(result.ok).toBe(true); return result.ok ? [...records, ...result.value.created] : records; };
const processed = (): readonly CanonicalRecord[] => chain.reduce<readonly CanonicalRecord[]>((records, command) => applied(records, command), []);

describe("SW2-07 cocoa delivery and Value realization", () => {
  it("rejects Value before delivery to the buyer", () => { const result = applyCommand(processed(), realize); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); });
  it("creates a delivery Outcome and realized Value only after delivery and settlement", () => { const result = applyCommand(applied(processed(), deliver), realize); expect(result.ok).toBe(true); if (result.ok) { expect(result.value.created.map((record) => record.canonicalType)).toEqual(["outcome", "value-status"]); expect(result.value.created[0]?.content).toMatchObject({ buyerRef: "originos:buyer-1", delivered: true, deliveryTransferRef: "originos:custody-transfer-value-delivery" }); expect(result.value.created[1]?.content).toMatchObject({ purposeFulfillmentAsserted: true, considerationStatus: "settled", realizationStatus: "realized" }); } });
  it("records incomplete Value when consideration remains pending", () => { const result = applyCommand(applied(processed(), deliver), { ...realize, payload: { ...realize.payload, considerationStatus: "pending" } }); expect(result.ok).toBe(true); if (result.ok) { expect(result.value.created[1]?.assertionStatus).toBe("incomplete"); expect(result.value.created[1]?.content).toMatchObject({ realizationStatus: "incomplete" }); } });
  it("rejects a second Value status for the same processed lot", () => { const delivered = applied(processed(), deliver); const records = applied(delivered, realize); const result = applyCommand(records, { ...realize, payload: { ...realize.payload, realizationId: "value-2" } }); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); });
});
