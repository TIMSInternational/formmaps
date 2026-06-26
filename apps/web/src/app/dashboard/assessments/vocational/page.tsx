"use client";

import { useGlobalStore } from "@/store/useGlobalStore";
import { VocationalReport } from "@/components/vocational/VocationalReport";

export default function StudentVocationalReportPage() {
  const { user } = useGlobalStore();
  if (!user?.id) return null;
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <VocationalReport evaluatedUserId={user.id} selfView />
    </div>
  );
}
