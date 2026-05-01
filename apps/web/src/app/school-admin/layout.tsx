"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSchoolAdminAccess } from "@/hooks/useSchoolAdminAccess";
import { AdminThemeProvider, useAdminTheme } from "@/contexts/AdminThemeContext";
import { SchoolAdminSidebar } from "./_components/SchoolAdminSidebar";
import { PageTopBar } from "@/components/layout/PageTopBar";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { SidePanelContextProvider, SidePanelRenderer } from "@/components/side-panel/SidePanel";

function SchoolAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <SidePanelContextProvider>
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
          background: "var(--admin-bg-noisy) repeat, var(--admin-bg-outer)",
        }}
      >
        <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", minHeight: 0 }}>
          <div style={{ flexShrink: 0 }}>
            <SchoolAdminSidebar />
          </div>

          <div style={{ display: "flex", flex: "0 1 100%", overflow: "hidden" }}>
            <div style={{
              display: "flex", flex: "1 1 auto", flexDirection: "column",
              paddingRight: 12, paddingBottom: 12, boxSizing: "border-box",
              width: "100%", minHeight: 0,
            }}>
              <PageTopBar />

              <div style={{ display: "flex", flex: "1 1 auto", gap: 8, minHeight: 0 }}>
                <main
                  id="main-content"
                  style={{
                    background: "var(--admin-bg-panel)",
                    border: "1px solid var(--admin-border-panel)",
                    borderRadius: 8,
                    display: "flex", flexDirection: "column",
                    flex: 1, overflowX: "auto", overflowY: "hidden",
                    width: "100%", minWidth: 0,
                  }}
                >
                  <div className="flex-1 overflow-y-auto px-4 py-4 pb-20 md:pb-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
                    {children}
                  </div>
                </main>
                <SidePanelRenderer />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidePanelContextProvider>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isSchoolAdmin, loading } = useSchoolAdminAccess();

  useEffect(() => {
    if (!loading && !isSchoolAdmin) {
      // router.push("/login");
    }
  }, [isSchoolAdmin, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#1d1d1d" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
          <p style={{ color: "#818181", fontSize: 13 }}>Verifying access...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminThemeProvider>
      <ChatProvider>
        <SchoolAdminShell>{children}</SchoolAdminShell>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
