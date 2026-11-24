#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = path.join(
  ROOT,
  "docs/generated/acceptance-inventory.json",
);
const publicDir = path.join(ROOT, "public");

type Inventory = {
  generatedAt: string;
  docCount: number;
  decisionCount: number;
  gwtTotal: number;
  decisions: string[];
  moduleDocs: string[];
};

function loadInventory(): Inventory {
  if (!fs.existsSync(inventoryPath)) {
    throw new Error(
      `Missing ${inventoryPath}. Run: pnpm inventory`,
    );
  }
  return JSON.parse(fs.readFileSync(inventoryPath, "utf8")) as Inventory;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function main(): void {
  const inv = loadInventory();
  fs.mkdirSync(publicDir, { recursive: true });

  const decisionList = inv.decisions
    .map(
      (id) =>
        `<li><a href="../docs/architecture.md#decisions-and-flagged-gaps">${escapeHtml(id)}</a></li>`,
    )
    .join("\n");

  const docList = inv.moduleDocs
    .map((d) => `<li><code>${escapeHtml(d)}</code></li>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dayboard — Phase 0 report</title>
  <style>
    :root { font-family: system-ui, sans-serif; line-height: 1.5; padding: 1.5rem; max-width: 52rem; margin: auto; }
    h1 { font-size: 1.5rem; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; }
    dt { font-weight: 600; }
    section { margin-top: 1.5rem; }
  </style>
</head>
<body>
  <h1>Dayboard — Phase 0 report</h1>
  <p>Static acceptance snapshot generated <time>${escapeHtml(inv.generatedAt)}</time>.</p>
  <dl>
    <dt data-testid="decision-count">Decisions</dt>
    <dd>${inv.decisionCount}</dd>
    <dt data-testid="doc-count">Module specs</dt>
    <dd>${inv.docCount}</dd>
    <dt>GWT steps (docs)</dt>
    <dd>${inv.gwtTotal}</dd>
  </dl>
  <section>
    <h2>Decisions A-1 … A-${inv.decisionCount}</h2>
    <ul>${decisionList}</ul>
  </section>
  <section>
    <h2>Module specs</h2>
    <ul>${docList}</ul>
  </section>
</body>
</html>
`;

  const out = path.join(publicDir, "phase0.html");
  fs.writeFileSync(out, html, "utf8");
  console.log(`Wrote ${out}`);
}

main();