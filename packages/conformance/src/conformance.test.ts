import { describe, expect, it } from "vitest";
import { executeFixture, sprint0Fixtures } from "./index.js";

describe("SW0-06 Transformation/realization conformance suite", () => {
  it("contains exactly the controlled 15 fixtures", () => {
    expect(sprint0Fixtures.map((fixture) => fixture.id)).toEqual([
      "S0-M01","S0-M02","S0-M03","S0-M04","S0-M05",
      "S0-C01","S0-C02","S0-C03","S0-C04","S0-C05",
      "S0-X01","S0-X02","S0-X03","S0-X04","S0-X05"
    ]);
  });

  it.each(sprint0Fixtures)("$id — $title", (fixture) => {
    const result = executeFixture(fixture);
    expect(result.ok, result.ok ? undefined : `${result.error.code}: ${result.error.message}`).toBe(true);
  });
});
