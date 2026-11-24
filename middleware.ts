import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = [
  "/today",
  "/board",
  "/goals",
  "/money",
  "/review",
  "/export",
  "/settings",
];

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  const isProtected = PROTECTED.some(
    (p) =>
      request.nextUrl.pathname === p ||
      request.nextUrl.pathname.startsWith(`${p}/`),
  );

  if (!isProtected) {
    return response;
  }

  const { url, publishableKey } = getPublicSupabaseConfig();
  const supabase = createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};