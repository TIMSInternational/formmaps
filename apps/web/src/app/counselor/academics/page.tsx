"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TrendingDown, BarChart3, FileText } from "lucide-react";
import { CounselorTabBar } from "../_components/CounselorTabBar";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";

const AcademicGapsPanel = dynamic(() => import("../academic-gaps/page"), { ssr: false });
const InsightsPanel = dynamic(() => import("../insights/page"), { ssr: false });
const ReportsPanel = dynamic(() => import("../reports/page"), { ssr: false });

export default function CounselorAcademicsPage() {
  const { t } = useTranslation("counselor");
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("gaps");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "gaps" || tab === "insights" || tab === "reports") setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "gaps" ? "/counselor/academics" : `/counselor/academics?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          {t("nav.academics")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {t("ui.academics.subtitle")}
        </p>
      </div>

      <CounselorTabBar
        tabs={[
          { key: "gaps", label: t("dashboard.academicGaps"), icon: TrendingDown },
          { key: "insights", label: t("ui.academics.tabInsights"), icon: BarChart3 },
          { key: "reports", label: t("ui.academics.tabReports"), icon: FileText },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === "gaps" && <AcademicGapsPanel />}
      {activeTab === "insights" && <InsightsPanel />}
      {activeTab === "reports" && <ReportsPanel />}
    </div>
  );
}
