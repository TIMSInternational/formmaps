"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function UsersRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/school-admin/students?tab=staff"); }, [router]);
  return null;
}
