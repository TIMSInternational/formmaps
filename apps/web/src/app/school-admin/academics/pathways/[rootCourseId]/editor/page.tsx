"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PathwayEditor } from "../../../_components/PathwayEditor";

export default function PathwayEditorPage({ params }: { params: Promise<{ rootCourseId: string }> }) {
  const { rootCourseId } = use(params);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)", minHeight: 420 }}>
      {/* Page chrome */}
      <div className="flex items-center gap-3 pb-3">
        <Link
          href="/school-admin/academics?tab=pathways"
          className="inline-flex items-center gap-1.5"
          style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-secondary)" }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} /> Back to Pathways
        </Link>
      </div>

      {/* Editor (fills the rest) */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}
      >
        <PathwayEditor variant="page" rootCourseId={rootCourseId} />
      </div>
    </div>
  );
}
