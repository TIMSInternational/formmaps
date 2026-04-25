"use client";

import React, { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { CounselorInfoStep, CounselorInfoData } from "@/components/onboarding/counselor/CounselorInfoStep";
import { PasswordStep } from "@/components/onboarding/PasswordStep";
import { toast } from "sonner";
import { CounselorOnboardingPayload } from "@/services/counselorService";

const STEPS = [
  {
    title: "Counselor Information",
    description: "Tell us about yourself to set up your profile.",
  },
  {
    title: "Set Password",
    description: "Secure your account with a password.",
  },
];

export default function CounselorOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ token: string }>;
}) {
  const { token } = use(searchParams);
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<Partial<CounselorOnboardingPayload>>({ token });
  const [schoolName, setSchoolName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Load data from localStorage on mount
  useEffect(() => {
    if (!token) return;
    const savedData = localStorage.getItem(`counselor_onboarding_data_${token}`);
    const savedStep = localStorage.getItem(`counselor_onboarding_step_${token}`);

    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setData((prev) => ({ ...prev, ...parsedData }));
      } catch (e) {
        console.error("Error parsing saved onboarding data", e);
      }
    }

    if (savedStep) {
      setCurrentStep(parseInt(savedStep));
    }
  }, [token]);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (!token) return;
    if (Object.keys(data).length > 1) { // more than just token
      localStorage.setItem(
        `counselor_onboarding_data_${token}`,
        JSON.stringify(data),
      );
    }
  }, [data, token]);

  // Save current step to localStorage
  useEffect(() => {
    if (!token) return;
    localStorage.setItem(
      `counselor_onboarding_step_${token}`,
      currentStep.toString(),
    );
  }, [currentStep, token]);

  // Fetch onboarding status
  useEffect(() => {
    const fetchStatus = async () => {
      if (!token) {
        toast.error("No token provided");
        router.push("/login");
        return;
      }
      try {
        const { verifyCounselorToken } =
          await import("@/services/counselorService");
        const status = await verifyCounselorToken(token);

        if (!status) {
          toast.error("This invitation link is invalid or has expired.");
          router.push("/login");
          return;
        }

        setSchoolName(status.schoolName || "");
        setEmail(status.email);

      } catch (error: any) {
        console.error("Failed to fetch onboarding status:", error);
        toast.error(error.message || "Failed to verify invitation. Please try again.");
        router.push("/login");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, [token, router]);

  const handleNext = async (stepData: Partial<CounselorOnboardingPayload>) => {
    const newData = { ...data, ...stepData };
    setData(newData);

    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - submit data
      await handleSubmit(newData as CounselorOnboardingPayload);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (finalData: CounselorOnboardingPayload) => {
    try {
      setIsLoading(true);
      const { completeCounselorOnboarding } =
        await import("@/services/counselorService");

      const payload = {
        ...finalData,
        token, // make sure token is included
      };

      await completeCounselorOnboarding(payload);

      toast.success("Onboarding completed successfully!");

      // Clear localStorage on successful submission
      localStorage.removeItem(`counselor_onboarding_data_${token}`);
      localStorage.removeItem(`counselor_onboarding_step_${token}`);

      // Redirect to counselor dashboard
      router.push("/counselor");
    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error(error.message || "Failed to submit onboarding data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
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
        <CounselorInfoStep
          data={{
            name: data.name || "",
            phone: data.phone || "",
            timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          }}
          schoolName={schoolName}
          email={email}
          onNext={(infoData) =>
            handleNext({
              name: infoData.name,
              phone: infoData.phone,
              timezone: infoData.timezone,
            })
          }
        />
      )}
      {currentStep === 2 && (
        <PasswordStep
          value={data.password || ""}
          onNext={(password: string) => handleNext({ password })}
          onBack={handleBack}
        />
      )}
    </OnboardingLayout>
  );
}
