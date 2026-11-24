import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csvRow } from "@/lib/export-csv";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("*, accounts(name), categories(name)")
    .order("occurred_on", { ascending: false });

  const lines = [
    csvRow([
      "id",
      "date",
      "kind",
      "account",
      "currency",
      "amount_minor",
      "category",
      "note",
      "voided",
      "transfer_group_id",
    ]),
  ];

  for (const row of entries ?? []) {
    const e = row as Record<string, unknown>;
    const acct = e.accounts as { name: string } | null;
    const cat = e.categories as { name: string } | null;
    lines.push(
      csvRow([
        String(e.id),
        String(e.occurred_on),
        String(e.kind),
        acct?.name ?? "",
        String(e.currency),
        String(e.amount_minor),
        cat?.name ?? "",
        String(e.note ?? ""),
        e.voided_at ? "true" : "false",
        String(e.transfer_group_id ?? ""),
      ]),
    );
  }

  const body = lines.join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ledger.csv"',
    },
  });
}