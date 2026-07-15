"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSchoolAdminAccess } from "@/hooks/useSchoolAdminAccess";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { SchoolAdminSidebar } from "./_components/SchoolAdminSidebar";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isSchoolAdmin, loading } = useSchoolAdminAccess();

  useEffect(() => {
    if (!loading && !isSchoolAdmin) {
      router.push("/login");
    }
  }, [isSchoolAdmin, loading, router]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <AdminThemeProvider>
      <ChatProvider>
        <ErrorBoundary>
          <AppShell sidebar={<SchoolAdminSidebar />}>
            {children}
          </AppShell>
        </ErrorBoundary>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
