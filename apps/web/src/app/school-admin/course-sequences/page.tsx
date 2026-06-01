"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/school-admin/academics?tab=sequences"); }, [router]);
  return null;
}
