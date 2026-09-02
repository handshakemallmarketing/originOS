import { describe, expect, it } from "vitest";
import { InMemoryCanonicalRepository } from "@originos/repository";
import { OriginApplication, type ApplicationCommandEnvelope } from "./index.js";

const envelope = (commandId: string, commandType: string, payload: Readonly<Record<string, unknown>>): ApplicationCommandEnvelope => ({
  commandId, agentRef: "originos:merchant-rc", agencyRef: "originos:agency-rc", authorityRef: "originos:authority-rc",
  purposeRef: "originos:purpose-conforming-cocoa", evidenceRefs: [`originos:evidence-${commandId}`],
  attributionRule: "originos:attribution-direct-agent", command: { commandType, payload }
});

const commands: readonly ApplicationCommandEnvelope[] = [
  envelope("rc-lot", "registerCocoaLot", { lotId: "rc-raw", quantityKg: 750, originRef: "originos:farm-rc", custodianRef: "originos:warehouse-rc" }),
  envelope("rc-source-custody", "transferCustody", { transferId: "rc-source", lotRef: "originos:material-lot-rc-raw", fromCustodianRef: "originos:warehouse-rc", toCustodianRef: "originos:processor-rc", quantityKg: 750 }),
  envelope("rc-initiate", "initiateCocoaProcessing", { workflowId: "rc-process", lotRef: "originos:material-lot-rc-raw", processorRef: "originos:processor-rc" }),
  envelope("rc-complete", "completeCocoaProcessing", { completionId: "rc-completion", transformationRef: "originos:transformation-rc-process-transformation", processorRef: "originos:processor-rc", outputQuantityKg: 700, accepted: true, consequence: "processing-yield-recorded" }),
  envelope("rc-materialize", "materializeProcessedCocoaLot", { processedLotId: "rc-processed", completionRef: "originos:completion-rc-completion" }),
  envelope("rc-deliver", "transferCustody", { transferId: "rc-delivery", lotRef: "originos:material-lot-rc-processed", fromCustodianRef: "originos:processor-rc", toCustodianRef: "originos:buyer-rc", quantityKg: 700 }),
  envelope("rc-value", "recordCocoaDeliveryValue", { realizationId: "rc-realization", processedLotRef: "originos:material-lot-rc-processed", buyerRef: "originos:buyer-rc", purposeFulfilled: true, considerationStatus: "settled" })
];

describe("SW2 bounded-alpha release candidate", () => {
  it("persists the 12-record chain, preserves idempotency, and locks consumed input", async () => {
    const application = new OriginApplication(new InMemoryCanonicalRepository());
    for (const command of commands) expect((await application.execute(command)).ok).toBe(true);
    const records = await application.all();
    expect(records).toHaveLength(12);
    expect(records.map((record) => record.canonicalType)).toEqual(["material-lot", "custody-transfer", "decision", "act", "transformation", "completion", "outcome", "consequence", "material-lot", "custody-transfer", "outcome", "value-status"]);
    expect(records.at(-1)?.content).toMatchObject({ processedLotRef: "originos:material-lot-rc-processed", buyerRef: "originos:buyer-rc", realizationStatus: "realized" });
    const replay = await application.execute(commands.at(-1)!);
    expect(replay.ok).toBe(true);
    expect(replay.ok && replay.value.created).toHaveLength(2);
    expect(await application.all()).toHaveLength(12);
    const transfer = await application.execute(envelope("rc-consumed-transfer", "transferCustody", { transferId: "rc-consumed", lotRef: "originos:material-lot-rc-raw", fromCustodianRef: "originos:processor-rc", toCustodianRef: "originos:warehouse-2", quantityKg: 750 }));
    expect(transfer.ok).toBe(false);
    if (!transfer.ok) expect(transfer.error.code).toBe("C2C_E010_TRANSITION_INVALID");
  });

  it("serializes concurrent commands so semantic uniqueness sees committed state", async () => {
    const application = new OriginApplication(new InMemoryCanonicalRepository());
    for (const command of commands.slice(0, 4)) expect((await application.execute(command)).ok).toBe(true);
    const competing = [
      envelope("rc-materialize-a", "materializeProcessedCocoaLot", { processedLotId: "rc-processed-a", completionRef: "originos:completion-rc-completion" }),
      envelope("rc-materialize-b", "materializeProcessedCocoaLot", { processedLotId: "rc-processed-b", completionRef: "originos:completion-rc-completion" })
    ];
    const results = await Promise.all(competing.map((command) => application.execute(command)));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const rejected = results.find((result) => !result.ok);
    expect(rejected && !rejected.ok && rejected.error.code).toBe("C2C_E010_TRANSITION_INVALID");
    expect((await application.all()).filter((record) => record.canonicalType === "material-lot")).toHaveLength(2);
    expect((await application.execute(envelope("rc-after-rejection", "registerCocoaLot", { lotId: "rc-after-rejection", quantityKg: 1, originRef: "originos:farm-rc", custodianRef: "originos:warehouse-rc" }))).ok).toBe(true);
  });
});
