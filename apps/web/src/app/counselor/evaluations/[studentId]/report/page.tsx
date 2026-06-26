"use client";

import { useParams } from "next/navigation";
import { VocationalReport } from "@/components/vocational/VocationalReport";

export default function CounselorVocationalReportPage() {
  const params = useParams();
  const studentId = params.studentId as string;
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <VocationalReport evaluatedUserId={studentId} />
    </div>
  );
}
