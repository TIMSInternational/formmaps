"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "motion/react";
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
  label: string;
  description?: string;
  href: string;
  icon: React.ElementType;
  group: string;
}

const PAGES: CommandItem[] = [
  { id: "dashboard", label: "Dashboard", description: "Overview & career matches", href: "/dashboard", icon: LayoutDashboard, group: "Pages" },
  { id: "assessments", label: "Assessments", description: "PCA, MIL & evaluation", href: "/dashboard/assessments", icon: FileText, group: "Pages" },
  { id: "career-paths", label: "Career Explorer", description: "Top 10 career matches", href: "/dashboard/career-paths", icon: Briefcase, group: "Pages" },
  { id: "university", label: "University Finder", description: "Personalized recommendations", href: "/dashboard/university", icon: University, group: "Pages" },
  { id: "courses", label: "Courses", description: "Browse & enroll in courses", href: "/dashboard/learning/courses", icon: GraduationCap, group: "Pages" },
  { id: "resumes", label: "Resume Builder", description: "Create & manage resumes", href: "/dashboard/resumes", icon: ClipboardList, group: "Pages" },
  { id: "portfolio", label: "Portfolio", description: "Showcase your work", href: "/dashboard/portfolio", icon: FolderOpen, group: "Pages" },
  { id: "course-plan", label: "Course Plan", description: "Plan your curriculum", href: "/dashboard/course-plan", icon: BookOpen, group: "Pages" },
  { id: "sessions", label: "My Sessions", description: "Counseling & coaching", href: "/dashboard/my-sessions", icon: Target, group: "Pages" },
  { id: "applications", label: "Applications", description: "Track university applications", href: "/dashboard/applications", icon: ClipboardList, group: "Pages" },
  { id: "ai-coach", label: "AI Coach", description: "Career guidance assistant", href: "/dashboard/ai-coach", icon: Sparkles, group: "Pages" },
];

const ACTIONS: CommandItem[] = [
  { id: "start-pca", label: "Start PCA Assessment", description: "Personality assessment", href: "/dashboard/assessments/pca", icon: Sparkles, group: "Actions" },
  { id: "start-mil", label: "Start MIL Assessment", description: "Cognitive assessment", href: "/dashboard/assessments/mil", icon: Compass, group: "Actions" },
  { id: "browse-universities", label: "Browse Universities", description: "Find your match", href: "/dashboard/university", icon: University, group: "Actions" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
                  placeholder="Search pages, actions..."
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
                  No results found.
                </Command.Empty>

                <Command.Group heading="Pages">
                  {PAGES.map((item) => (
                    <CommandItem key={item.id} item={item} onSelect={runCommand} />
                  ))}
                </Command.Group>

                <Command.Separator className="my-1 h-px" style={{ background: "var(--admin-border-default, #2a2a2a)" }} />

                <Command.Group heading="Actions">
                  {ACTIONS.map((item) => (
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
  const Icon = item.icon;
  return (
    <Command.Item
      value={`${item.label} ${item.description ?? ""}`}
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
          {item.label}
        </div>
        {item.description && (
          <div className="text-xs truncate" style={{ color: "var(--admin-font-tertiary, #818181)" }}>
            {item.description}
          </div>
        )}
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-data-[selected]:opacity-100" style={{ color: "var(--admin-font-tertiary)" }} />
    </Command.Item>
  );
}
