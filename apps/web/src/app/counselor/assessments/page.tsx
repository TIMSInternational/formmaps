"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Radar, Award } from "lucide-react";
import { CounselorTabBar } from "../_components/CounselorTabBar";
import dynamic from "next/dynamic";

const EvaluationsPanel = dynamic(() => import("../evaluations/page"), { ssr: false });
const RecommendationsPanel = dynamic(() => import("../recommendations/page"), { ssr: false });

export default function CounselorAssessmentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("evaluations");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "evaluations" || tab === "recommendations") setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "evaluations" ? "/counselor/assessments" : `/counselor/assessments?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          Assessments
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          360-degree evaluations and course recommendations for your students
        </p>
      </div>

      <CounselorTabBar
        tabs={[
          { key: "evaluations", label: "360\u00B0 Evaluations", icon: Radar },
          { key: "recommendations", label: "Recommendations", icon: Award },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === "evaluations" && <EvaluationsPanel />}
      {activeTab === "recommendations" && <RecommendationsPanel />}
    </div>
  );
}
