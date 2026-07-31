"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CalendarDays, Calendar } from "lucide-react";
import { CounselorTabBar } from "../_components/CounselorTabBar";
import dynamic from "next/dynamic";

const SessionsPanel = dynamic(() => import("../sessions/page"), { ssr: false });
const CalendarPanel = dynamic(() => import("../calendar/page"), { ssr: false });

const VALID_TABS = ["sessions", "calendar"];

export default function SchedulingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("sessions");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && VALID_TABS.includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "sessions" ? "/counselor/scheduling" : `/counselor/scheduling?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)" }}>Scheduling</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          Manage counseling sessions and view your calendar
        </p>
      </div>
      <CounselorTabBar
        tabs={[
          { key: "sessions", label: "Sessions", icon: CalendarDays },
          { key: "calendar", label: "Calendar", icon: Calendar },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />
      {activeTab === "sessions" && <SessionsPanel />}
      {activeTab === "calendar" && <CalendarPanel />}
    </div>
  );
}
