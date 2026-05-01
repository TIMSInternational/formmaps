import type { Metadata } from "next";
import { geistSans, geistMono } from "./fonts";
import "./globals.css";
import { AuthWrapper } from "@/components/AuthWrapper";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryProvider } from "@/components/QueryProvider";
import { AssessmentCacheProvider } from "@/contexts/AssessmentCacheContext";
import { I18nProvider } from "@/components/I18nProvider";
import { TelemetryProvider } from "@/components/TelemetryProvider";
import { SkipToMain } from "@/components/ui/accessibility";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: {
    default: "Nexa Univ - Career Development Platform",
    template: "%s | Nexa Univ",
  },
  description:
    "Accelerate your career with personalized learning paths, skill assessments, and market insights.",
  keywords: [
    "career development",
    "skill assessment",
    "learning platform",
    "job market",
    "resume builder",
  ],
  authors: [{ name: "Nexa Univ" }],
  creator: "Nexa Univ",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Nexa Univ",
    title: "Nexa Univ - Career Development Platform",
    description:
      "Accelerate your career with personalized learning paths, skill assessments, and market insights.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexa Univ - Career Development Platform",
    description:
      "Accelerate your career with personalized learning paths, skill assessments, and market insights.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to external domains for faster loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans bg-background text-foreground antialiased`}
      >
        <SkipToMain mainId="main-content" />
        <ErrorBoundary>
          <QueryProvider>
            <AssessmentCacheProvider>
              <I18nProvider>
                <TelemetryProvider>
                  <AuthWrapper>{children}</AuthWrapper>
                </TelemetryProvider>
              </I18nProvider>
            </AssessmentCacheProvider>
          </QueryProvider>
        </ErrorBoundary>
        <Toaster
          richColors
          closeButton
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--admin-bg-card, #1e1e1e)",
              border: "1px solid var(--admin-border-default, #2a2a2a)",
              color: "var(--admin-font-primary, #ebebeb)",
              fontSize: "13px",
              backdropFilter: "blur(12px)",
            },
          }}
        />
      </body>
    </html>
  );
}
