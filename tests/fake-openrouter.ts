import type { OpenRouterDeps } from "../src/features/ai/openrouter";

type ModelRow = { id: string; pricing: { prompt: string; completion: string; request: string } };

export type FakeOpenRouterState = {
  models: ModelRow[];
  responses: Map<
    string,
    { status: number; body?: string; stream?: string[] }
  >;
  calls: { url: string; body: unknown }[];
  forwardedDelta: boolean;
};

export function createFakeOpenRouter(state: FakeOpenRouterState): OpenRouterDeps {
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/models")) {
      return new Response(JSON.stringify({ data: state.models }), { status: 200 });
    }
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    state.calls.push({ url, body });
    const model = String((body as { model?: string }).model ?? "");
    const scripted = state.responses.get(model);
    if (!scripted) {
      return new Response("missing", { status: 404 });
    }
    if (scripted.status !== 200) {
      return new Response(scripted.body ?? "", { status: scripted.status });
    }
    const encoder = new TextEncoder();
    const chunks = scripted.stream ?? [];
    const stream = new ReadableStream({
      start(controller) {
        for (const line of chunks) {
          controller.enqueue(encoder.encode(line));
          if (line.includes('"content"')) state.forwardedDelta = true;
        }
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
  return { fetchFn, now: () => Date.now() };
}