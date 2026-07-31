"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";

export default function MessagesRedirect() {
  const router = useRouter();
  const roleName = useGlobalStore((s) => s.user.role);

  useEffect(() => {
    const role = (roleName || "").toLowerCase();
    if (role === "school_admin" || role === "school admin") {
      router.replace("/school-admin/messages");
    } else if (role === "counselor") {
      router.replace("/counselor/messages");
    } else {
      router.replace("/dashboard/messages");
    }
  }, [roleName, router]);

  return null;
}
