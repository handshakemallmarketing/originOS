import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "@originos/canonical-types";
import { applyCommand, type KernelCommand } from "./index.js";

const commands: readonly KernelCommand[] = [
  { commandType: "registerCocoaLot", payload: { lotId: "source-lot", quantityKg: 750, originRef: "originos:farm-1", custodianRef: "originos:warehouse-1" } },
  { commandType: "transferCustody", payload: { transferId: "source-transfer", lotRef: "originos:material-lot-source-lot", fromCustodianRef: "originos:warehouse-1", toCustodianRef: "originos:processor-1", quantityKg: 750 } },
  { commandType: "initiateCocoaProcessing", payload: { workflowId: "source-workflow", lotRef: "originos:material-lot-source-lot", processorRef: "originos:processor-1", agentRef: "originos:merchant-1", agencyRef: "originos:agency-1", authorityRef: "originos:authority-1" } },
  { commandType: "completeCocoaProcessing", payload: { completionId: "source-completion", transformationRef: "originos:transformation-source-workflow-transformation", processorRef: "originos:processor-1", outputQuantityKg: 700, accepted: true, consequence: "processing-yield-recorded" } }
];
const materialize: KernelCommand = { commandType: "materializeProcessedCocoaLot", payload: { processedLotId: "processed-lot", completionRef: "originos:completion-source-completion" } };
const applied = (records: readonly CanonicalRecord[], command: KernelCommand): readonly CanonicalRecord[] => { const result = applyCommand(records, command); expect(result.ok).toBe(true); return result.ok ? [...records, ...result.value.created] : records; };
const ready = (): readonly CanonicalRecord[] => commands.reduce<readonly CanonicalRecord[]>((records, command) => applied(records, command), []);

describe("SW2-06 processed cocoa material lineage", () => {
  it("rejects an absent Completion", () => { const result = applyCommand([], materialize); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E011_IDENTITY_AMBIGUOUS"); });
  it("creates the exact completed output with parent lineage, loss, and custody continuity", () => { const result = applyCommand(ready(), materialize); expect(result.ok).toBe(true); if (result.ok) expect(result.value.created[0]?.content).toMatchObject({ material: "processed-cocoa", quantityKg: 700, custodianRef: "originos:processor-1", qualityStatus: "accepted", sourceCompletionRef: "originos:completion-source-completion", lineage: { parentLotRefs: ["originos:material-lot-source-lot"], inputQuantityKg: 750, outputQuantityKg: 700, processLossKg: 50 } }); });
  it("rejects materialization after custody no longer matches the completing processor", () => { const moved = applied(ready(), { commandType: "transferCustody", payload: { transferId: "post-process-transfer", lotRef: "originos:material-lot-source-lot", fromCustodianRef: "originos:processor-1", toCustodianRef: "originos:warehouse-2", quantityKg: 750 } }); const result = applyCommand(moved, materialize); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); });
  it("locks the consumed input lot after processed output materialization", () => { const records = applied(ready(), materialize); const result = applyCommand(records, { commandType: "transferCustody", payload: { transferId: "consumed-source-transfer", lotRef: "originos:material-lot-source-lot", fromCustodianRef: "originos:processor-1", toCustodianRef: "originos:warehouse-2", quantityKg: 750 } }); expect(result.ok).toBe(false); if (!result.ok) { expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); expect(result.error.message).toContain("Consumed input lot"); } });
  it("rejects a second processed lot for the same Completion", () => { const records = applied(ready(), materialize); const result = applyCommand(records, { ...materialize, payload: { ...materialize.payload, processedLotId: "processed-lot-2" } }); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); });
  it("rejects materialization if the Completion's own quantities are not conserved, even though completeCocoaProcessing can never produce such a record", () => {
    // completeCocoaProcessing already enforces outputQuantityKg <= inputQuantityKg, so this
    // scenario can only arise from a Completion record reconstructed or tampered with
    // out-of-band. materializeProcessedCocoaLot must not trust the Completion's stored
    // quantities without re-checking them — this is the defense that check exists for.
    const base = ready();
    const completion = base.find((record) => record.canonicalType === "completion");
    expect(completion).toBeDefined();
    const tampered = base.map((record) => record === completion ? { ...record, content: { ...(record.content as Readonly<Record<string, unknown>>), outputQuantityKg: (record.content as { inputQuantityKg: number }).inputQuantityKg + 1 } } : record);
    const result = applyCommand(tampered, materialize);
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID"); expect(result.error.message).toContain("conserved output quantity"); }
  });
});
