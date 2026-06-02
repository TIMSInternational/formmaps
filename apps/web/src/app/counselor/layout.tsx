"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCounselorAccess } from "@/hooks/useCounselorAccess";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { CounselorSidebar } from "./_components/CounselorSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { AppShell } from "@/components/layout/AppShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isCounselor, loading } = useCounselorAccess();

  useEffect(() => {
    if (!loading && !isCounselor) {
      router.push("/login");
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
        <ChatProvider>
          <AppShell sidebar={<CounselorSidebar />}>
            {children}
          </AppShell>
        </ChatProvider>
      </AdminThemeProvider>
    </ErrorBoundary>
  );
}
