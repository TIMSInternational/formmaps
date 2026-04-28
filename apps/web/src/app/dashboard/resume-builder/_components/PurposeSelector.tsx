"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, GraduationCap, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Purpose = "job_application" | "college_application" | "general";

interface PurposeSelectorProps {
  onSelect: (purpose: Purpose) => void;
}

interface PurposeOption {
  id: Purpose;
  title: string;
  description: string;
  icon: LucideIcon;
}

const purposes: PurposeOption[] = [
  {
    id: "job_application",
    title: "Job Application",
    description: "Tailor your resume to a specific job posting",
    icon: Briefcase,
  },
  {
    id: "college_application",
    title: "College Application",
    description: "Build a resume for university admissions",
    icon: GraduationCap,
  },
  {
    id: "general",
    title: "General Purpose",
    description: "Create a versatile resume for any opportunity",
    icon: FileText,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 18 },
  },
};

export function PurposeSelector({ onSelect }: PurposeSelectorProps) {
  const [selected, setSelected] = useState<Purpose | null>(null);

  function handleSelect(purpose: Purpose) {
    setSelected(purpose);
    // Small delay so the user sees the selection highlight
    setTimeout(() => onSelect(purpose), 200);
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-xl font-semibold text-foreground">
          What are you building for?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the purpose of your resume so we can tailor the experience
        </p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {purposes.map((purpose) => {
          const Icon = purpose.icon;
          const isSelected = selected === purpose.id;

          return (
            <motion.button
              key={purpose.id}
              variants={itemVariants}
              onClick={() => handleSelect(purpose.id)}
              className={`dash-card p-6 text-left transition-colors cursor-pointer ${
                isSelected
                  ? "border-foreground"
                  : "hover:border-foreground/30"
              }`}
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                  <Icon className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {purpose.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {purpose.description}
                  </p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
