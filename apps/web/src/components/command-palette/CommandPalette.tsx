"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
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
  Brain,
  Users,
  Fingerprint,
  Heart,
} from "lucide-react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { normalizeRole } from "@/lib/roleUtils";
import { Roles } from "@/lib/permissions";
import { ASSESSMENTS, formatAssessmentList, type AssessmentId } from "@/lib/assessments";
import { OPEN_COMMAND_PALETTE_EVENT, CLOSE_POPOVERS_EVENT } from "./events";
import { paletteFilter } from "./search";
import { usePaletteContent, type ContentGroup } from "./usePaletteContent";

export { OPEN_COMMAND_PALETTE_EVENT } from "./events";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: React.ElementType;
}

// Labels/descriptions are i18n keys under commandPalette.pages.<key>.
// Descriptions are static and neutral (#398): a 0/4 student must not be told
// their "top 10 career matches" exist.
const PAGES: { id: string; key: string; href: string; icon: React.ElementType }[] = [
  { id: "dashboard", key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "assessments", key: "assessments", href: "/dashboard/assessments", icon: FileText },
  { id: "career-paths", key: "careerPaths", href: "/dashboard/career-paths", icon: Briefcase },
  { id: "university", key: "university", href: "/dashboard/university", icon: University },
  { id: "courses", key: "courses", href: "/dashboard/learning/courses", icon: GraduationCap },
  { id: "resumes", key: "resumes", href: "/dashboard/resumes", icon: ClipboardList },
  { id: "portfolio", key: "portfolio", href: "/dashboard/portfolio", icon: FolderOpen },
  { id: "course-plan", key: "coursePlan", href: "/dashboard/course-plan", icon: BookOpen },
  { id: "sessions", key: "sessions", href: "/dashboard/my-sessions", icon: Target },
  { id: "applications", key: "applications", href: "/dashboard/applications", icon: ClipboardList },
  { id: "ai-coach", key: "aiCoach", href: "/dashboard/ai-coach", icon: Sparkles },
];

const INSTRUMENT_ICONS: Record<AssessmentId, React.ElementType> = {
  pca: Sparkles,
  lia: Brain,
  evaluation: Users,
  personality: Fingerprint,
};

const CONTENT_ICONS: Record<ContentGroup, React.ElementType> = {
  applications: ClipboardList,
  careers: Compass,
  courses: GraduationCap,
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useGlobalStore();
  const isStudent = normalizeRole(user?.role) === Roles.STUDENT;
  const language = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";

  const { results, isSearching } = usePaletteContent({
    open,
    query: search,
    userId: user?.id ?? "",
    enabled: isStudent,
    language,
  });

  const openPalette = useCallback(() => {
    // Close every other popover first (notifications, …) so none keeps focus
    // or swallows the keystrokes meant for the search input (#407).
    window.dispatchEvent(new CustomEvent(CLOSE_POPOVERS_EVENT));
    setSearch("");
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette);
    };
  }, [open, openPalette]);

  // autoFocus covers the mount; this also re-asserts focus after the opening
  // animation frame in case another element grabbed it meanwhile.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const runCommand = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const pages = useMemo<CommandItem[]>(
    () =>
      PAGES.map((p) => ({
        id: p.id,
        href: p.href,
        icon: p.icon,
        label: t(`commandPalette.pages.${p.key}.label`),
        description: t(`commandPalette.pages.${p.key}.description`, {
          list: formatAssessmentList(t, i18n.language),
        }),
      })),
    [t, i18n.language],
  );

  const actions = useMemo<CommandItem[]>(
    () => [
      ...ASSESSMENTS.map((a) => ({
        id: `start-${a.id}`,
        href: a.href,
        icon: INSTRUMENT_ICONS[a.id],
        label: t("commandPalette.actions.start", { name: t(`${a.i18nKey}.fullName`) }),
        description: t(`${a.i18nKey}.description`),
      })),
      {
        id: "browse-universities",
        href: "/dashboard/university",
        icon: University,
        label: t("commandPalette.actions.browseUniversities.label"),
        description: t("commandPalette.actions.browseUniversities.description"),
      },
    ],
    [t],
  );

  const contentGroups = (["applications", "careers", "courses"] as const)
    .map((group) => ({ group, items: results.filter((r) => r.group === group) }))
    .filter((g) => g.items.length > 0);

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
              label={t("commandPalette.placeholder")}
              filter={paletteFilter}
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
                  ref={inputRef}
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder={t("commandPalette.placeholder")}
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
                {isSearching && results.length === 0 ? (
                  <Command.Loading>
                    <div className="py-6 text-center text-sm" style={{ color: "var(--admin-font-tertiary, #818181)" }}>
                      {t("commandPalette.searching")}
                    </div>
                  </Command.Loading>
                ) : (
                  <Command.Empty className="py-6 text-center text-sm" style={{ color: "var(--admin-font-tertiary, #818181)" }}>
                    {t("commandPalette.empty")}
                  </Command.Empty>
                )}

                {contentGroups.map(({ group, items }) => (
                  <Command.Group key={group} heading={t(`commandPalette.groups.${group}`)}>
                    {items.map((r) => (
                      <CommandItem
                        key={r.key}
                        value={`${r.key} ${r.label} ${r.description ?? ""}`}
                        item={{
                          id: r.key,
                          label: r.label,
                          description:
                            r.description ??
                            (group === "careers"
                              ? t(r.saved ? "commandPalette.savedCareer" : "commandPalette.matchedCareer")
                              : undefined),
                          href: r.href,
                          icon: group === "careers" && r.saved ? Heart : CONTENT_ICONS[group],
                        }}
                        onSelect={runCommand}
                      />
                    ))}
                  </Command.Group>
                ))}

                <Command.Group heading={t("commandPalette.groups.pages")}>
                  {pages.map((item) => (
                    <CommandItem key={item.id} item={item} onSelect={runCommand} />
                  ))}
                </Command.Group>

                <Command.Separator className="my-1 h-px" style={{ background: "var(--admin-border-default, #2a2a2a)" }} />

                <Command.Group heading={t("commandPalette.groups.actions")}>
                  {actions.map((item) => (
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
  value,
  onSelect,
}: {
  item: CommandItem;
  value?: string;
  onSelect: (href: string) => void;
}) {
  const Icon = item.icon;
  return (
    <Command.Item
      value={value ?? `${item.id} ${item.label} ${item.description ?? ""}`}
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
