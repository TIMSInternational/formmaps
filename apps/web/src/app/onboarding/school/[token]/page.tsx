"use client";

import React, { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { SchoolAdminInfoStep } from "@/components/onboarding/school/SchoolAdminInfoStep";
import { SchoolAdminPasswordStep } from "@/components/onboarding/school/SchoolAdminPasswordStep";
import {
  SchoolAdminOnboardingData,
  INITIAL_SCHOOL_ADMIN_ONBOARDING_DATA,
} from "@/types/school";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { resetClientState } from "@/lib/resetClientState";

export default function SchoolAdminOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { t } = useTranslation();
  const { token } = use(params);
  const router = useRouter();
  const STEPS = [
    {
      title: t("onboarding.school.adminTitle"),
      description: t("onboarding.school.adminDesc"),
    },
    {
      title: t("onboarding.steps.setPasswordTitle"),
      description: t("onboarding.steps.setPasswordDesc"),
    },
  ];
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<SchoolAdminOnboardingData>(
    INITIAL_SCHOOL_ADMIN_ONBOARDING_DATA,
  );
  const [schoolName, setSchoolName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const { setUser } = useGlobalStore();

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(`school_onboarding_data_${token}`);
    const savedStep = localStorage.getItem(`school_onboarding_step_${token}`);

    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        delete parsedData.password;
        setData((prev) => ({ ...prev, ...parsedData }));
      } catch (e) {
      // error handled silently
    }
    }

    if (savedStep) {
      setCurrentStep(Math.min(Math.max(parseInt(savedStep) || 1, 1), 2));
    }
  }, [token]);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (data !== INITIAL_SCHOOL_ADMIN_ONBOARDING_DATA) {
      // The password is never written to localStorage (it used to be, in plain text).
      const { password: _password, ...rest } = data;
      void _password;
      localStorage.setItem(
        `school_onboarding_data_${token}`,
        JSON.stringify(rest),
      );
    }
  }, [data, token]);

  // Save current step to localStorage
  useEffect(() => {
    localStorage.setItem(
      `school_onboarding_step_${token}`,
      currentStep.toString(),
    );
  }, [currentStep, token]);

  // Fetch onboarding status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { getSchoolAdminOnboardingStatus } =
          await import("@/services/schoolService");
        const status = await getSchoolAdminOnboardingStatus(token);

        if (!status.isValid) {
          toast.error(t("onboarding.error.invalidLink"));
          router.push("/login");
          return;
        }

        if (status.status === "completed") {
          toast.info(t("onboarding.school.alreadyCompleted"));
          router.push("/login");
          return;
        }

        setSchoolName(status.schoolName);
        setEmail(status.email);

        // Pre-fill admin name if available
        if (status.adminName) {
          setData((prev) => ({
            ...prev,
            adminInfo: {
              ...prev.adminInfo,
              name: status.adminName || "",
            },
          }));
        }
      } catch (error) {
        toast.error(t("onboarding.toast.verifyFailed"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, [token, router]);

  const handleNext = async (stepData: Partial<SchoolAdminOnboardingData>) => {
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

  const handleSubmit = async (finalData: SchoolAdminOnboardingData) => {
    try {
      setIsLoading(true);
      const { submitSchoolAdminOnboarding } =
        await import("@/services/schoolService");

      const session = await submitSchoolAdminOnboarding(token, finalData);

      // Clear localStorage on successful submission
      localStorage.removeItem(`school_onboarding_data_${token}`);
      localStorage.removeItem(`school_onboarding_step_${token}`);

      // Signed in by the registration response (same hydration as /login).
      resetClientState();
      setUser({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role?.name || "school_admin",
        accessToken: session.token,
        schoolId: session.user.schoolId || null,
        avatar: null,
        permissions: session.user.permissions || [],
        isAuthenticated: true,
      });
      toast.success(t("onboarding.toast.completed"));
      window.location.href = "/school-admin";
    } catch (error) {
      // A token that expired or was already used while the page was open.
      const message = (error as Error)?.message || "";
      toast.error(/invitation token/i.test(message) ? t("onboarding.error.invalidLink") : t("onboarding.toast.submitFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">{t("onboarding.loading")}</p>
        </div>
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
        <SchoolAdminInfoStep
          data={data.adminInfo}
          schoolName={schoolName}
          email={email}
          onNext={(adminInfo: SchoolAdminOnboardingData["adminInfo"]) =>
            handleNext({ adminInfo })
          }
        />
      )}
      {currentStep === 2 && (
        <SchoolAdminPasswordStep
          value={data.password}
          onNext={(password: string) => handleNext({ password })}
          onBack={handleBack}
        />
      )}
    </OnboardingLayout>
  );
}
