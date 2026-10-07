"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isStudentDetailPath } from "@/lib/actingSchool";
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
  const pathname = usePathname();
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
                school-scoped request is made without a school — except a page about ONE student, opened from
                Admin → Users, which the backends scope to that student (an independent student has no school). */}
            {isSuperAdmin && (schoolId || isStudentDetailPath(pathname)) && (
              <ActingSchoolBar schoolName={schoolId ? schoolName : undefined} studentOnly={!schoolId} />
            )}
            {isSuperAdmin && !schoolId && !isStudentDetailPath(pathname) ? <SchoolPicker /> : children}
          </AppShell>
        </ErrorBoundary>
      </ChatProvider>
    </AdminThemeProvider>
  );
}
