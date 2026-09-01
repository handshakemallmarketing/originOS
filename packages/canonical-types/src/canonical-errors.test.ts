import { describe, expect, it } from "vitest";
import { canonicalError, canonicalErrorCodes } from "./index.js";

describe("C2C-01 canonical error profile", () => {
  it("represents exactly C2C-E001 through C2C-E014", () => {
    expect(canonicalErrorCodes).toHaveLength(14);
    expect(canonicalErrorCodes.map((code) => canonicalError(code, code).code)).toEqual(canonicalErrorCodes);
  });
});
