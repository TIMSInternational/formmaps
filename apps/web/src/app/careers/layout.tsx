"use client";

import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { StudentSidebar } from "@/app/dashboard/_components/StudentSidebar";
import { MobileNav } from "@/app/dashboard/_components/MobileNav";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Careers lives outside /dashboard but is a student surface, so it wears the student shell. It
// used to carry its own copy of AppShell, which drifted: no skip link, and the old cream ground
// under a sidebar that now reads the navy frame tokens -- and the full sidebar at every width,
// because the mobile pass only covered layouts that already used the shared shell.
function CareersShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sidebar={<StudentSidebar />} sidebarClassName="hidden md:block" frame overlay={<MobileNav />}>
      {children}
    </AppShell>
  );
}

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminThemeProvider>
      <ChatProvider>
        <ErrorBoundary>
          <CareersShell>{children}</CareersShell>
        </ErrorBoundary>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
