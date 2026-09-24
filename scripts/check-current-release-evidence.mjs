import { existsSync, readFileSync } from "node:fs";

const matrixUrl = new URL("../docs/traceability/current-release-matrix.json", import.meta.url);
if (!existsSync(matrixUrl)) throw new Error("Missing current-release traceability matrix");

const matrix = JSON.parse(readFileSync(matrixUrl, "utf8"));
if (matrix.document !== "CURRENT-RELEASE-TRACEABILITY") throw new Error("Invalid current-release traceability designation");
if (matrix.productionRelease !== false) throw new Error("Current-release traceability must remain fail-closed for Production");
if (matrix.historicalEvidence?.sw0Matrix !== "docs/traceability/matrix.json" || matrix.historicalEvidence?.preserved !== true) {
  throw new Error("Historical SW0 traceability must remain explicitly preserved");
}

const requiredSlices = ["SW1-01", "SW2-01"];
for (const id of requiredSlices) {
  const slice = matrix.slices?.find((entry) => entry.id === id);
  if (!slice) throw new Error(`Missing current-release slice: ${id}`);
  if (!slice.report || !existsSync(new URL(`../${slice.report}`, import.meta.url))) {
    throw new Error(`Missing implementation report for ${id}`);
  }
}

const requiredEvidence = [
  "conservation-falsification",
  "custody-authority-falsification",
  "exact-head-postgresql-persistence-certification",
  "exact-head-identity-certification",
  "exact-head-deployment-certification",
  "residual-gap-classification",
  "independent-review"
];
for (const evidence of requiredEvidence) {
  if (!matrix.releaseEvidenceRequired?.includes(evidence)) throw new Error(`Missing release-evidence requirement: ${evidence}`);
}

const requiredQuarantines = ["agentRef/Participant equivalence", "counterparty custody-consent semantics"];
for (const semantic of requiredQuarantines) {
  if (!matrix.quarantinedSemantics?.includes(semantic)) throw new Error(`Missing semantic quarantine: ${semantic}`);
}

console.log(`Current-release evidence baseline passed: ${requiredSlices.length} slices mapped, ${requiredEvidence.length} certification gates declared, Production fail-closed.`);
