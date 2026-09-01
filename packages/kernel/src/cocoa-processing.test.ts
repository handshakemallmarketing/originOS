import { describe, expect, it } from "vitest";
import { applyCommand } from "./index.js";
import type { CanonicalRecord } from "@originos/canonical-types";

const lot = { commandType: "registerCocoaLot", payload: { lotId: "processing-lot", quantityKg: 750, originRef: "originos:farm-1", custodianRef: "originos:warehouse-1" } };
const transfer = { commandType: "transferCustody", payload: { transferId: "processing-transfer", lotRef: "originos:material-lot-processing-lot", fromCustodianRef: "originos:warehouse-1", toCustodianRef: "originos:processor-1", quantityKg: 750 } };
const initiate = { commandType: "initiateCocoaProcessing", payload: { workflowId: "processing-1", lotRef: "originos:material-lot-processing-lot", processorRef: "originos:processor-1", agentRef: "originos:merchant-1", agencyRef: "originos:agency-1", authorityRef: "originos:authority-1" } };

const applied = (records: readonly CanonicalRecord[], command: typeof lot | typeof transfer | typeof initiate): readonly CanonicalRecord[] => {
  const result = applyCommand(records, command); expect(result.ok).toBe(true);
  return result.ok ? [...records, ...result.value.created] : records;
};

describe("SW2-04 cocoa processing initiation", () => {
  it("rejects an absent material lot", () => { const result = applyCommand([], initiate); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E011_IDENTITY_AMBIGUOUS"); });
  it("rejects initiation before custody reaches the processor", () => { const result = applyCommand(applied([], lot), initiate); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); });
  it("atomically creates a linked Decision, Act, and initiated Transformation", () => {
    const result = applyCommand(applied(applied([], lot), transfer), initiate); expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.created.map((record) => record.canonicalType)).toEqual(["decision", "act", "transformation"]);
      expect(result.value.created[1]?.content).toMatchObject({ decisionRef: "originos:decision-processing-1-decision", authorityRef: "originos:authority-1" });
      expect(result.value.created[2]?.content).toMatchObject({ lotRef: "originos:material-lot-processing-lot", processorRef: "originos:processor-1", actionRef: "originos:act-processing-1-act", initiationStatus: "initiated" });
    }
  });
  it("rejects a second initiation for the same lot", () => {
    const ready = applied(applied([], lot), transfer); const first = applied(ready, initiate); const result = applyCommand(first, { ...initiate, payload: { ...initiate.payload, workflowId: "processing-2" } });
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID");
  });
});
