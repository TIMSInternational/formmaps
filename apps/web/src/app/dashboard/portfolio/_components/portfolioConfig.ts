import {
  Award,
  Briefcase,
  Heart,
  FolderOpen,
  Trophy,
  Star,
  FileText,
} from "lucide-react";
import type { PortfolioItemType, PortfolioItemPayload, StudentActivityCategory } from "@/types/portfolio";

// label = i18n key (common namespace); translate at render time
export const typeConfig: Record<
  PortfolioItemType,
  { label: string; icon: typeof Award; color: string; bg: string }
> = {
  extracurricular: {
    label: "studentUi.portfolio.type.extracurricular",
    icon: Star,
    color: "text-purple-600",
    bg: "bg-purple-100",
  },
  award: {
    label: "studentUi.portfolio.type.award",
    icon: Trophy,
    color: "text-amber-600",
    bg: "bg-amber-100",
  },
  project: {
    label: "studentUi.portfolio.type.project",
    icon: FolderOpen,
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  volunteer: {
    label: "studentUi.portfolio.type.volunteer",
    icon: Heart,
    color: "text-rose-600",
    bg: "bg-rose-100",
  },
  work_experience: {
    label: "studentUi.portfolio.type.workExperience",
    icon: Briefcase,
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
  certification: {
    label: "studentUi.portfolio.type.certification",
    icon: FileText,
    color: "text-indigo-600",
    bg: "bg-indigo-100",
  },
};

export const emptyPayload: PortfolioItemPayload = {
  type: "extracurricular",
  title: "",
  organization: "",
  description: "",
  startDate: "",
  isCurrent: false,
  role: "",
  achievements: [],
  activityCategory: "other",
};

// label = i18n key (common namespace); translate at render time
export const activityCategories: { value: StudentActivityCategory; label: string }[] = [
  { value: "academic", label: "studentUi.portfolio.category.academic" },
  { value: "athletic", label: "studentUi.portfolio.category.athletic" },
  { value: "arts", label: "studentUi.portfolio.category.arts" },
  { value: "community_service", label: "studentUi.portfolio.category.communityService" },
  { value: "work", label: "studentUi.portfolio.category.work" },
  { value: "leadership", label: "studentUi.portfolio.category.leadership" },
  { value: "other", label: "studentUi.portfolio.category.other" },
];
