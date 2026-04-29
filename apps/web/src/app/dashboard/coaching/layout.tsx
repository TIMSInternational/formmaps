"use client";

import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { CoachSidebar } from "./_components/CoachSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function CoachShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="admin-twenty"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        width: "100%",
        position: "relative",
        fontFamily: "var(--admin-font-family, Inter, -apple-system, system-ui, sans-serif)",
        fontSize: 13,
        background: "var(--admin-bg-outer)",
      }}
    >
      <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
        <div style={{ flexShrink: 0 }}>
          <CoachSidebar />
        </div>

        <div style={{ display: "flex", flex: "0 1 100%", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%",
              padding: 12,
              paddingLeft: 6,
            }}
          >
            <main
              style={{
                background: "var(--admin-bg-panel)",
                border: "1px solid var(--admin-border-panel)",
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                flex: 1,
                overflow: "hidden",
              }}
            >
              <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoachingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <AdminThemeProvider>
        <CoachShell>{children}</CoachShell>
      </AdminThemeProvider>
    </ErrorBoundary>
  );
}
