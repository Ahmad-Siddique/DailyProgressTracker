import { getSecretSupabaseKey } from "../../src/lib/supabase/config";

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/YOUR_|paste-|your-publishable|your-secret/i.test(v)) return undefined;
  return v;
}

function publishableKey(): string | undefined {
  return (
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    clean(process.env.SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.SUPABASE_ANON_KEY)
  );
}

/** Integration tests: cloud Supabase from env only. */
export function integrationSupabaseEnv():
  | { url: string; publishableKey: string; secretKey: string }
  | null {
  const url =
    clean(process.env.SUPABASE_URL) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const pub = publishableKey();
  const secretKey = getSecretSupabaseKey();
  if (!url || !pub || !secretKey) return null;
  return { url, publishableKey: pub, secretKey };
}

export function integrationEnvOrSkip(): boolean {
  return process.env.SUPABASE_SKIP === "1" || !integrationSupabaseEnv();
}