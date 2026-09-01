import { describe, expect, it } from "vitest";
import { applyCommand } from "./index.js";

describe("SW0-06 Transformation and realization", () => {
  it("records natural Transformation without inventing Agency or Action", () => {
    const result = applyCommand([], { commandType: "recordOccurrence", payload: { change: "degraded", cause: "natural" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.created.map((record) => record.canonicalType)).toEqual(["transformation"]);
  });

  it("keeps initiation and interruption distinct from completion and Outcome", () => {
    const result = applyCommand([], { commandType: "markInterrupted", payload: { loadingReady: true, cause: "power-failure" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.created.map((record) => record.canonicalType)).toEqual(["initiation", "interruption"]);
  });

  it("keeps Outcome, Consequence, and Value status distinct", () => {
    const result = applyCommand([], { commandType: "recordValueStatus", payload: { conformingDelivery: true, buyerInsolvent: true } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.created.map((record) => record.canonicalType)).toEqual(["outcome", "value-status"]);
      expect(result.value.created[1]?.assertionStatus).toBe("incomplete");
    }
  });

  it("executes the real semantic export/import comparator", () => {
    const result = applyCommand([], { commandType: "verifySemanticRoundTrip", payload: { fixtureId: "S0-X05" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.facts).toContainEqual({ semanticEquivalent: true });
  });
});
