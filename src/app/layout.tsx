import type { Metadata, Viewport } from "next";
import { DM_Sans, Sora } from "next/font/google";
import "./globals.css";
import {
  ThemeProvider,
  type ThemeSetting,
} from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { createClient } from "@/lib/supabase/server";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Dayboard",
  description: "Private daily tracker",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Dayboard",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#161412" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let sourceTheme: ThemeSetting | null = null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("theme")
      .eq("id", user.id)
      .maybeSingle();
    const row = data as { theme: ThemeSetting } | null;
    sourceTheme = row?.theme ?? null;
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${sora.variable}`}
    >
      <body className="font-sans">
        <ThemeProvider defaultTheme="system" sourceTheme={sourceTheme} attribute="class">
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}