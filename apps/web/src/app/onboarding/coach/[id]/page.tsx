"use client";

import React, { use, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { PersonalInfoStep } from "@/components/onboarding/PersonalInfoStep";
import { PricingStep } from "@/components/onboarding/PricingStep";
import { AvailabilityStep } from "@/components/onboarding/AvailabilityStep";
import { CalendarSyncStep } from "@/components/onboarding/CalendarSyncStep";
import { PasswordStep } from "@/components/onboarding/PasswordStep";
import {
  CoachOnboardingData,
  INITIAL_ONBOARDING_DATA,
} from "@/components/onboarding/types";
import { useGlobalStore } from "@/store/useGlobalStore";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function CoachOnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useTranslation();
  const { id } = use(params); // id is the invitation token
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useGlobalStore();
  const STEPS = [
    {
      title: t("onboarding.coach.personalTitle"),
      description: t("onboarding.coach.personalDesc"),
    },
    {
      title: t("onboarding.coach.pricingTitle"),
      description: t("onboarding.coach.pricingDesc"),
    },
    {
      title: t("onboarding.coach.availabilityTitle"),
      description: t("onboarding.coach.availabilityDesc"),
    },
    {
      title: t("onboarding.coach.calendarTitle"),
      description: t("onboarding.coach.calendarDesc"),
    },
    {
      title: t("onboarding.steps.setPasswordTitle"),
      description: t("onboarding.steps.setPasswordDesc"),
    },
  ];
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<CoachOnboardingData>(
    INITIAL_ONBOARDING_DATA
  );
  const [coachId, setCoachId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(`onboarding_data_${id}`);
    const savedStep = localStorage.getItem(`onboarding_step_${id}`);

    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setData((prev) => ({ ...prev, ...parsedData }));
      } catch (e) {
      // error handled silently
    }
    }

    if (savedStep) {
      setCurrentStep(parseInt(savedStep));
    }
  }, [id]);

  // Handle googleConnected query param
  // Handle calendar connection callbacks (?calendar=connected|error from /api/v1/calendar)
  useEffect(() => {
    const calendarResult = searchParams.get("calendar");
    if (calendarResult === "error") {
      toast.error(t("onboarding.coach.calendarFailed"));
      setCurrentStep(4);
      return;
    }
    if (calendarResult === "connected") {
      const verifyConnection = async () => {
        try {
          setIsLoading(true);
          const { getCalendarStatus } = await import("@/services/calendarService");
          const [google, outlook] = await Promise.all([getCalendarStatus("google"), getCalendarStatus("outlook")]);
          const provider = google.connected ? "google" : outlook.connected ? "outlook" : null;

          if (provider) {
            setData((prev) => ({
              ...prev,
              calendarIntegrations: {
                ...prev.calendarIntegrations,
                google: provider === "google" ? true : false,
                outlook: provider === "outlook" ? true : false,
              },
            }));
            setCurrentStep(5);
            toast.success(t("onboarding.coach.calendarConnected", { provider: provider === 'google' ? 'Google' : 'Outlook' }));
          } else {
            toast.error(t("onboarding.coach.calendarVerifyFailed"));
            setCurrentStep(4); // Ensure we are on the Calendar Sync step
          }
        } catch (error) {
          toast.error(t("onboarding.coach.calendarError"));
          setCurrentStep(4);
        } finally {
          setIsLoading(false);
        }
      };

      verifyConnection();
    }
  }, [searchParams, email]);


  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (data !== INITIAL_ONBOARDING_DATA) {
      localStorage.setItem(`onboarding_data_${id}`, JSON.stringify(data));
    }
  }, [data, id]);

  // Save current step to localStorage
  useEffect(() => {
    // If we just jumped to 5 due to param, this will save 5.
    localStorage.setItem(`onboarding_step_${id}`, currentStep.toString());
  }, [currentStep, id]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { getOnboardingStatus } = await import("@/services/coachService");
        const status = await getOnboardingStatus(id);
        setCoachId(status.userId);
        setEmail(status.email);

        // Pre-fill data if available and not already populated from localStorage
        setData((prev) => {
          // Only update name if it's missing in current state
          if (!prev.personalInfo.name && status.name) {
            return {
              ...prev,
              personalInfo: {
                ...prev.personalInfo,
                name: status.name,
              },
            };
          }
          return prev;
        });
      } catch (error) {
        // toast.error("Failed to verify invitation.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, [id, router]);

  const handleNext = async (stepData: Partial<CoachOnboardingData>) => {
    const newData = { ...data, ...stepData };
    setData(newData);

    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - submit data
      await handleSubmit(newData);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (finalData: CoachOnboardingData) => {
    try {
      setIsLoading(true);
      const { submitOnboardingData } = await import("@/services/coachService");

      // Transform data to match API expectation
      const apiData = {
        ...finalData,
        calendarIntegrations: {
          google: { connected: finalData.calendarIntegrations.google },
          outlook: { connected: finalData.calendarIntegrations.outlook },
        },
      };

      if (!coachId) {
        throw new Error(t("onboarding.coach.invitationUnverified"));
      }

      // Submit with the invitation token (id); backend sets auth cookies + returns tokens.
      const response = await submitOnboardingData(id, apiData);

      // Log the coach in immediately (Bearer fallback + refresh cookie) so they
      // aren't bounced to the manual login screen.
      setUser({
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        role: response.user.roleName,
        accessToken: response.token,
        permissions: response.user.permissions,
        isAuthenticated: true,
      });

      toast.success(t("onboarding.toast.completed"));

      // Clear localStorage on successful submission
      localStorage.removeItem(`onboarding_data_${id}`);
      localStorage.removeItem(`onboarding_step_${id}`);

      // Hard navigation avoids races with AuthWrapper's redirect logic.
      const redirect = response.redirectUrl;
      window.location.href =
        redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
    } catch (error) {
      toast.error(t("onboarding.toast.submitFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  const stepInfo = STEPS[currentStep - 1];

  return (
    <OnboardingLayout
      currentStep={currentStep}
      totalSteps={STEPS.length}
      title={stepInfo.title}
      description={stepInfo.description}
    >
      {currentStep === 1 && (
        <PersonalInfoStep
          data={data.personalInfo}
          onNext={(personalInfo) => handleNext({ personalInfo })}
        />
      )}
      {currentStep === 2 && (
        <PricingStep
          data={data.pricing}
          onNext={(pricing) => handleNext({ pricing })}
          onBack={handleBack}
        />
      )}
      {currentStep === 3 && (
        <AvailabilityStep
          data={data.availability}
          onNext={(availability) => handleNext({ availability })}
          onBack={handleBack}
        />
      )}
      {currentStep === 4 && (
        <CalendarSyncStep
          data={data.calendarIntegrations}
          email={email}
          onNext={(calendarIntegrations) =>
            handleNext({ calendarIntegrations })
          }
          onBack={handleBack}
        />
      )}
      {currentStep === 5 && (
        <PasswordStep
          value={data.password || ""}
          onNext={(password) => handleNext({ password })}
          onBack={handleBack}
        />
      )}
    </OnboardingLayout>
  );
}
