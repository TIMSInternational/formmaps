import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface OnboardingLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
  title: string;
  description: string;
}

export function OnboardingLayout({
  children,
  currentStep,
  totalSteps,
  title,
  description,
}: OnboardingLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      {/* Left Panel - Visual/Brand */}
      <div className="hidden lg:flex lg:w-1/3 bg-black text-white p-12 flex-col justify-between relative shrink-0">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1600880292203-757bb62b4baf?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="relative z-10">
          <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center mb-8">
            <span className="text-black font-bold text-xl" aria-hidden="true">U</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            {t("onboarding.welcomeTitle", "Join our community of world-class coaches.")}
          </h1>
          <p className="text-gray-400 text-lg">
            {t("onboarding.welcomeSubtitle", "Share your expertise, mentor the next generation, and grow your impact.")}
          </p>
        </div>
        <div className="relative z-10">
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div 
                key={i} 
                className="h-1 w-full bg-white/20 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={i <= currentStep ? 100 : 0}
                aria-label={t("onboarding.stepLabel", { step: i, defaultValue: `Step ${i}` })}
              >
                <div 
                  className={cn("h-full bg-white transition-all duration-500", i <= currentStep ? "w-full" : "w-0")}
                />
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-400">
            {t("onboarding.stepProgress", { current: currentStep, total: totalSteps, defaultValue: `Step ${currentStep} of ${totalSteps}` })}
          </p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto overflow-x-hidden bg-gray-50/30 relative">
        {/* Decorative Graphic */}
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-gradient-to-br from-[#2E9098]/20 to-purple-100/40 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>
        
        <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 min-h-min">
          <div className="mx-auto w-full max-w-2xl relative z-10">
            <div className="mb-10">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight">{title}</h2>
              <p className="mt-2 text-lg text-gray-500">{description}</p>
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100"
            >
              {children}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
