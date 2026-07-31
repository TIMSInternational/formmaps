"use client";

import dynamic from "next/dynamic";

const CoachDashboard = dynamic(
  () => import("@/components/dashboard/CoachDashboard"),
  { ssr: false }
);

export default function CoachingPage() {
  return <CoachDashboard />;
}
