import {
  Award,
  Briefcase,
  Heart,
  FolderOpen,
  Trophy,
  Star,
  FileText,
} from "lucide-react";
import type { PortfolioItem, PortfolioItemType, PortfolioItemPayload, StudentActivityCategory } from "@/types/portfolio";

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

type HoursFields = Pick<PortfolioItem, "totalHours" | "hoursPerWeek" | "weeksPerYear">;

/** Hours/Week × Weeks/Year, or undefined when either is missing/zero. */
export function derivedHours({ hoursPerWeek, weeksPerYear }: HoursFields): number | undefined {
  const product = (Number(hoursPerWeek) || 0) * (Number(weeksPerYear) || 0);
  return product > 0 ? product : undefined;
}

/** An item's hours: the typed total, else Hours/Week × Weeks/Year (#403). */
export function effectiveHours(item: HoursFields): number {
  const total = Number(item.totalHours) || 0;
  return total > 0 ? total : derivedHours(item) ?? 0;
}

/** Sum of effectiveHours over Volunteer items. */
export function sumVolunteerHours(items: (HoursFields & { type: PortfolioItemType })[]): number {
  return items.filter((i) => i.type === "volunteer").reduce((sum, i) => sum + effectiveHours(i), 0);
}
