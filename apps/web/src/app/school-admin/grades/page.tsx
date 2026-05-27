"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Upload, Settings, Trophy, GraduationCap, TrendingDown } from "lucide-react";
import { AdminTabBar } from "../_components/AdminTabBar";

const GpaPanel = dynamic(() => import("../academics/_components/GpaPanel").then(m => ({ default: m.GpaPanel })));
const GraduationPanel = dynamic(() => import("../academics/_components/GraduationPanel").then(m => ({ default: m.GraduationPanel })));
const AcademicGapsPanel = dynamic(() => import("../academics/_components/AcademicGapsPanel").then(m => ({ default: m.AcademicGapsPanel })));

const TABS = [
  { key: "grades", label: "Grades & GPA", icon: Trophy },
  { key: "graduation", label: "Graduation", icon: GraduationCap },
  { key: "gaps", label: "Academic Gaps", icon: TrendingDown },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function GradesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as TabKey) || "grades";
  const [activeTab, setActiveTab] = useState<string>(
    TABS.some(t => t.key === initialTab) ? initialTab : "grades"
  );

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "grades" ? "/school-admin/grades" : `/school-admin/grades?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>Grades & Progress</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>Import grades, configure GPA, track graduation progress, and identify academic gaps</p>
      </div>

      <AdminTabBar tabs={[...TABS]} activeTab={activeTab} onChange={handleTabChange} />

      {activeTab === "grades" && <GpaPanel />}
      {activeTab === "graduation" && <GraduationPanel />}
      {activeTab === "gaps" && <AcademicGapsPanel />}
    </div>
  );
}
