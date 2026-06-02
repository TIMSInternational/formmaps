"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermission } from "@/hooks/usePermission";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { CoachSidebar } from "./_components/CoachSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { AppShell } from "@/components/layout/AppShell";

export default function CoachingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isCoach } = usePermission();

  useEffect(() => {
    if (!isCoach) {
      router.push("/login");
    }
  }, [isCoach, router]);

  return (
    <ErrorBoundary>
      <AdminThemeProvider>
        <ChatProvider>
          <AppShell sidebar={<CoachSidebar />}>
            {children}
          </AppShell>
        </ChatProvider>
      </AdminThemeProvider>
    </ErrorBoundary>
  );
}
