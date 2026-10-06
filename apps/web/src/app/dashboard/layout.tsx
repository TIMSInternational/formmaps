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
import { useIsIndependentStudent } from "@/hooks/useIsIndependentStudent";
import { isSchoolOnlyRoute } from "@/lib/independentStudent";
import { SchoolOnlyFeatureNotice } from "@/components/independent-student/SchoolOnlyFeatureNotice";

function StudentShell({ children }: { children: React.ReactNode }) {
  usePageViewTracking();
  const pathname = usePathname();
  // Direct URL to a school-only page by a student with no school → explain it
  // instead of rendering the dead end (#399). Nav + Cmd+K already hide them.
  const blockSchoolOnly = useIsIndependentStudent() && isSchoolOnlyRoute(pathname);

  return (
    <AppShell
      sidebar={<StudentSidebar />}
      sidebarClassName="hidden md:block"
      frame
      overlay={
        <>
          <MobileNav />
          <CommandPalette />
          <KeyboardShortcuts />
        </>
      }
    >
      {blockSchoolOnly ? <SchoolOnlyFeatureNotice /> : children}
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
