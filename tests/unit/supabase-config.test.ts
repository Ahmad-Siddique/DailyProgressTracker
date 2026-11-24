import { describe, expect, it, afterEach } from "vitest";
import {
  getPublicSupabaseConfig,
  getSecretSupabaseKey,
} from "../../src/lib/supabase/config";

describe("Supabase config (publishable / secret)", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevPub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevSecret = process.env.SUPABASE_SECRET_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevPub;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    process.env.SUPABASE_SECRET_KEY = prevSecret;
  });

  it("accepts publishable + secret keys", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://abcxyz.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "sb_publishable_test_abc";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test_xyz";
    const cfg = getPublicSupabaseConfig();
    expect(cfg.publishableKey.startsWith("sb_publishable_")).toBe(true);
    expect(getSecretSupabaseKey()).toBe("sb_secret_test_xyz");
  });

  it("falls back to legacy anon key", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://abcxyz.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGci.test";
    const cfg = getPublicSupabaseConfig();
    expect(cfg.publishableKey).toBe("eyJhbGci.test");
  });

  it("rejects placeholders", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://YOUR_PROJECT_REF.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "sb_publishable_paste_here";
    expect(() => getPublicSupabaseConfig()).toThrow(/not configured/i);
  });
});