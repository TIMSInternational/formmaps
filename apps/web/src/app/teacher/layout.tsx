"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermission } from "@/hooks/usePermission";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { TeacherSidebar } from "./_components/TeacherSidebar";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isTeacher } = usePermission();

  // Onboarding is a public token-based page — render without the portal shell
  const isOnboarding = pathname === "/teacher/onboarding";

  useEffect(() => {
    if (!isOnboarding && !isTeacher) {
      router.push("/login");
    }
  }, [isOnboarding, isTeacher, router]);

  if (isOnboarding) {
    return <>{children}</>;
  }

  return (
    <AdminThemeProvider>
      <ChatProvider>
        <ErrorBoundary>
          <AppShell sidebar={<TeacherSidebar />}>
            {children}
          </AppShell>
        </ErrorBoundary>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
