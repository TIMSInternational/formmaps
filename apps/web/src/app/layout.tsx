import type { Metadata } from "next";
import { geistSans, geistMono, poppins } from "./fonts";
import "./globals.css";
import { AuthWrapper } from "@/components/AuthWrapper";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryProvider } from "@/components/QueryProvider";
import { AssessmentCacheProvider } from "@/contexts/AssessmentCacheContext";
import { I18nProvider } from "@/components/I18nProvider";
import { TelemetryProvider } from "@/components/TelemetryProvider";
import { SkipToMain } from "@/components/ui/accessibility";
import { Toaster } from "sonner";
import { CookieConsent } from "@/components/CookieConsent";
import { validateEnv } from "@/lib/env";

validateEnv();

export const metadata: Metadata = {
  title: {
    default: "FormMaps - Find your path. Shape your future.",
    template: "%s | FormMaps",
  },
  description:
    "AI-powered college counseling and career guidance platform for students, counselors, and schools.",
  keywords: [
    "college counseling",
    "career guidance",
    "admission predictions",
    "student assessments",
    "school platform",
  ],
  authors: [{ name: "FormMaps" }],
  creator: "FormMaps",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "FormMaps",
    title: "FormMaps - Career Development Platform",
    description:
      "AI-powered college counseling and career guidance platform for students, counselors, and schools.",
  },
  twitter: {
    card: "summary_large_image",
    title: "FormMaps - Career Development Platform",
    description:
      "AI-powered college counseling and career guidance platform for students, counselors, and schools.",
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
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} font-sans bg-background text-foreground antialiased`}
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
        <CookieConsent />
      </body>
    </html>
  );
}
