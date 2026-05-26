"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Library, BookOpen, GitBranch, BarChart3, GraduationCap, TrendingDown } from "lucide-react";
import { AdminTabBar } from "../_components/AdminTabBar";

const CoursesPanel = dynamic(() => import("./_components/CoursesPanel").then(m => ({ default: m.CoursesPanel })));
const CurriculumPanel = dynamic(() => import("./_components/CurriculumPanel").then(m => ({ default: m.CurriculumPanel })));
const SequencesPanel = dynamic(() => import("./_components/SequencesPanel").then(m => ({ default: m.SequencesPanel })));
const GpaPanel = dynamic(() => import("./_components/GpaPanel").then(m => ({ default: m.GpaPanel })));
const GraduationPanel = dynamic(() => import("./_components/GraduationPanel").then(m => ({ default: m.GraduationPanel })));
const AcademicGapsPanel = dynamic(() => import("./_components/AcademicGapsPanel").then(m => ({ default: m.AcademicGapsPanel })));

const TABS = [
  { key: "courses", label: "Courses", icon: Library },
  { key: "curriculum", label: "Curriculum", icon: BookOpen },
  { key: "sequences", label: "Sequences", icon: GitBranch },
  { key: "gpa", label: "GPA & Rankings", icon: BarChart3 },
  { key: "graduation", label: "Graduation", icon: GraduationCap },
  { key: "gaps", label: "Academic Gaps", icon: TrendingDown },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AcademicsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "courses";
  const [activeTab, setActiveTab] = useState<string>(
    TABS.some(t => t.key === initialTab) ? initialTab : "courses"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          Academics
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          Manage courses, curriculum, sequences, grading, and graduation requirements
        </p>
      </div>

      <AdminTabBar
        tabs={[...TABS]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "courses" && <CoursesPanel />}
      {activeTab === "curriculum" && <CurriculumPanel />}
      {activeTab === "sequences" && <SequencesPanel />}
      {activeTab === "gpa" && <GpaPanel />}
      {activeTab === "graduation" && <GraduationPanel />}
      {activeTab === "gaps" && <AcademicGapsPanel />}
    </div>
  );
}
