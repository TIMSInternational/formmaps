"use client";
import { useState, useEffect, useRef } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { resumeSteps } from "./resumeData";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { validateAllSteps, getStepStatus } from "./validation";
import { AlertTriangle } from "lucide-react";

// Simple Tooltip Component
function Tooltip({
  children,
  content,
}: {
  children: React.ReactNode;
  content: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 -translate-y-full z-10">
          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
            {content}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StepIndicator() {
  const { resumeBuilder, setResumeStep } = useGlobalStore();
  const currentStep = resumeBuilder.currentStep;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get validation status for all steps
  const validation = validateAllSteps(resumeBuilder.data);

  // Scroll to active tab
  const scrollToActiveTab = () => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const activeTab = container.querySelector(
      `[data-step="${currentStep}"]`
    ) as HTMLElement;

    if (activeTab) {
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();

      // Check if tab is fully visible
      const isTabVisible =
        tabRect.left >= containerRect.left &&
        tabRect.right <= containerRect.right;

      if (!isTabVisible) {
        // Calculate scroll position to center the active tab
        const tabOffsetLeft = activeTab.offsetLeft;
        const tabWidth = activeTab.offsetWidth;
        const containerWidth = container.clientWidth;

        const scrollTo = tabOffsetLeft - containerWidth / 2 + tabWidth / 2;

        container.scrollTo({
          left: Math.max(0, scrollTo),
          behavior: "smooth",
        });
      }
    }
  };

  // Update active tab position when currentStep changes
  useEffect(() => {
    scrollToActiveTab();
  }, [currentStep]);

  return (
    <nav aria-label="Progress" className="mb-4">
      {/* Desktop View with Compact Horizontal Tabs */}
      <div className="hidden lg:block">
        <div className="relative">
          {/* Scrollable Container */}
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto scrollbar-hide"
          >
            <div className="flex items-center space-x-1 min-w-max px-2">
              {resumeSteps.map((step, index) => {
                const isCompleted = step.id < currentStep;
                const isCurrent = step.id === currentStep;
                const isClickable = step.id <= currentStep;
                const stepValidation = validation[step.id];

                return (
                  <motion.div
                    key={step.id}
                    data-step={step.id}
                    className="relative"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Tooltip
                      content={
                        stepValidation.isValid
                          ? step.description
                          : `${
                              step.description
                            }\n\nMissing: ${stepValidation.missingFields.join(
                              ", "
                            )}`
                      }
                    >
                      <motion.button
                        onClick={() => isClickable && setResumeStep(step.id)}
                        disabled={!isClickable}
                        className={cn(
                          "flex items-center space-x-2 px-4 py-3 rounded-lg transition-all duration-300 text-sm font-medium whitespace-nowrap relative overflow-hidden",
                          isClickable
                            ? "cursor-pointer"
                            : "cursor-not-allowed opacity-50",
                          isCurrent
                            ? "bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-200"
                            : isCompleted && stepValidation.isValid
                            ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                            : isCompleted && !stepValidation.isValid
                            ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                            : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                        )}
                        whileHover={isClickable ? { scale: 1.02 } : {}}
                        whileTap={isClickable ? { scale: 0.98 } : {}}
                      >
                        {/* Animated background for current step */}
                        {isCurrent && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                            animate={{ x: ["-100%", "100%"] }}
                            transition={{
                              duration: 3,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                        )}

                        {/* Step Icon */}
                        <div
                          className={cn(
                            "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold relative z-10",
                            isCurrent
                              ? "bg-white/20 text-white"
                              : isCompleted && stepValidation.isValid
                              ? "bg-green-600 text-white"
                              : isCompleted && !stepValidation.isValid
                              ? "bg-amber-500 text-white"
                              : "bg-gray-200 text-gray-500"
                          )}
                        >
                          {isCompleted && stepValidation.isValid ? (
                            <motion.svg
                              className="w-4 h-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 30,
                              }}
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </motion.svg>
                          ) : isCompleted && !stepValidation.isValid ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <span>{step.id}</span>
                          )}
                        </div>

                        {/* Step Title */}
                        <span className="relative z-10 font-medium">
                          {step.title}
                        </span>

                        {/* Validation Status Indicator */}
                        {!stepValidation.isValid &&
                          stepValidation.missingFields.length > 0 && (
                            <div className="w-2 h-2 bg-current rounded-full opacity-60" />
                          )}
                      </motion.button>
                    </Tooltip>

                    {/* Compact Connector */}
                    {index < resumeSteps.length - 1 && (
                      <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1 h-px z-0">
                        <div
                          className={cn(
                            "w-full h-px transition-all duration-500",
                            isCompleted ? "bg-green-400" : "bg-gray-300"
                          )}
                        />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 px-2">
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-600 to-blue-600 rounded-full"
                initial={{ width: 0 }}
                animate={{
                  width: `${(currentStep / resumeSteps.length) * 100}%`,
                }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile & Tablet View - Compact Design */}
      <div className="lg:hidden">
        {/* Current Step Display - More Compact */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              {resumeSteps[currentStep - 1]?.title}
            </h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {currentStep}/{resumeSteps.length}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
            <motion.div
              className="bg-gradient-to-r from-indigo-600 to-blue-600 h-1.5 rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${(currentStep / resumeSteps.length) * 100}%`,
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Compact Horizontal Step Indicators */}
        <div className="overflow-x-auto scrollbar-hide mb-4">
          <div className="flex space-x-2 min-w-max px-1">
            {resumeSteps.map((step, index) => {
              const isCompleted = step.id < currentStep;
              const isCurrent = step.id === currentStep;
              const isClickable = step.id <= currentStep;
              const stepValidation = validation[step.id];

              return (
                <motion.button
                  key={step.id}
                  onClick={() => isClickable && setResumeStep(step.id)}
                  disabled={!isClickable}
                  className={cn(
                    "flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-300 whitespace-nowrap",
                    isClickable
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-50",
                    isCurrent
                      ? "bg-indigo-600 text-white shadow-md"
                      : isCompleted && stepValidation.isValid
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : isCompleted && !stepValidation.isValid
                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                      : "bg-gray-100 text-gray-600 border border-gray-200"
                  )}
                  whileHover={isClickable ? { scale: 1.05 } : {}}
                  whileTap={isClickable ? { scale: 0.95 } : {}}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                      isCurrent
                        ? "bg-white/20 text-white"
                        : isCompleted && stepValidation.isValid
                        ? "bg-green-600 text-white"
                        : isCompleted && !stepValidation.isValid
                        ? "bg-amber-500 text-white"
                        : "bg-white text-gray-500"
                    )}
                  >
                    {isCompleted && stepValidation.isValid ? (
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : isCompleted && !stepValidation.isValid ? (
                      <AlertTriangle className="w-3 h-3" />
                    ) : (
                      step.id
                    )}
                  </div>
                  <span className="hidden sm:inline">{step.title}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Compact Navigation Buttons */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => currentStep > 1 && setResumeStep(currentStep - 1)}
            disabled={currentStep === 1}
            className={cn(
              "flex items-center space-x-1 px-3 py-2 rounded-lg text-xs font-medium transition-all",
              currentStep === 1
                ? "text-gray-400 cursor-not-allowed"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span>Previous</span>
          </button>

          <button
            onClick={() =>
              currentStep < resumeSteps.length && setResumeStep(currentStep + 1)
            }
            disabled={currentStep === resumeSteps.length}
            className={cn(
              "flex items-center space-x-1 px-3 py-2 rounded-lg text-xs font-medium transition-all",
              currentStep === resumeSteps.length
                ? "text-gray-400 cursor-not-allowed"
                : "text-indigo-600 hover:bg-indigo-50"
            )}
          >
            <span>Next</span>
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
