"use client";

import { ClipboardList } from "lucide-react";
import type { CourseChangeRequest } from "@/types/coursePlan";

interface ChangeRequestsSectionProps {
  requests: CourseChangeRequest[];
  onCancel: (id: string) => void;
}

export function ChangeRequestsSection({ requests, onCancel }: ChangeRequestsSectionProps) {
  if (requests.length === 0) return null;
  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--admin-bg-panel)", border: "1px solid var(--admin-border-default)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="h-4 w-4" style={{ color: "var(--admin-font-tertiary)" }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--admin-font-primary)" }}>
          My Change Requests
        </h2>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--admin-border-light)" }}>
        {requests.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2.5 gap-3">
            <div className="min-w-0">
              <p className="text-sm truncate" style={{ color: "var(--admin-font-primary)" }}>
                {r.action ? `${r.action} — ` : ""}{r.courseName ?? "Course"}
              </p>
              <p className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>{r.status}</p>
            </div>
            {r.status === "pending" && (
              <button
                type="button"
                onClick={() => onCancel(r.id)}
                className="text-xs font-medium shrink-0"
                style={{ color: "#dc2626" }}
              >
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
