"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
export default function StudentsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get("tab");
    const url = tab ? `/school-admin/users?tab=${tab}` : "/school-admin/users";
    router.replace(url);
  }, [router, searchParams]);
  return null;
}
