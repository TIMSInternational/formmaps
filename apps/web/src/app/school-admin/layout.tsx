"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSchoolAdminAccess } from "@/hooks/useSchoolAdminAccess";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { SchoolAdminSidebar } from "./_components/SchoolAdminSidebar";
import { ActingSchoolBar } from "./_components/ActingSchoolBar";
import { SchoolPicker } from "./_components/SchoolPicker";
import { ChatProvider } from "@/components/ai-chat/ChatContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isSchoolAdmin, isSuperAdmin, schoolId, schoolName, loading } = useSchoolAdminAccess();

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
          <AppShell
      sidebarClassName="hidden md:block" frame sidebar={<SchoolAdminSidebar />}>
            {/* A Super Admin acts on one school at a time: until it picks one, every page is the picker, so no
                school-scoped request is ever made without a school. */}
            {isSuperAdmin && schoolId && <ActingSchoolBar schoolName={schoolName} />}
            {isSuperAdmin && !schoolId ? <SchoolPicker /> : children}
          </AppShell>
        </ErrorBoundary>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
