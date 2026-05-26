"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function CounselorStudentsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/school-admin/students?tab=counselors"); }, [router]);
  return null;
}
