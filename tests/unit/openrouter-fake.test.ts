import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseAllowlist,
  resetOpenRouterTestState,
  streamOpenRouterChat,
} from "../../src/features/ai/openrouter";
import type { AiContextDocument } from "../../src/features/ai/types";
import {
  createFakeOpenRouter,
  type FakeOpenRouterState,
} from "../fake-openrouter";

const context = (): AiContextDocument => ({
  scope: {
    finance: false,
    goalIds: [],
    goalMode: "none",
    month: null,
    monthMode: "none",
    taskSummary: false,
  },
  asOf: {
    timezone: "Asia/Karachi",
    localDate: "2026-11-22",
    generatedAt: "2026-11-22T00:00:00.000Z",
  },
  truncated: false,
  truncationNote: null,
  unavailableGoalIds: [],
  goals: null,
  review: null,
  tasks: null,
});

describe("fake OpenRouter", () => {
  beforeEach(() => {
    resetOpenRouterTestState();
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_FREE_MODELS = "paid-ish,free-a,free-b";
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_FREE_MODELS;
  });

  it("skips allowlist ids that are not free on models list", async () => {
    const state: FakeOpenRouterState = {
      models: [
        {
          id: "free-a",
          pricing: { prompt: "0", completion: "0", request: "0" },
        },
      ],
      responses: new Map([
        [
          "free-a",
          {
            status: 200,
            stream: [
              'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
              "data: [DONE]\n\n",
            ],
          },
        ],
      ]),
      calls: [],
      forwardedDelta: false,
    };
    const deps = createFakeOpenRouter(state);
    const result = await streamOpenRouterChat(
      {
        context: context(),
        userMessages: [{ role: "user", content: "hello" }],
        onDelta: () => {},
        onModel: () => {},
      },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(parseAllowlist()).toEqual(["paid-ish", "free-a", "free-b"]);
    const bodies = state.calls.filter((c) => c.url.includes("completions"));
    expect(bodies[0]?.body).toMatchObject({ model: "free-a" });
  });

  it("tries next model on 402 before any delta", async () => {
    const state: FakeOpenRouterState = {
      models: [
        {
          id: "free-a",
          pricing: { prompt: "0", completion: "0", request: "0" },
        },
        {
          id: "free-b",
          pricing: { prompt: "0", completion: "0", request: "0" },
        },
      ],
      responses: new Map([
        ["free-a", { status: 402, body: "payment required" }],
        [
          "free-b",
          {
            status: 200,
            stream: [
              'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
              "data: [DONE]\n\n",
            ],
          },
        ],
      ]),
      calls: [],
      forwardedDelta: false,
    };
    const deps = createFakeOpenRouter(state);
    const result = await streamOpenRouterChat(
      {
        context: context(),
        userMessages: [{ role: "user", content: "hello" }],
        onDelta: () => {},
        onModel: () => {},
      },
      deps,
    );
    expect(result.ok).toBe(true);
    const models = state.calls
      .filter((c) => c.url.includes("completions"))
      .map((c) => (c.body as { model: string }).model);
    expect(models).toEqual(["free-a", "free-b"]);
  });

  it("returns free_model_unavailable when no allowlist id is free", async () => {
    const state: FakeOpenRouterState = {
      models: [
        {
          id: "paid-ish",
          pricing: { prompt: "1", completion: "1", request: "1" },
        },
      ],
      responses: new Map(),
      calls: [],
      forwardedDelta: false,
    };
    const deps = createFakeOpenRouter(state);
    const result = await streamOpenRouterChat(
      {
        context: context(),
        userMessages: [{ role: "user", content: "hello" }],
        onDelta: () => {},
        onModel: () => {},
      },
      deps,
    );
    expect(result).toEqual({ ok: false, code: "free_model_unavailable" });
    expect(state.calls.filter((c) => c.url.includes("completions"))).toHaveLength(0);
  });

  it("returns misconfigured without network when API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const state: FakeOpenRouterState = {
      models: [],
      responses: new Map(),
      calls: [],
      forwardedDelta: false,
    };
    const deps = createFakeOpenRouter(state);
    const result = await streamOpenRouterChat(
      {
        context: context(),
        userMessages: [{ role: "user", content: "hello" }],
        onDelta: () => {},
        onModel: () => {},
      },
      deps,
    );
    expect(result).toEqual({ ok: false, code: "misconfigured" });
    expect(state.calls).toHaveLength(0);
  });

  it("does not call a second model after a delta was forwarded", async () => {
    const state: FakeOpenRouterState = {
      models: [
        {
          id: "free-a",
          pricing: { prompt: "0", completion: "0", request: "0" },
        },
        {
          id: "free-b",
          pricing: { prompt: "0", completion: "0", request: "0" },
        },
      ],
      responses: new Map([
        [
          "free-a",
          {
            status: 200,
            stream: [
              'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
            ],
          },
        ],
      ]),
      calls: [],
      forwardedDelta: false,
    };
    const deps = createFakeOpenRouter(state);
    let text = "";
    const result = await streamOpenRouterChat(
      {
        context: context(),
        userMessages: [{ role: "user", content: "hello" }],
        onDelta: (d) => {
          text += d;
        },
        onModel: () => {},
      },
      deps,
    );
    expect(text).toBe("partial");
    expect(result.ok).toBe(true);
    const models = state.calls
      .filter((c) => c.url.includes("completions"))
      .map((c) => (c.body as { model: string }).model);
    expect(models).toEqual(["free-a"]);
  });
});