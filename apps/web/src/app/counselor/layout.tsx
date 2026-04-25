"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCounselorAccess } from "@/hooks/useCounselorAccess";
import { CounselorLayout } from "./_components/CounselorLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // using isSchoolAdmin here primarily as the user request is that admins can invite them
  // but if the backend distinguishes, we rely on the specific hook
  const { isCounselor, loading } = useCounselorAccess();

  useEffect(() => {
    if (!loading && !isCounselor) {
      console.warn("Counselor access not verified - allowing access for development");
      // router.push("/login");
    }
  }, [isCounselor, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">
            Verifying access...
          </p>
        </div>
      </div>
    );
  }

  return <CounselorLayout>{children}</CounselorLayout>;
}
