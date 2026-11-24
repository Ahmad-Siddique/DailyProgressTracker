import type { createClient } from "@/lib/supabase/client";
import { fetchTasks } from "@/features/board/api";
import {
  selectOverdueTasks,
  selectTodayAgenda,
} from "@/features/board/selectors";
import { fetchGoals } from "@/features/goals/api";
import { ownerClock } from "@/lib/clock";
import type { ProfileRow } from "@/types/database";

type BrowserSupabase = ReturnType<typeof createClient>;

export async function loadTodayData(supabase: BrowserSupabase) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let user = session?.user ?? null;
  if (!user) {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    user = userData.user;
  }
  if (!user) throw new Error("Not signed in");

  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) throw profileErr;

  const profile = profileRow as ProfileRow | null;
  const tz = profile?.timezone ?? "Asia/Karachi";

  const { error: recErr } = await supabase.rpc("apply_recurrence", {
    p_owner_timezone: tz,
  });
  if (
    recErr &&
    !/function.*does not exist|schema cache|PGRST202/i.test(recErr.message)
  ) {
    throw recErr;
  }

  const clock = ownerClock({ timezone: tz }, new Date());
  const tasks = await fetchTasks(supabase);
  const agenda = selectTodayAgenda(tasks, clock.localDate);
  const overdue = selectOverdueTasks(tasks, clock.localDate);
  const goals = await fetchGoals(supabase);
  const goalDeadlines = goals
    .filter((g) => g.archivedAt == null && g.deadlineDate)
    .filter((g) => (g.deadlineDate ?? "") >= clock.localDate)
    .sort((a, b) => (a.deadlineDate ?? "").localeCompare(b.deadlineDate ?? ""));
  const pastDeadlines = goals
    .filter((g) => g.archivedAt == null && g.deadlineDate)
    .filter((g) => (g.deadlineDate ?? "") < clock.localDate);

  return {
    today: clock.localDate,
    agenda,
    overdue,
    goalDeadlines,
    pastDeadlines,
  };
}