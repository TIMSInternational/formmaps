"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MessageCircle, Video, FileText, Bell } from "lucide-react";
import { CounselorTabBar } from "../_components/CounselorTabBar";
import dynamic from "next/dynamic";

const MessagesPanel = dynamic(() => import("../messages/page"), { ssr: false });
const VideoCallsPanel = dynamic(() => import("../video/page"), { ssr: false });
const NotesPanel = dynamic(() => import("../notes/page"), { ssr: false });
const AlertsPanel = dynamic(() => import("../alerts/page"), { ssr: false });

const VALID_TABS = ["messages", "video", "notes", "alerts"];

export default function CommunicationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("messages");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && VALID_TABS.includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "messages" ? "/counselor/communication" : `/counselor/communication?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)" }}>Communication</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          Messages, video calls, session notes, and student alerts
        </p>
      </div>
      <CounselorTabBar
        tabs={[
          { key: "messages", label: "Messages", icon: MessageCircle },
          { key: "video", label: "Video Calls", icon: Video },
          { key: "notes", label: "Session Notes", icon: FileText },
          { key: "alerts", label: "Alerts", icon: Bell },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />
      {activeTab === "messages" && <MessagesPanel />}
      {activeTab === "video" && <VideoCallsPanel />}
      {activeTab === "notes" && <NotesPanel />}
      {activeTab === "alerts" && <AlertsPanel />}
    </div>
  );
}
