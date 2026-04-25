"use client";

import { usePermission } from "./usePermission";

export function useCounselorAccess() {
  const { isCounselor } = usePermission();

  return { isCounselor, loading: false };
}
