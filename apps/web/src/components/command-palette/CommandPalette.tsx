"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { useIsIndependentStudent } from "@/hooks/useIsIndependentStudent";
import { isSchoolOnlyRoute } from "@/lib/independentStudent";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  GraduationCap,
  BookOpen,
  Target,
  ClipboardList,
  FolderOpen,
  Search,
  ArrowRight,
  University,
  Compass,
  Sparkles,
} from "lucide-react";

interface CommandItem {
  id: string;
  /** i18n key (common namespace) for the visible label */
  labelKey: string;
  /** i18n key (common namespace) for the visible description */
  descriptionKey?: string;
  href: string;
  icon: React.ElementType;
  group: string;
}

const PAGES: CommandItem[] = [
  { id: "dashboard", labelKey: "nav.dashboard", descriptionKey: "components.commandPalette.items.dashboard.description", href: "/dashboard", icon: LayoutDashboard, group: "Pages" },
  { id: "assessments", labelKey: "nav.assessments", descriptionKey: "components.commandPalette.items.assessments.description", href: "/dashboard/assessments", icon: FileText, group: "Pages" },
  { id: "career-paths", labelKey: "career.explorer.title", descriptionKey: "components.commandPalette.items.careerPaths.description", href: "/dashboard/career-paths", icon: Briefcase, group: "Pages" },
  { id: "university", labelKey: "components.commandPalette.items.university.label", descriptionKey: "components.commandPalette.items.university.description", href: "/dashboard/university", icon: University, group: "Pages" },
  { id: "courses", labelKey: "nav.courses", descriptionKey: "components.commandPalette.items.courses.description", href: "/dashboard/learning/courses", icon: GraduationCap, group: "Pages" },
  { id: "resumes", labelKey: "nav.resume", descriptionKey: "components.commandPalette.items.resumes.description", href: "/dashboard/resumes", icon: ClipboardList, group: "Pages" },
  { id: "portfolio", labelKey: "dashboard.portfolio", descriptionKey: "components.commandPalette.items.portfolio.description", href: "/dashboard/portfolio", icon: FolderOpen, group: "Pages" },
  { id: "course-plan", labelKey: "dashboard.coursePlan", descriptionKey: "components.commandPalette.items.coursePlan.description", href: "/dashboard/course-plan", icon: BookOpen, group: "Pages" },
  { id: "sessions", labelKey: "nav.mySessions", descriptionKey: "components.commandPalette.items.sessions.description", href: "/dashboard/my-sessions", icon: Target, group: "Pages" },
  { id: "applications", labelKey: "nav.applications", descriptionKey: "components.commandPalette.items.applications.description", href: "/dashboard/applications", icon: ClipboardList, group: "Pages" },
  { id: "ai-coach", labelKey: "components.commandPalette.items.aiCoach.label", descriptionKey: "components.commandPalette.items.aiCoach.description", href: "/dashboard/ai-coach", icon: Sparkles, group: "Pages" },
];

const ACTIONS: CommandItem[] = [
  { id: "start-pca", labelKey: "components.commandPalette.items.startPca.label", descriptionKey: "components.commandPalette.items.startPca.description", href: "/dashboard/assessments/pca", icon: Sparkles, group: "Actions" },
  { id: "start-mil", labelKey: "components.commandPalette.items.startMil.label", descriptionKey: "components.commandPalette.items.startMil.description", href: "/dashboard/assessments/lia", icon: Compass, group: "Actions" },
  { id: "browse-universities", labelKey: "components.commandPalette.items.browseUniversities.label", descriptionKey: "components.commandPalette.items.browseUniversities.description", href: "/dashboard/university", icon: University, group: "Actions" },
];

/** Dispatched on window to open the palette (e.g. by the top-bar search button). */
export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  // Never offer a school-only page to a student with no school (#399).
  const isIndependentStudent = useIsIndependentStudent();
  const visible = (items: CommandItem[]) =>
    isIndependentStudent ? items.filter((item) => !isSchoolOnlyRoute(item.href)) : items;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  const runCommand = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-[20%] z-50 w-[90vw] max-w-[520px] -translate-x-1/2"
          >
            <Command
              className="rounded-xl overflow-hidden"
              style={{
                background: "var(--admin-bg-card, #1e1e1e)",
                border: "1px solid var(--admin-border-default, #2a2a2a)",
                boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
              }}
            >
              <div className="flex items-center gap-2 px-4" style={{ borderBottom: "1px solid var(--admin-border-default, #2a2a2a)" }}>
                <Search className="h-4 w-4 shrink-0" style={{ color: "var(--admin-font-tertiary, #818181)" }} />
                <Command.Input
                  placeholder={t("components.commandPalette.searchPlaceholder")}
                  className="flex h-11 w-full bg-transparent py-3 text-sm outline-none"
                  style={{ color: "var(--admin-font-primary, #ebebeb)" }}
                />
                <kbd
                  className="hidden sm:inline-flex h-5 items-center rounded px-1.5 text-[10px] font-medium shrink-0"
                  style={{
                    background: "var(--admin-bg-hover, rgba(255,255,255,0.06))",
                    color: "var(--admin-font-tertiary, #818181)",
                    border: "1px solid var(--admin-border-default, #2a2a2a)",
                  }}
                >
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-[300px] overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm" style={{ color: "var(--admin-font-tertiary, #818181)" }}>
                  {t("components.commandPalette.noResults")}
                </Command.Empty>

                <Command.Group heading={t("components.commandPalette.groups.pages")}>
                  {visible(PAGES).map((item) => (
                    <CommandItem key={item.id} item={item} onSelect={runCommand} />
                  ))}
                </Command.Group>

                <Command.Separator className="my-1 h-px" style={{ background: "var(--admin-border-default, #2a2a2a)" }} />

                <Command.Group heading={t("components.commandPalette.groups.actions")}>
                  {visible(ACTIONS).map((item) => (
                    <CommandItem key={item.id} item={item} onSelect={runCommand} />
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function CommandItem({
  item,
  onSelect,
}: {
  item: CommandItem;
  onSelect: (href: string) => void;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const description = item.descriptionKey ? t(item.descriptionKey) : undefined;
  return (
    <Command.Item
      value={`${label} ${description ?? ""}`}
      onSelect={() => onSelect(item.href)}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors"
      style={{ color: "var(--admin-font-secondary, #b3b3b3)" }}
      data-cmdk-item=""
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
        style={{
          background: "var(--admin-bg-icon-box, var(--admin-bg-hover, rgba(255,255,255,0.06)))",
          border: "1px solid var(--admin-border-default, #2a2a2a)",
        }}
      >
        <Icon className="h-4 w-4" style={{ color: "var(--admin-font-tertiary, #818181)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium" style={{ color: "var(--admin-font-primary, #ebebeb)" }}>
          {label}
        </div>
        {description && (
          <div className="text-xs truncate" style={{ color: "var(--admin-font-tertiary, #818181)" }}>
            {description}
          </div>
        )}
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-data-[selected]:opacity-100" style={{ color: "var(--admin-font-tertiary)" }} />
    </Command.Item>
  );
}
