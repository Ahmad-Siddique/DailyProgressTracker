import { createClient } from "@/lib/supabase/server";
import { reminderRowFromInsert } from "@/features/reminders/dispatch";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const rec = body as Record<string, unknown>;
  const subjectType = rec.subjectType;
  const subjectId = rec.subjectId;
  const fireAt = rec.fireAt;

  if (
    (subjectType !== "task" && subjectType !== "savings_fund") ||
    typeof subjectId !== "string" ||
    typeof fireAt !== "string"
  ) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const row = reminderRowFromInsert({
    ownerId: user.id,
    subjectType,
    subjectId,
    fireAt: new Date(fireAt),
    enabled: rec.enabled !== false,
  });

  const { data, error } = await supabase
    .from("reminders")
    .upsert(row, { onConflict: "owner_id,dedupe_key" })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ reminder: data });
}