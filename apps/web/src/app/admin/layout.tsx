"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "./_components/AdminSidebar";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAdmin, loading } = useAdminAccess();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push("/login");
    }
  }, [isAdmin, loading, router]);

  if (loading || !isAdmin) {
    return <LoadingSpinner />;
  }

  return (
    <AdminThemeProvider>
      <ChatProvider>
        <ErrorBoundary>
          <AppShell sidebar={<AdminSidebar />}>
            {children}
          </AppShell>
        </ErrorBoundary>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
