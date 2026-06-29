"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Trophy, GraduationCap, TrendingDown } from "lucide-react";
import { AdminTabBar } from "../_components/AdminTabBar";

const GpaPanel = dynamic(() => import("../academics/_components/GpaPanel").then(m => ({ default: m.GpaPanel })));
const GraduationPanel = dynamic(() => import("../academics/_components/GraduationPanel").then(m => ({ default: m.GraduationPanel })));
const AcademicGapsPanel = dynamic(() => import("../academics/_components/AcademicGapsPanel").then(m => ({ default: m.AcademicGapsPanel })));

type TabKey = "grades" | "graduation" | "gaps";

export default function GradesPage() {
  const { t } = useTranslation("school_admin");
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab") as TabKey | null;
  const initialTab: TabKey = rawTab === "graduation" || rawTab === "gaps" ? rawTab : "grades";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "grades" ? "/school-admin/grades" : `/school-admin/grades?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>{t("grades.title")}</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{t("grades.subtitle")}</p>
      </div>

      <AdminTabBar
        tabs={[
          { key: "grades", label: t("grades.tabs.grades"), icon: Trophy },
          { key: "graduation", label: t("grades.tabs.graduation"), icon: GraduationCap },
          { key: "gaps", label: t("grades.tabs.gaps"), icon: TrendingDown },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === "grades" && <GpaPanel />}
      {activeTab === "graduation" && <GraduationPanel />}
      {activeTab === "gaps" && <AcademicGapsPanel />}
    </div>
  );
}
