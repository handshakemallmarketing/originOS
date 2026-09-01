import { applyCommand } from "@originos/kernel";
import type { Result } from "@originos/canonical-types";
import type { ConformanceFixture } from "./fixtures.js";
export { sprint0Fixtures } from "./fixtures.js";
export type { ConformanceFixture } from "./fixtures.js";

export interface FixtureResult { readonly fixtureId: string; readonly assertions: readonly unknown[] }

const subsetMatches = (actual: Readonly<Record<string, unknown>>, expected: Readonly<Record<string, unknown>>): boolean =>
  Object.entries(expected).every(([key, value]) => Object.is(actual[key], value));

export const executeFixture = (fixture: ConformanceFixture): Result<FixtureResult> => {
  const command = { ...fixture.when, payload: { ...fixture.given, ...fixture.when.payload, fixtureId: fixture.id } };
  const transition = applyCommand([], command);
  const expectedError = fixture.then.find((assertion) => typeof assertion.error === "string")?.error;
  if (!transition.ok) {
    return expectedError === transition.error.code
      ? { ok: true, value: { fixtureId: fixture.id, assertions: [`expected error ${expectedError}`] } }
      : { ok: false, error: transition.error };
  }
  if (expectedError) return { ok: false, error: { code: "C2C_E006_INVARIANT_VIOLATION", message: `Expected error ${expectedError} but transition succeeded`, invariantRefs: fixture.c2cRefs, details: {} } };
  const actual = [...transition.value.facts, ...transition.value.created.map((record) => ({ recordType: record.canonicalType, status: record.assertionStatus }))];
  const missing = fixture.then.filter((expected) => !actual.some((candidate) => subsetMatches(candidate, expected)));
  if (missing.length) return { ok: false, error: { code: "C2C_E006_INVARIANT_VIOLATION", message: "Expected semantic assertions were not produced", invariantRefs: fixture.c2cRefs, details: { missing } } };
  const forbidden = fixture.mustNot.filter((term) => JSON.stringify(actual).includes(term));
  if (forbidden.length) return { ok: false, error: { code: "C2C_E006_INVARIANT_VIOLATION", message: "Forbidden semantic side effects were produced", invariantRefs: fixture.c2cRefs, details: { forbidden } } };
  return { ok: true, value: { fixtureId: fixture.id, assertions: fixture.then } };
};
