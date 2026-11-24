import { NextResponse } from "next/server";
import { buildAiContext } from "@/features/ai/buildAiContext";
import { allowPreview } from "@/features/ai/limits";
import { parseAiBody } from "@/features/ai/schema";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Invalid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseAiBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.code, message: parsed.message },
      { status: 400 },
    );
  }

  if (!allowPreview(user.id)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const built = await buildAiContext(supabase, parsed.body);
  if (!built.ok) {
    return NextResponse.json({ error: built.code }, { status: 400 });
  }

  return NextResponse.json({
    scope: built.scope,
    context: built.document,
    contextJson: built.jsonCompact,
    generatedAt: built.generatedAt,
    recordRefs: built.recordRefs,
    truncated: parsed.truncated || built.document.truncated,
  });
}