import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./paths.js";

describe("Phase 0 — ai.md OpenRouter contract", () => {
  const ai = fs.readFileSync(path.join(REPO_ROOT, "docs/ai.md"), "utf8");

  it("documents OPENROUTER body fields and free_model_unavailable", () => {
    for (const field of [
      "model",
      "messages",
      "max_tokens",
      "temperature",
      "stream",
      "provider",
      "data_collection",
    ]) {
      expect(ai, field).toContain(field);
    }
    expect(ai).toContain("free_model_unavailable");
    expect(ai).toContain("OPENROUTER_API_KEY");
  });
});