"use client";

import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { StudentSidebar } from "./_components/StudentSidebar";
import { MobileNav } from "./_components/MobileNav";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { CompareProvider } from "@/components/compare/CompareContext";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { KeyboardShortcuts } from "@/components/keyboard/KeyboardShortcuts";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";

function StudentShell({ children }: { children: React.ReactNode }) {
  usePageViewTracking();

  return (
    <AppShell
      sidebar={<StudentSidebar />}
      sidebarClassName="hidden md:block"
      overlay={
        <>
          <MobileNav />
          <CommandPalette />
          <KeyboardShortcuts />
        </>
      }
    >
      {children}
    </AppShell>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Coaching has its own layout — pass through
  if (pathname?.startsWith("/dashboard/coaching")) {
    return <>{children}</>;
  }

  return (
    <AdminThemeProvider>
      <ChatProvider>
        <CompareProvider>
          <StudentShell>{children}</StudentShell>
        </CompareProvider>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
