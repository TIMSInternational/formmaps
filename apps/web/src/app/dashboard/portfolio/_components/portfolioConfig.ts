import {
  Award,
  Briefcase,
  Heart,
  FolderOpen,
  Trophy,
  Star,
  FileText,
} from "lucide-react";
import type { PortfolioItemType, PortfolioItemPayload } from "@/types/portfolio";

export const typeConfig: Record<
  PortfolioItemType,
  { label: string; icon: typeof Award; color: string; bg: string }
> = {
  extracurricular: {
    label: "Extracurricular",
    icon: Star,
    color: "text-purple-600",
    bg: "bg-purple-100",
  },
  award: {
    label: "Award",
    icon: Trophy,
    color: "text-amber-600",
    bg: "bg-amber-100",
  },
  project: {
    label: "Project",
    icon: FolderOpen,
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  volunteer: {
    label: "Volunteer",
    icon: Heart,
    color: "text-rose-600",
    bg: "bg-rose-100",
  },
  work_experience: {
    label: "Work Experience",
    icon: Briefcase,
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
  certification: {
    label: "Certification",
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
};
