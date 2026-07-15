"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  verifyCounselorToken,
  completeCounselorOnboarding,
  type CounselorOnboardingPayload,
} from "@/services/counselorService";

export const counselorOnboardingKeys = {
  all: ["counselor-onboarding"] as const,
  verify: (token: string) => [...counselorOnboardingKeys.all, "verify", token] as const,
};

export function useVerifyCounselorToken(token: string) {
  return useQuery({
    queryKey: counselorOnboardingKeys.verify(token),
    queryFn: () => verifyCounselorToken(token),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });
}

export function useCompleteCounselorOnboarding() {
  return useMutation({
    mutationFn: (payload: CounselorOnboardingPayload) =>
      completeCounselorOnboarding(payload),
  });
}
