"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Library, BookOpen, GitBranch } from "lucide-react";
import { AdminTabBar } from "../_components/AdminTabBar";

const CoursesPanel = dynamic(() => import("./_components/CoursesPanel").then(m => ({ default: m.CoursesPanel })));
const CurriculumPanel = dynamic(() => import("./_components/CurriculumPanel").then(m => ({ default: m.CurriculumPanel })));
const SequencesPanel = dynamic(() => import("./_components/SequencesPanel").then(m => ({ default: m.SequencesPanel })));

const TABS = [
  { key: "courses", label: "Courses", icon: Library },
  { key: "curriculum", label: "Curriculum", icon: BookOpen },
  { key: "sequences", label: "Sequences", icon: GitBranch },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AcademicsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Redirect old tabs to new Grades page
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "gpa" || tab === "graduation" || tab === "gaps") {
      const newTab = tab === "gpa" ? "grades" : tab;
      router.replace(`/school-admin/grades?tab=${newTab}`);
    }
  }, [searchParams, router]);

  const initialTab = (searchParams.get("tab") as TabKey) || "courses";
  const [activeTab, setActiveTab] = useState<string>(
    TABS.some(t => t.key === initialTab) ? initialTab : "courses"
  );

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "courses" ? "/school-admin/academics" : `/school-admin/academics?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>Academics</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>Manage your course catalog, curriculum frameworks, and course sequences</p>
      </div>

      <AdminTabBar tabs={[...TABS]} activeTab={activeTab} onChange={handleTabChange} />

      {activeTab === "courses" && <CoursesPanel />}
      {activeTab === "curriculum" && <CurriculumPanel />}
      {activeTab === "sequences" && <SequencesPanel />}
    </div>
  );
}
