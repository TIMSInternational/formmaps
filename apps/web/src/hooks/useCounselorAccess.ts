"use client";

import { useState, useEffect } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";

export function useCounselorAccess() {
  const { user } = useGlobalStore();
  const [isCounselor, setIsCounselor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = () => {
      // In development, we can explicitly allow.
      // In production, we should check `user?.role === "counselor"`
      if (user?.role === "counselor" || process.env.NODE_ENV === "development") {
        setIsCounselor(true);
      } else {
        setIsCounselor(false);
      }
      setLoading(false);
    };

    checkAccess();
  }, [user]);

  return { isCounselor, loading };
}
