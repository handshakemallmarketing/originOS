import { describe, expect, it } from "vitest";
import { applyCommand } from "./index.js";

const lotCommand = { commandType: "registerCocoaLot", payload: { lotId: "custody-lot", quantityKg: 750, originRef: "originos:farm-1", custodianRef: "originos:warehouse-1" } } as const;
const transfer = (overrides: Readonly<Record<string, unknown>> = {}) => ({ commandType: "transferCustody", payload: { transferId: "custody-1", lotRef: "originos:material-lot-custody-lot", fromCustodianRef: "originos:warehouse-1", toCustodianRef: "originos:processor-1", quantityKg: 750, ...overrides } });

describe("SW2-03 cocoa custody integrity", () => {
  it("requires positive lot quantity", () => {
    const result = applyCommand([], { ...lotCommand, payload: { ...lotCommand.payload, quantityKg: 0 } });
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E010_TRANSITION_INVALID");
  });
  it("rejects transfer of an absent lot", () => {
    const result = applyCommand([], transfer());
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("C2C_E011_IDENTITY_AMBIGUOUS");
  });
  it("requires the current custodian and complete conserved quantity", () => {
    const registered = applyCommand([], lotCommand); expect(registered.ok).toBe(true); if (!registered.ok) return;
    const wrongCustodian = applyCommand(registered.value.created, transfer({ fromCustodianRef: "originos:someone-else" }));
    expect(wrongCustodian.ok).toBe(false); if (!wrongCustodian.ok) expect(wrongCustodian.error.code).toBe("C2C_E010_TRANSITION_INVALID");
    const partial = applyCommand(registered.value.created, transfer({ quantityKg: 100 }));
    expect(partial.ok).toBe(false); if (!partial.ok) expect(partial.error.code).toBe("C2C_E010_TRANSITION_INVALID");
  });
  it("advances derived custody and rejects reuse of the former custodian", () => {
    const registered = applyCommand([], lotCommand); expect(registered.ok).toBe(true); if (!registered.ok) return;
    const first = applyCommand(registered.value.created, transfer()); expect(first.ok).toBe(true); if (!first.ok) return;
    const records = [...registered.value.created, ...first.value.created];
    const stale = applyCommand(records, transfer({ transferId: "custody-2", toCustodianRef: "originos:port-1" }));
    expect(stale.ok).toBe(false);
    const next = applyCommand(records, transfer({ transferId: "custody-2", fromCustodianRef: "originos:processor-1", toCustodianRef: "originos:port-1" }));
    expect(next.ok).toBe(true);
  });
});
