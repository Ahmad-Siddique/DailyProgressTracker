import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [
    profile,
    tasks,
    templates,
    skips,
    goals,
    goalItems,
    accounts,
    categories,
    rates,
    ledger,
    transfers,
    budgets,
    funds,
    savingsEntries,
  ] = await Promise.all([
    supabase.from("profiles").select("*").single(),
    supabase.from("tasks").select("*"),
    supabase.from("recurrence_templates").select("*"),
    supabase.from("recurrence_skips").select("*"),
    supabase.from("goals").select("*"),
    supabase.from("goal_items").select("*"),
    supabase.from("accounts").select("*"),
    supabase.from("categories").select("*"),
    supabase.from("fx_rates").select("*"),
    supabase.from("ledger_entries").select("*"),
    supabase.from("transfer_groups").select("*"),
    supabase.from("budgets").select("*"),
    supabase.from("savings_funds").select("*"),
    supabase.from("savings_entries").select("*"),
  ]);

  const backup = {
    schemaVersion: 1,
    profile: profile.data,
    tasks: tasks.data ?? [],
    recurrenceTemplates: templates.data ?? [],
    recurrenceSkips: skips.data ?? [],
    goals: goals.data ?? [],
    goalItems: goalItems.data ?? [],
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    fxRates: rates.data ?? [],
    ledger: ledger.data ?? [],
    transferGroups: transfers.data ?? [],
    budgets: budgets.data ?? [],
    savingsFunds: funds.data ?? [],
    savingsEntries: savingsEntries.data ?? [],
  };

  return NextResponse.json(backup, {
    headers: {
      "Content-Disposition": 'attachment; filename="backup.json"',
    },
  });
}