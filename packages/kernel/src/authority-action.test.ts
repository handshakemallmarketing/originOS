import { describe, expect, it } from "vitest";
import { applyCommand } from "./index.js";

describe("SW0-05 Authority delegation and act attribution", () => {
  it("records an attributable act without inventing an Outcome", () => {
    const result = applyCommand([], { commandType: "attributeAct", payload: { authorizedAgent: "merchant-1", act: "transmit-order", response: "rejected", fixtureId: "unit-m04" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.created.map((record) => record.canonicalType)).toEqual(["act"]);
  });

  it("rejects delegation above delegator scope", () => {
    const result = applyCommand([], { commandType: "delegateAuthority", payload: { delegatorLimit: 1000, requestedLimit: 5000, delegate: "buyer-1" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("C2C_E005_AUTHORITY_INVALID");
  });

  it("rejects enterprise attribution without collective rule", () => {
    const result = applyCommand([], { commandType: "attributeAct", payload: { agent: "enterprise-1", collectiveAttributionRule: false } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.invariantRefs).toContain("C2C-INV-017");
  });
});
