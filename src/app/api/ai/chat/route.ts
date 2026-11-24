import { buildAiContext } from "@/features/ai/buildAiContext";
import {
  allowChat,
  releaseChat,
  tryAcquireChat,
} from "@/features/ai/limits";
import { streamOpenRouterChat } from "@/features/ai/openrouter";
import { parseAiBody } from "@/features/ai/schema";
import { signTurn } from "@/features/ai/sign-turn";
import { resolveForwardTurns } from "@/features/ai/turns";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(sse({ type: "error", code: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(sse({ type: "error", code: "invalid_request" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const parsed = parseAiBody(raw);
  if (!parsed.ok || !parsed.body.newMessage) {
    return new Response(sse({ type: "error", code: "invalid_request" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  const newMessage = parsed.body.newMessage;

  if (!allowChat(user.id)) {
    return new Response(sse({ type: "error", code: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  if (!tryAcquireChat(user.id)) {
    return new Response(sse({ type: "error", code: "busy" }), {
      status: 409,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const built = await buildAiContext(supabase, parsed.body);
  if (!built.ok) {
    releaseChat(user.id);
    return new Response(sse({ type: "error", code: built.code }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const secret = process.env.AI_TURN_SECRET ?? "";
  const forward = resolveForwardTurns(parsed.body, built.scope, secret);
  if (forward.error) {
    releaseChat(user.id);
    return new Response(sse({ type: "error", code: forward.error }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const encoder = new TextEncoder();
  let assistantText = "";
  let modelId = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            sse({
              type: "meta",
              scope: built.scope,
              asOf: built.document.asOf,
              truncated: built.document.truncated,
              truncationNote: built.document.truncationNote,
              recordRefs: built.recordRefs,
              model: null,
            }),
          ),
        );

        const result = await streamOpenRouterChat({
          context: built.document,
          userMessages: [
            ...forward.turns,
            { role: "user", content: newMessage.content },
          ],
          onDelta: (text) => {
            assistantText += text;
            controller.enqueue(
              encoder.encode(sse({ type: "delta", text })),
            );
          },
          onModel: (id) => {
            modelId = id;
          },
        });

        if (!result.ok) {
          controller.enqueue(
            encoder.encode(sse({ type: "error", code: result.code })),
          );
        } else {
          const userSig = signTurn(
            "user",
            newMessage.content,
            built.scope,
            secret,
          );
          const assistantSig = signTurn(
            "assistant",
            assistantText,
            built.scope,
            secret,
          );
          controller.enqueue(
            encoder.encode(
              sse({
                type: "meta",
                scope: built.scope,
                asOf: built.document.asOf,
                truncated: built.document.truncated,
                truncationNote: built.document.truncationNote,
                recordRefs: built.recordRefs,
                model: result.modelId ?? modelId,
                signatures: {
                  user: userSig,
                  assistant: assistantSig,
                },
              }),
            ),
          );
          controller.enqueue(encoder.encode(sse({ type: "done" })));
        }
      } finally {
        releaseChat(user.id);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}