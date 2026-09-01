import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "@originos/canonical-types";
import { applyCommand, type KernelCommand } from "./index.js";

const lot: KernelCommand = { commandType: "registerCocoaLot", payload: { lotId: "completion-lot", quantityKg: 750, originRef: "originos:farm-1", custodianRef: "originos:warehouse-1" } };
const transfer: KernelCommand = { commandType: "transferCustody", payload: { transferId: "completion-transfer", lotRef: "originos:material-lot-completion-lot", fromCustodianRef: "originos:warehouse-1", toCustodianRef: "originos:processor-1", quantityKg: 750 } };
const initiate: KernelCommand = { commandType: "initiateCocoaProcessing", payload: { workflowId: "completion-workflow", lotRef: "originos:material-lot-completion-lot", processorRef: "originos:processor-1", agentRef: "originos:merchant-1", agencyRef: "originos:agency-1", authorityRef: "originos:authority-1" } };
const complete: KernelCommand = { commandType: "completeCocoaProcessing", payload: { completionId: "completion-1", transformationRef: "originos:transformation-completion-workflow-transformation", processorRef: "originos:processor-1", outputQuantityKg: 700, accepted: true, consequence: "processing-yield-recorded" } };
const applied = (records: readonly CanonicalRecord[], command: KernelCommand): readonly CanonicalRecord[] => { const result = applyCommand(records, command); expect(result.ok).toBe(true); return result.ok ? [...records, ...result.value.created] : records; };
const ready = (): readonly CanonicalRecord[] => applied(applied(applied([], lot), transfer), initiate);

describe("SW2-05 cocoa processing completion", () => {
  it("rejects completion without an initiated Transformation", () => { const result = applyCommand([], complete); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E011_IDENTITY_AMBIGUOUS"); });
  it("rejects impossible output quantity", () => { const result = applyCommand(ready(), { ...complete, payload: { ...complete.payload, outputQuantityKg: 751 } }); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); });
  it("atomically creates linked Completion, Outcome, and Consequence records", () => {
    const result = applyCommand(ready(), complete); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.created.map((record) => record.canonicalType)).toEqual(["completion", "outcome", "consequence"]); expect(result.value.created[0]?.content).toMatchObject({ inputQuantityKg: 750, outputQuantityKg: 700, completionStatus: "completed" }); expect(result.value.created[1]?.content).toMatchObject({ completionRef: "originos:completion-completion-1", accepted: true }); expect(result.value.created[2]?.content).toMatchObject({ outcomeRef: "originos:outcome-completion-1-outcome", effect: "processing-yield-recorded" }); }
  });
  it("rejects a second completion for the same Transformation", () => { const records = applied(ready(), complete); const result = applyCommand(records, { ...complete, payload: { ...complete.payload, completionId: "completion-2" } }); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); });
});
