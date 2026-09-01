import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const forbiddenKernelImports = ["adapter-postgres", "pg", "express", "fastify", "react"];
const kernelDir = join(root, "packages", "kernel", "src");
const files = readdirSync(kernelDir, { recursive: true }).filter((f) => String(f).endsWith(".ts"));
const violations = [];
for (const file of files) {
  const text = readFileSync(join(kernelDir, String(file)), "utf8");
  for (const token of forbiddenKernelImports) if (text.includes(token)) violations.push(`${file}: ${token}`);
}
if (violations.length) {
  console.error("Kernel boundary violations:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("Boundary check passed.");
