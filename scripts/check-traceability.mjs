import { readFileSync } from "node:fs";
const matrix = JSON.parse(readFileSync(new URL("../docs/traceability/matrix.json", import.meta.url), "utf8"));
const invariantMatrix = JSON.parse(readFileSync(new URL("../docs/traceability/invariants.json", import.meta.url), "utf8"));
const required = Array.from({ length: 15 }, (_, i) => i < 5 ? `S0-M0${i + 1}` : i < 10 ? `S0-C0${i - 4}` : `S0-X0${i - 9}`);
const present = new Set(matrix.fixtures.map((x) => x.id));
const missing = required.filter((id) => !present.has(id));
if (missing.length) {
  console.error(`Missing fixture traceability: ${missing.join(", ")}`);
  process.exit(1);
}
const nongreen = matrix.fixtures.filter((fixture) => !String(fixture.status).startsWith("green-"));
if (nongreen.length) {
  console.error(`Non-green fixture traceability: ${nongreen.map((fixture) => fixture.id).join(", ")}`);
  process.exit(1);
}
console.log("Traceability check passed: 15/15 fixtures mapped.");
const requiredInvariants = Array.from({ length: 20 }, (_, index) => `C2C-INV-${String(index + 1).padStart(3, "0")}`);
const invariantRows = new Map(invariantMatrix.invariants.map((row) => [row.id, row]));
const invariantGaps = requiredInvariants.filter((id) => invariantRows.get(id)?.disposition !== "enforced" || !invariantRows.get(id)?.evidence);
if (invariantGaps.length) throw new Error(`Invariant traceability gaps: ${invariantGaps.join(", ")}`);
console.log("Invariant traceability check passed: 20/20 enforced and evidenced.");
