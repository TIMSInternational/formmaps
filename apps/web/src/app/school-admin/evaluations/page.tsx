"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function EvaluationsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/school-admin/assessments?tab=evaluations"); }, [router]);
  return null;
}
