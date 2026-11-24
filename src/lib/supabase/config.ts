const PLACEHOLDER_FRAGMENTS = [
  "YOUR_PROJECT_REF",
  "paste",
  "your-publishable",
  "your-secret",
  "changeme",
] as const;

function looksUnset(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const lower = value.trim().toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((frag) => lower.includes(frag));
}

function firstSet(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    if (!looksUnset(v)) return v!.trim();
  }
  return undefined;
}

/** Browser + SSR route handlers — Supabase publishable key (or legacy anon JWT). */
export function getPublicSupabaseConfig(): {
  url: string;
  publishableKey: string;
} {
  const url = firstSet(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
  const publishableKey = firstSet(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. In .env.local set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (Dashboard → Project Settings → API).",
    );
  }
  return { url, publishableKey };
}

/** Server / integration only — secret key (or legacy service_role JWT). Never import in client components. */
export function getSecretSupabaseKey(): string | null {
  return (
    firstSet(
      process.env.SUPABASE_SECRET_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ) ?? null
  );
}