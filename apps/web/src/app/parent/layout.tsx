"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermission } from "@/hooks/usePermission";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { ParentSidebar } from "./_components/ParentSidebar";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isParent } = usePermission();

  useEffect(() => {
    if (!isParent) {
      router.push("/login");
    }
  }, [isParent, router]);

  // Onboarding is a public token-based page — render without the portal shell
  if (pathname === "/parent/onboarding") {
    return <>{children}</>;
  }

  return (
    <AdminThemeProvider>
      <ChatProvider>
        <ErrorBoundary>
          <AppShell sidebar={<ParentSidebar />}>
            {children}
          </AppShell>
        </ErrorBoundary>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
