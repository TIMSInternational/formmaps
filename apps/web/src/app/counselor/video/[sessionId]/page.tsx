"use client";
import { use } from "react";
import VideoCall from "@/components/video/VideoCall";
export default function CounselorVideoPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  return <VideoCall sessionId={sessionId} returnPath="/counselor/video" />;
}
