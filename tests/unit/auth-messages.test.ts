import { describe, expect, it } from "vitest";
import { mapAuthError, PRIVATE_APP_MESSAGE } from "../../src/lib/auth-messages";

describe("mapAuthError", () => {
  it("maps private_app to the private message", () => {
    expect(mapAuthError("private_app")).toBe(PRIVATE_APP_MESSAGE);
  });

  it("maps existing user to sign-in hint", () => {
    expect(mapAuthError("User already registered")).toMatch(/Sign in instead/);
  });

  it("maps bad password separately", () => {
    expect(mapAuthError("Invalid login credentials")).toBe(
      "Email or password is wrong.",
    );
  });

  it("maps Supabase database signup guard to private message", () => {
    expect(mapAuthError("Database error saving new user")).toBe(
      PRIVATE_APP_MESSAGE,
    );
  });

  it("maps email rate limit", () => {
    expect(mapAuthError("over_email_send_rate_limit")).toMatch(/Too many sign-up/);
  });
});