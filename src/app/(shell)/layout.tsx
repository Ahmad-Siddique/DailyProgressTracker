import { AiShell } from "@/components/ai/ai-shell";
import { OfflineProvider } from "@/components/pwa/offline-provider";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { ReminderInbox } from "@/features/reminders/inbox";
import { DesktopSidebar, MobileTabBar } from "@/components/shell/nav";
import { QuickAdd } from "@/components/quick-add/quick-add";
import { ShellThemeSync } from "@/components/shell/shell-theme-sync";
import type { ThemeSetting } from "@/components/providers/theme-provider";
import { createClient } from "@/lib/supabase/server";

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profileTheme: ThemeSetting | null = null;
  let remindersEnabled = false;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("theme, reminders_enabled")
      .eq("id", user.id)
      .maybeSingle();
    const row = data as { theme: ThemeSetting; reminders_enabled?: boolean } | null;
    profileTheme = row?.theme ?? null;
    remindersEnabled = row?.reminders_enabled ?? false;
  }

  return (
  <OfflineProvider>
      <ShellThemeSync theme={profileTheme} />
      <RegisterServiceWorker />
      <ReminderInbox enabled={remindersEnabled} />
      <div className="flex min-h-screen w-full flex-col md:flex-row">
        <DesktopSidebar />
        <AiShell>{children}</AiShell>
        <MobileTabBar />
        <QuickAdd />
      </div>
    </OfflineProvider>
  );
}