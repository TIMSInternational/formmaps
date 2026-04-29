"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCounselorAccess } from "@/hooks/useCounselorAccess";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { CounselorSidebar } from "./_components/CounselorSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function CounselorShell({ children }: { children: React.ReactNode }) {
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
          <CounselorSidebar />
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

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isCounselor, loading } = useCounselorAccess();

  useEffect(() => {
    if (!loading && !isCounselor) {
      // router.push("/login");
    }
  }, [isCounselor, loading, router]);

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
    <ErrorBoundary>
      <AdminThemeProvider>
        <CounselorShell>{children}</CounselorShell>
      </AdminThemeProvider>
    </ErrorBoundary>
  );
}
