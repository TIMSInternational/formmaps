"use client";

import { AdminSidebar } from "./_components/AdminSidebar";
import { AdminThemeProvider, useAdminTheme } from "@/contexts/AdminThemeContext";

function AdminShell({ children }: { children: React.ReactNode }) {
  const { colors } = useAdminTheme();

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
          <AdminSidebar />
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminThemeProvider>
      <AdminShell>{children}</AdminShell>
    </AdminThemeProvider>
  );
}
