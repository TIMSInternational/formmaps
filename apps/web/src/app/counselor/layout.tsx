"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCounselorAccess } from "@/hooks/useCounselorAccess";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { CounselorSidebar } from "./_components/CounselorSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isCounselor, loading } = useCounselorAccess();

  useEffect(() => {
    if (!loading && !isCounselor) {
      router.push("/login");
    }
  }, [isCounselor, loading, router]);

  if (loading) {
    return <LoadingSpinner />;
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
