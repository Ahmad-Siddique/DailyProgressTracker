import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const AI_DIR = path.join(process.cwd(), "src", "features", "ai");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("AI feature import guard", () => {
  it("does not import splitMinor or convertMinor from money/minor", () => {
    const forbidden = /from\s+["']@\/features\/money\/minor["']|from\s+["'].*money\/minor["']/;
    const hits: string[] = [];
    for (const file of walk(AI_DIR)) {
      const src = fs.readFileSync(file, "utf8");
      if (!forbidden.test(src)) continue;
      if (/\bsplitMinor\b/.test(src) || /\bconvertMinor\b/.test(src)) {
        hits.push(path.relative(process.cwd(), file));
      }
    }
    expect(hits).toEqual([]);
  });
});