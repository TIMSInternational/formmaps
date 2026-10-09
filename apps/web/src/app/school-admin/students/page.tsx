"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentDirectory } from "./_components/StudentDirectory";

/**
 * Students: every student of the school with the status of each assessment; a row opens the
 * student's "Results & Answers". Old links that carried a roster tab (?tab=staff, ?tab=counselors…)
 * still go to Users & invites, where those tabs live.
 */
function StudentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  useEffect(() => {
    if (tab) router.replace(`/school-admin/users?tab=${encodeURIComponent(tab)}`);
  }, [router, tab]);
  return tab ? null : <StudentDirectory />;
}

export default function StudentsPage() {
  return (
    <Suspense fallback={null}>
      <StudentsPageInner />
    </Suspense>
  );
}
