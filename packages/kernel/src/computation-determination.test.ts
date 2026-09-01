import { describe, expect, it } from "vitest";
import { applyCommand } from "./index.js";

describe("SW0-04 computation and determination boundaries", () => {
  it("creates Comparison without Choice or Decision side effects", () => {
    const result = applyCommand([], { commandType: "compareCandidates", payload: { candidates: ["a","b"], dominant: "a", fixtureId: "unit-m01" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.created.map((record) => record.canonicalType)).toEqual(["comparison-result"]);
  });

  it("records a non-binding Decision without Commitment", () => {
    const result = applyCommand([], { commandType: "recordDecision", payload: { merchant: "merchant-1", supplier: "supplier-a", fixtureId: "unit-m03" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.created.map((record) => record.canonicalType)).toEqual(["decision"]);
  });

  it("rejects system access as Authority above scope", () => {
    const result = applyCommand([], { commandType: "recordDecision", payload: { actor: "employee", systemAccess: true, approvalLimit: 1000, amount: 5000 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("C2C_E005_AUTHORITY_INVALID");
  });

  it("separates Feasibility from Admissibility", () => {
    const result = applyCommand([], { commandType: "evaluateShipment", payload: { shipmentPossible: true, clearance: false, fixtureId: "unit-c02" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: "FEASIBILITY", result: "feasible" }),
      expect.objectContaining({ family: "ADMISSIBILITY", result: "prohibited" })
    ]));
  });
});
