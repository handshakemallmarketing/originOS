import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalId } from "@originos/canonical-types";
import { JsonFileCanonicalRepository } from "@originos/repository";
import { OriginApplication, runCocoaProcurementAndProcessing } from "./index.js";

describe("Software Sprint 1 Merchant/Cocoa vertical slice", () => {
  it("executes, persists, restarts, and queries the canonical workflow", async () => {
    const directory = await mkdtemp(join(tmpdir(), "originos-s1-"));
    const storePath = join(directory, "canonical-store.json");
    const application = new OriginApplication(new JsonFileCanonicalRepository(storePath));
    const result = await runCocoaProcurementAndProcessing(application, {
      runId: "s1-demo", quantityKg: 1000, originRef: "originos:farm-ghana-1",
      merchantRef: "originos:merchant-1", warehouseRef: "originos:warehouse-1", processorRef: "originos:processor-1"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(11);
    expect(result.value.map((record) => record.canonicalType)).toEqual([
      "material-lot", "custody-transfer", "comparison-result", "decision", "act", "transformation",
      "completion", "outcome", "consequence", "outcome", "value-status"
    ]);
    expect(result.value.every((record) => record.provenance.sourceRefs.includes(canonicalId("originos:evidence-cocoa-receipt")))).toBe(true);

    const restarted = new OriginApplication(new JsonFileCanonicalRepository(storePath));
    expect(await restarted.all()).toHaveLength(11);
    const lot = await restarted.current(canonicalId("originos:material-lot-s1-demo-lot"));
    expect(lot.ok).toBe(true);
    if (lot.ok) expect(lot.value.content).toMatchObject({ quantityKg: 1000, custodianRef: "originos:warehouse-1" });
  });

  it("rejects a command boundary missing mandatory authority and evidence context", async () => {
    const application = new OriginApplication(new JsonFileCanonicalRepository(join(await mkdtemp(join(tmpdir(), "originos-s1-invalid-")), "store.json")));
    const result = await application.execute({
      commandId: "invalid", agentRef: "originos:merchant-1", agencyRef: "", authorityRef: "", purposeRef: "",
      evidenceRefs: [], attributionRule: "", command: { commandType: "recordDecision", payload: {} }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("C2C_E004_PROVENANCE_MISSING");
  });

  it("rejects direct command identity reuse with altered meaning", async () => {
    const application = new OriginApplication(new JsonFileCanonicalRepository(join(await mkdtemp(join(tmpdir(), "originos-s1-conflict-")), "store.json")));
    const base = { commandId: "same-command", agentRef: "originos:merchant-1", agencyRef: "originos:agency-cocoa-procurement",
      authorityRef: "originos:authority-cocoa-procurement", purposeRef: "originos:purpose-conforming-cocoa",
      evidenceRefs: ["originos:evidence-cocoa-receipt"], attributionRule: "originos:attribution-direct-agent",
      command: { commandType: "recordDecision" as const, payload: { fixtureId: "same-command", merchant: "originos:merchant-1", supplier: "originos:processor-1" } } };
    expect((await application.execute(base)).ok).toBe(true);
    const conflict = await application.execute({ ...base, purposeRef: "originos:purpose-altered" });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe("C2C_E009_CONFLICT_UNRESOLVED");
  });
});
