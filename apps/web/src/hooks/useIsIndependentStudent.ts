"use client";

import { useGlobalStore } from "@/store/useGlobalStore";
import { isIndependentStudentUser } from "@/lib/independentStudent";

/** Student with no school (see lib/independentStudent). */
export function useIsIndependentStudent(): boolean {
  const { user } = useGlobalStore();
  return !!user.isAuthenticated && isIndependentStudentUser(user);
}
