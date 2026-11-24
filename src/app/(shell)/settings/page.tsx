"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { updateProfileWithVersion } from "@/lib/profile";
import type { ProfileRow, Theme } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  LoadingPulse,
  PageHeader,
  PageSection,
  SurfaceCard,
} from "@/components/ui/page-chrome";
import { useTheme } from "@/components/providers/theme-provider";
import { useOffline } from "@/components/pwa/offline-provider";
import {
  countPendingJobs,
  deleteOwnerDatabase,
} from "@/lib/pwa/idb";
import {
  TIMEZONE_CHANGE_WARNING,
  TIMEZONE_OPTIONS,
} from "@/lib/timezones";

async function fetchProfile(): Promise<ProfileRow | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

function pushStatusLabel(): string {
  if (typeof window === "undefined") return "";
  if (!("Notification" in window)) {
    return "Push is unavailable. In-app reminders stay on.";
  }
  if (Notification.permission === "denied") {
    return "Push is unavailable. In-app reminders stay on.";
  }
  if (Notification.permission === "granted") {
    return "Push permission granted.";
  }
  return "Push not requested yet.";
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pendingCount, userId } = useOffline();
  const { theme: uiTheme, setTheme: setUiTheme } = useTheme();
  const [timezoneDraft, setTimezoneDraft] = React.useState("Asia/Karachi");
  const [showTzWarning, setShowTzWarning] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const [signOutPending, setSignOutPending] = React.useState(0);
  const [pushStatus, setPushStatus] = React.useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  React.useEffect(() => {
    setPushStatus(pushStatusLabel());
  }, [profile?.reminders_enabled]);

  React.useEffect(() => {
    if (profile) {
      setTimezoneDraft(profile.timezone);
      setUiTheme(profile.theme);
    }
  }, [profile, setUiTheme]);

  async function persistTheme(next: Theme) {
    if (!profile) return;
    setUiTheme(next);
    setSaving(true);
    setStatus(null);
    const supabase = createClient();
    const result = await updateProfileWithVersion(supabase, profile, {
      theme: next,
    });
    setSaving(false);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setStatus("Theme saved.");
    } else if (result.conflict) {
      setStatus("Theme conflict — reload and try again.");
    } else {
      setStatus(result.error);
    }
  }

  async function confirmTimezoneSave() {
    if (!profile) return;
    setSaving(true);
    setStatus(null);
    const supabase = createClient();
    const result = await updateProfileWithVersion(supabase, profile, {
      timezone: timezoneDraft,
    });
    setSaving(false);
    setShowTzWarning(false);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setStatus("Timezone saved.");
    } else if (result.conflict) {
      setStatus("Timezone conflict — reload and try again.");
    } else {
      setStatus(result.error);
    }
  }

  function onTimezoneChange(value: string) {
    setTimezoneDraft(value);
    if (profile && value !== profile.timezone) {
      setShowTzWarning(true);
    } else {
      setShowTzWarning(false);
    }
  }

  async function setRemindersEnabled(next: boolean) {
    if (!profile) return;
    setSaving(true);
    setStatus(null);
    const supabase = createClient();
    const result = await updateProfileWithVersion(supabase, profile, {
      reminders_enabled: next,
    });
    setSaving(false);
    if (!result.ok) {
      setStatus(result.conflict ? "Reminders conflict — reload." : result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    if (next && "Notification" in window && Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      setPushStatus(pushStatusLabel());
      if (perm === "denied") {
        setStatus("Push denied. In-app reminders stay on.");
      } else {
        setStatus("Reminders on.");
      }
    } else {
      setStatus(next ? "Reminders on." : "Reminders off.");
      setPushStatus(pushStatusLabel());
    }
  }

  async function setHideAmounts(next: boolean) {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const result = await updateProfileWithVersion(supabase, profile, {
      hide_amounts_on_lock_screen: next,
    });
    setSaving(false);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setStatus("Lock screen preference saved.");
    } else {
      setStatus(result.conflict ? "Conflict — reload." : result.error);
    }
  }

  async function openSignOutConfirm() {
    const uid = userId;
    const count = uid ? await countPendingJobs(uid) : pendingCount;
    setSignOutPending(count);
    setSignOutOpen(true);
  }

  async function confirmSignOut() {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (uid) {
      await deleteOwnerDatabase(uid);
    }
    await supabase.auth.signOut();
    setSignOutOpen(false);
    router.replace("/login");
    router.refresh();
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="Settings" />
        <LoadingPulse label="Loading settings" />
      </>
    );
  }

  return (
    <section aria-labelledby="settings-heading" className="space-y-8">
      <PageHeader title="Settings" />

      <PageSection title="Reminders">
      <SurfaceCard data-testid="settings-reminders">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Reminders</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={profile?.reminders_enabled ?? false}
            disabled={saving}
            onChange={(e) => void setRemindersEnabled(e.target.checked)}
          />
          Enable reminders
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={profile?.hide_amounts_on_lock_screen ?? true}
            disabled={saving || !profile?.reminders_enabled}
            onChange={(e) => void setHideAmounts(e.target.checked)}
          />
          Hide amounts on lock screen
        </label>
        <p className="text-sm text-muted-foreground" role="status">
          {pushStatus}
        </p>
        <p className="text-xs text-muted-foreground">
          Add the app to your home screen for install. Safe area padding keeps the
          tab bar visible on phones.
        </p>
      </fieldset>
      </SurfaceCard>
      </PageSection>

      <PageSection title="Theme">
      <SurfaceCard>
      <fieldset className="space-y-3">
        <legend className="sr-only">Theme</legend>
        <div className="flex flex-wrap gap-2">
          {(["light", "dark", "system"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              variant={uiTheme === t ? "default" : "outline"}
              aria-pressed={uiTheme === t}
              disabled={saving}
              onClick={() => void persistTheme(t)}
            >
              {t}
            </Button>
          ))}
        </div>
      </fieldset>
      </SurfaceCard>
      </PageSection>

      <PageSection title="Timezone">
      <SurfaceCard className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          name="timezone"
          className="db-input h-11"
          value={timezoneDraft}
          onChange={(e) => onTimezoneChange(e.target.value)}
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {showTzWarning ? (
          <div className="db-surface mt-3 p-3 text-sm" role="status">
            <p>{TIMEZONE_CHANGE_WARNING}</p>
            <Button
              type="button"
              className="mt-3"
              disabled={saving}
              onClick={() => void confirmTimezoneSave()}
            >
              Save timezone
            </Button>
          </div>
        ) : null}
      </SurfaceCard>
      </PageSection>

      {status ? (
        <p className="text-sm text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}

      <Button
        type="button"
        variant="destructive"
        onClick={() => void openSignOutConfirm()}
      >
        Sign out
      </Button>

      {signOutOpen ? (
        <SurfaceCard
          role="dialog"
          aria-labelledby="sign-out-title"
          data-testid="sign-out-confirm"
        >
          <h2 id="sign-out-title" className="font-medium">
            Sign out?
          </h2>
          {signOutPending > 0 ? (
            <p className="mt-2 text-sm">
              {signOutPending} edit{signOutPending === 1 ? "" : "s"} are only on this
              device. Confirming removes them.
            </p>
          ) : (
            <p className="mt-2 text-sm">This clears saved data on this phone.</p>
          )}
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={() => void confirmSignOut()}>
              Confirm
            </Button>
            <Button type="button" variant="outline" onClick={() => setSignOutOpen(false)}>
              Cancel
            </Button>
          </div>
        </SurfaceCard>
      ) : null}
    </section>
  );
}