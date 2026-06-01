"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { GraduationCap, Building2, PenLine, FileCheck, Award, Trophy } from "lucide-react";
import { CounselorTabBar } from "../_components/CounselorTabBar";
import dynamic from "next/dynamic";

const ApplicationsPanel = dynamic(() => import("../college-apps/page"), { ssr: false });
const CollegeListPanel = dynamic(() => import("../college-list/page"), { ssr: false });
const EssaysPanel = dynamic(() => import("../essays/page"), { ssr: false });
const DocumentsPanel = dynamic(() => import("../documents/page"), { ssr: false });
const ScholarshipsPanel = dynamic(() => import("../scholarships/page"), { ssr: false });
const ActivitiesPanel = dynamic(() => import("../activities/page"), { ssr: false });

const VALID_TABS = ["apps", "list", "essays", "documents", "scholarships", "activities"];

export default function CollegePrepPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("apps");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && VALID_TABS.includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "apps" ? "/counselor/college-prep" : `/counselor/college-prep?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)" }}>College Prep</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          Manage college applications, essays, documents, scholarships, and activities
        </p>
      </div>
      <CounselorTabBar
        tabs={[
          { key: "apps", label: "Applications", icon: GraduationCap },
          { key: "list", label: "College List", icon: Building2 },
          { key: "essays", label: "Essays", icon: PenLine },
          { key: "documents", label: "Documents", icon: FileCheck },
          { key: "scholarships", label: "Scholarships", icon: Award },
          { key: "activities", label: "Activities", icon: Trophy },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />
      {activeTab === "apps" && <ApplicationsPanel />}
      {activeTab === "list" && <CollegeListPanel />}
      {activeTab === "essays" && <EssaysPanel />}
      {activeTab === "documents" && <DocumentsPanel />}
      {activeTab === "scholarships" && <ScholarshipsPanel />}
      {activeTab === "activities" && <ActivitiesPanel />}
    </div>
  );
}
