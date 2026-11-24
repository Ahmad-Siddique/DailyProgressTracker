#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODULE_DOCS,
  countGwtSteps,
  extractDecisionIds,
} from "../spec/contract.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const outDir = path.join(ROOT, "docs", "generated");
fs.mkdirSync(outDir, { recursive: true });

const gwtByDoc: Record<string, number> = {};
let gwtTotal = 0;
for (const rel of MODULE_DOCS) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const n = countGwtSteps(text);
  gwtByDoc[rel] = n;
  gwtTotal += n;
}

const phasesGwt = countGwtSteps(
  fs.readFileSync(path.join(ROOT, "docs/phases.md"), "utf8"),
);
gwtTotal += phasesGwt;
gwtByDoc["docs/phases.md"] = phasesGwt;

const arch = fs.readFileSync(path.join(ROOT, "docs/architecture.md"), "utf8");
const decisions = extractDecisionIds(arch);

const inventory = {
  generatedAt: new Date().toISOString(),
  docCount: MODULE_DOCS.length,
  moduleDocs: [...MODULE_DOCS],
  decisionCount: decisions.length,
  decisions,
  gwtTotal,
  gwtByDoc,
  selectorRows: (arch.match(/^\| `select/gm) ?? []).length,
};

const outPath = path.join(outDir, "acceptance-inventory.json");
fs.writeFileSync(outPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);