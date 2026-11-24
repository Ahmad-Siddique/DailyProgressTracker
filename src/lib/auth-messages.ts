export const PRIVATE_APP_MESSAGE =
  "This app is private. Sign up only with the allowlisted owner email (ALLOWED_OWNER_EMAIL / app_singleton).";

export function mapAuthError(message: string | undefined): string {
  if (!message) return "Could not sign in. Try again.";
  const lower = message.toLowerCase();
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered")
  ) {
    return "An account with this email already exists. Use Sign in instead.";
  }
  if (
    lower.includes("private_app") ||
    lower.includes("signup is disabled") ||
    lower.includes("database error saving new user")
  ) {
    return PRIVATE_APP_MESSAGE;
  }
  if (
    lower.includes("invalid email") ||
    lower.includes("unable to validate email") ||
    lower.includes("email address is invalid")
  ) {
    return "Use a valid email. For local tests use owner@dayboard.test and match ALLOWED_OWNER_EMAIL in .env.local.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Email or password is wrong.";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("over_email_send_rate_limit")
  ) {
    return "Too many sign-up attempts. Wait a few minutes, turn off email confirmation in Supabase, or run pnpm bootstrap:owner.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirm your email or disable email confirmation in Supabase Auth settings.";
  }
  return message;
}