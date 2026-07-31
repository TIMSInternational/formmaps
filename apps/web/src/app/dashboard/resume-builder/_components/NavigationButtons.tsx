"use client";
import { useGlobalStore } from "@/store/useGlobalStore";
import { resumeSteps } from "./resumeData";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { validateAllSteps } from "./validation";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { telemetry } from "@/services/telemetryService";

export function NavigationButtons() {
  const { resumeBuilder, setResumeStep } = useGlobalStore();
  const currentStep = resumeBuilder.currentStep;
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === resumeSteps.length;

  // Get validation for current step
  const validation = validateAllSteps(resumeBuilder.data);
  const currentStepValidation = validation[currentStep];
  const hasWarnings =
    !currentStepValidation.isValid &&
    currentStepValidation.missingFields.length > 0;

  const handlePrevious = () => {
    if (!isFirstStep) {
      setResumeStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      // Track step completion before moving to next
      const stepName = resumeSteps[currentStep - 1]?.title || `Step ${currentStep}`;
      telemetry.trackResumeStep(currentStep, stepName);
      setResumeStep(currentStep + 1);
    }
  };

  const isNextDisabled = () => {
    const { data } = resumeBuilder;

    switch (currentStep) {
      case 1: // Career Field - Require selection
        return !data.careerField;
      case 2: // Template Selection - Require template
        return !data.template;
      case 3: // Personal Info - Only require name and email
        return !data.personalInfo.fullName || !data.personalInfo.email;
      case 4: // Experience - Optional for freshers
        return false; // Allow skipping experience
      case 5: // Education - Require at least one
        return data.education.length === 0;
      case 6: // Skills - Require at least one
        return data.skills.length === 0;
      default:
        return false;
    }
  };

  return (
    <div className="space-y-4 pt-6 border-t  mt-10 border-gray-200 ">
      {/* Validation Warning */}
      {hasWarnings && (
        <div className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-amber-800 font-medium">Missing information:</p>
            <p className="text-amber-700">
              {currentStepValidation.missingFields.join(", ")}
            </p>
            <p className="text-amber-600 text-xs mt-1">
              You can continue and come back to complete this later.
            </p>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between ">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={isFirstStep}
          className={cn(
            "flex items-center space-x-2 transition-all duration-200",
            isFirstStep && "opacity-50 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </Button>

        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">
            Step {currentStep} of {resumeSteps.length}
          </span>
          <div className="flex space-x-1">
            {resumeSteps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  index + 1 === currentStep
                    ? "bg-indigo-600"
                    : index + 1 < currentStep
                    ? "bg-green-500"
                    : "bg-gray-300"
                )}
              />
            ))}
          </div>
        </div>

        <Button
          onClick={handleNext}
          disabled={isLastStep || isNextDisabled()}
          className={cn(
            "flex items-center space-x-2 transition-all duration-200",
            (isLastStep || isNextDisabled()) && "opacity-50 cursor-not-allowed"
          )}
        >
          <span>{isLastStep ? "Complete" : "Next"}</span>
          {!isLastStep && <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
