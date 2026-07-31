"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";

/**
 * Resume Builder Root Page
 *
 * Redirects to the My Resumes page which is the entry point for resume management.
 * Users navigate from there to create or edit resumes.
 */
export default function ResumeBuilderPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/resumes");
  }, [router]);

  return <DashboardSkeleton />;
}
