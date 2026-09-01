import { describe, expect, it } from "vitest";
import { foundationInvariantRegistry } from "./index.js";

describe("foundation invariant registry", () => {
  it("rejects untyped null", () => {
    const errors = foundationInvariantRegistry.validate({ records: [], command: { payload: { authorityRef: null } } });
    expect(errors.some((error) => error.invariantRefs.includes("C2C-INV-019"))).toBe(true);
  });

  it("rejects a seventh canonical computation family", () => {
    const errors = foundationInvariantRegistry.validate({ records: [], command: { payload: { family: "OPTIMIZATION" } } });
    expect(errors.some((error) => error.code === "C2C_E012_UNSUPPORTED_EXTENSION")).toBe(true);
  });

  it("rejects fictional enterprise act attribution", () => {
    const errors = foundationInvariantRegistry.validate({ records: [], command: { commandType: "attributeAct", payload: { agent: "enterprise-1", collectiveAttributionRule: false } } });
    expect(errors.some((error) => error.invariantRefs.includes("C2C-INV-017"))).toBe(true);
  });

  it("rejects agentic Transformation without executable Agency and Action", () => {
    const errors = foundationInvariantRegistry.validate({ records: [], command: { commandType: "recordTransformation", payload: { causeKind: "agentic" } } });
    expect(errors.some((error) => error.invariantRefs.includes("C2C-INV-009"))).toBe(true);
  });

  it("rejects realization without an actual Outcome", () => {
    const errors = foundationInvariantRegistry.validate({ records: [], command: { commandType: "recordRealization", payload: { outcomeRef: "originos:missing-outcome" } } });
    expect(errors.some((error) => error.invariantRefs.includes("C2C-INV-012"))).toBe(true);
  });

  it.each([
    ["inferActualityFromRecord", "inferActuality", "C2C-INV-001"],
    ["deriveComputation", "inferTruth", "C2C-INV-002"],
    ["createParticipant", "inferAgent", "C2C-INV-003"],
    ["formCommitment", "inferOccurrence", "C2C-INV-008"],
    ["linkCausalContribution", "inferResponsibility", "C2C-INV-013"],
    ["determinePersistence", "inferSustainability", "C2C-INV-014"],
    ["recordFailure", "inferDissolution", "C2C-INV-015"],
    ["determineDissolution", "eraseHistory", "C2C-INV-016"]
  ])("rejects prohibited inference for %s", (commandType, flag, invariant) => {
    const errors = foundationInvariantRegistry.validate({ records: [], command: { commandType, payload: { [flag]: true } } });
    expect(errors.some((error) => error.invariantRefs.includes(invariant))).toBe(true);
  });
});
