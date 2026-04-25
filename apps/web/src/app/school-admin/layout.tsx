"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSchoolAdminAccess } from "@/hooks/useSchoolAdminAccess";
import { SchoolAdminLayout } from "./_components/SchoolAdminLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isSchoolAdmin, loading } = useSchoolAdminAccess();

  useEffect(() => {
    if (!loading && !isSchoolAdmin) {
      // For development, allow access. In production, redirect to login
      // router.push("/login");
      console.warn("School admin access not verified - allowing access for development");
    }
  }, [isSchoolAdmin, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">
            Verifying access...
          </p>
        </div>
      </div>
    );
  }

  return <SchoolAdminLayout>{children}</SchoolAdminLayout>;
}
