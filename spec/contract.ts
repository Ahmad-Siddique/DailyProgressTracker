/** Single source for Phase 0 spec contract (tests + scripts). */
export const MODULE_DOCS = [
  "docs/architecture.md",
  "docs/ux.md",
  "docs/board.md",
  "docs/goals.md",
  "docs/money.md",
  "docs/savings.md",
  "docs/review.md",
  "docs/pwa.md",
  "docs/ai.md",
  "docs/quality.md",
] as const;

export const DECISION_IDS = Array.from(
  { length: 24 },
  (_, i) => `A-${i + 1}`,
);

export const GWT_SPEC_FILES = [...MODULE_DOCS, "docs/phases.md"] as const;

export function decisionsTableSection(architectureMd: string): string {
  const start = architectureMd.indexOf("| Id | Decision |");
  if (start < 0) throw new Error("decisions table not found");
  return architectureMd.slice(start);
}

export function extractDecisionIds(architectureMd: string): string[] {
  return [...decisionsTableSection(architectureMd).matchAll(/\| (A-\d+) \|/g)].map(
    (m) => m[1] as string,
  );
}

export function countGwtSteps(markdown: string): number {
  let total = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^\d+\.\s/.test(trimmed)) continue;
    if (
      !/^Given\s/i.test(trimmed) &&
      !/\.?\s+Given\s/i.test(trimmed)
    ) {
      continue;
    }
    if (!/\s+When\s/i.test(trimmed) || !/\s+Then\s/i.test(trimmed)) {
      continue;
    }
    total += 1;
  }
  return total;
}