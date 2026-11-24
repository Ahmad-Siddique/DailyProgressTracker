"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SurfaceCard } from "@/components/ui/page-chrome";
import { mapAuthError } from "@/lib/auth-messages";

/** Relative in-app paths only — blocks open redirects. */
function safeNextPath(raw: string | null): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return "/today";
  if (raw.includes("://") || raw.includes("\\")) return "/today";
  return raw;
}

type LoginInnerProps = {
  ownerEmailHint?: string | null;
};

export function LoginInner({ ownerEmailHint = null }: LoginInnerProps) {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNextPath(search.get("next"));
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(mode: "signin" | "signup") {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setError(mapAuthError(result.error.message));
      setPending(false);
      return;
    }

    if (!result.data.session) {
      if (mode === "signup" && result.data.user) {
        setError(
          "Account created. Confirm your email if required, then Sign in — or disable email confirmation in Supabase Auth.",
        );
      } else {
        setError(mapAuthError("email not confirmed"));
      }
      setPending(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <div className="db-page-enter flex min-h-screen flex-col md:flex-row">
      <div className="flex flex-1 flex-col justify-center bg-accent/30 px-8 py-12 md:px-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Personal workspace
        </p>
        <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Dayboard
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Track today, goals, and money in one warm, focused place — built for
          one owner, no noise.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-12">
        <SurfaceCard className="w-full max-w-sm animate-scale-in p-6 md:p-8">
          <header className="mb-6 space-y-1">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in or create the owner account.
            </p>
          </header>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit("signin");
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {pending ? (
              <p className="text-sm text-muted-foreground" role="status">
                Signing in…
              </p>
            ) : null}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={pending}>
                Sign in
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={pending}
                onClick={() => void submit("signup")}
              >
                Sign up
              </Button>
            </div>
          </form>
          {ownerEmailHint ? (
            <p
              className="mt-4 text-center text-xs text-muted-foreground"
              data-testid="owner-email-hint"
            >
              Allowlisted owner email: {ownerEmailHint}
            </p>
          ) : null}
        </SurfaceCard>
      </div>
    </div>
  );
}