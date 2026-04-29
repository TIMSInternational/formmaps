"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useAdminTheme } from "@/contexts/AdminThemeContext";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  GraduationCap,
  BookOpen,
  Target,
  CreditCard,
  Calendar,
  BarChart2,
  Settings,
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Monitor,
  FolderOpen,
  ClipboardList,
  University,
} from "lucide-react";

type ThemeMode = "dark" | "light" | "system";

interface NavSubItem {
  label: string;
  href: string;
}

interface NavSection {
  label: string;
  items: {
    label: string;
    href: string;
    icon: React.ElementType;
    sub?: NavSubItem[];
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Main",
    items: [
      { label: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Explore",
    items: [
      {
        label: "dashboard.assessments", href: "/dashboard/assessments", icon: FileText,
        sub: [
          { label: "common.overview", href: "/dashboard/assessments" },
          { label: "dashboard.pcaAssessment", href: "/dashboard/assessments/pca" },
          { label: "dashboard.liaAssessment", href: "/dashboard/assessments/mil" },
          { label: "dashboard.evaluationTitle", href: "/dashboard/assessments/evaluation" },
          { label: "dashboard.timeline", href: "/dashboard/timeline" },
        ],
      },
      {
        label: "nav.careerEducation", href: "#", icon: Briefcase,
        sub: [
          { label: "dashboard.careerPathsExplorer", href: "/dashboard/career-paths" },
          { label: "dashboard.universitySuggestions", href: "/dashboard/university" },
        ],
      },
      {
        label: "nav.learning", href: "/dashboard/learning", icon: GraduationCap,
        sub: [
          { label: "dashboard.courses", href: "/dashboard/learning/courses" },
          { label: "dashboard.certifications", href: "/dashboard/learning/certifications" },
          { label: "dashboard.progress", href: "/dashboard/progress" },
        ],
      },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "dashboard.resumeBuilder", href: "/dashboard/resumes", icon: ClipboardList },
      { label: "dashboard.portfolio", href: "/dashboard/portfolio", icon: FolderOpen },
      { label: "dashboard.coursePlan", href: "/dashboard/course-plan", icon: BookOpen },
    ],
  },
  {
    label: "Sessions",
    items: [
      {
        label: "Counseling & Coaching", href: "/dashboard/my-sessions", icon: Target,
        sub: [
          { label: "My Sessions", href: "/dashboard/my-sessions" },
          { label: "Book Counselor", href: "/dashboard/book-counselor" },
          { label: "Find Coach", href: "/dashboard/book-coach" },
        ],
      },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "dashboard.subscriptions", href: "/dashboard/subscriptions", icon: CreditCard },
    ],
  },
];

function NavItem({ href, icon: Icon, label, active, collapsed, colors, hasSub, expanded, onToggle }: {
  href: string; icon: React.ElementType; label: string; active: boolean; collapsed?: boolean;
  colors: { fontPrimary: string; fontSecondary: string; fontTertiary: string; hoverBg: string; activeBg: string };
  hasSub?: boolean; expanded?: boolean; onToggle?: () => void;
}) {
  const handleClick = (e: React.MouseEvent) => {
    if (hasSub && onToggle) {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <Link href={hasSub ? "#" : href} title={collapsed ? label : undefined}
      onClick={handleClick}
      style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: collapsed ? 0 : 8, height: 28,
        padding: collapsed ? "0 4px" : "0 8px", borderRadius: 4,
        fontSize: 13, color: active ? colors.fontPrimary : colors.fontSecondary,
        background: active && !hasSub ? colors.activeBg : "transparent",
        textDecoration: "none", transition: "background 0.1s ease", cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!(active && !hasSub)) e.currentTarget.style.background = colors.hoverBg; }}
      onMouseLeave={(e) => { if (!(active && !hasSub)) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon style={{ width: 16, height: 16, color: active ? colors.fontPrimary : colors.fontTertiary, flexShrink: 0 }} />
      {!collapsed && <>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {hasSub && <ChevronDown style={{
          width: 12, height: 12, color: colors.fontTertiary,
          transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.15s",
        }} />}
      </>}
    </Link>
  );
}

export function StudentSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useGlobalStore();
  const { t } = useTranslation();
  const { mode, setMode, colors: themeColors } = useAdminTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<string[]>(["dashboard.assessments"]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [themeSubmenu, setThemeSubmenu] = useState(false);

  const C = {
    fontPrimary: themeColors.font.primary,
    fontSecondary: themeColors.font.secondary,
    fontTertiary: themeColors.font.tertiary,
    fontLight: themeColors.font.sectionLabel,
    hoverBg: themeColors.bg.hover,
    activeBg: themeColors.bg.active,
  };

  const toggleExpand = (label: string) => {
    setExpanded(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  };

  const changeTheme = (newMode: ThemeMode) => {
    setMode(newMode);
    setThemeSubmenu(false);
    setDropdownOpen(false);
  };

  const themeLabel = mode === "dark" ? "Dark" : mode === "light" ? "Light" : "System";

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    if (href === "#") return false;
    return pathname?.startsWith(href) ?? false;
  };

  const isSubActive = (subs: NavSubItem[]) => subs.some(s => pathname?.startsWith(s.href));

  const resolveLabel = (key: string) => {
    const translated = t(key);
    return translated === key ? key : translated;
  };

  const COLLAPSED_W = 52;
  const EXPANDED_W = 220;

  return (
    <aside style={{
      width: collapsed ? COLLAPSED_W : EXPANDED_W,
      height: "100%", display: "flex", flexDirection: "column", flexShrink: 0,
      background: "transparent",
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      fontSize: 13, userSelect: "none", overflow: "hidden",
      transition: "width 0.2s ease", position: "relative",
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: collapsed ? "10px 6px 6px 6px" : "10px 8px 6px 12px",
        gap: 4, position: "relative",
      }}>
        <button
          onClick={() => {
            if (collapsed) { setCollapsed(false); return; }
            setThemeSubmenu(false);
            setDropdownOpen(!dropdownOpen);
          }}
          style={{
            display: "flex", alignItems: "center",
            gap: 8, flex: collapsed ? "none" : 1,
            padding: 0, border: "none", background: "transparent",
            cursor: "pointer", color: C.fontPrimary,
            fontSize: 13, fontWeight: 500, fontFamily: "inherit",
          }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: "linear-gradient(135deg, #8b5a6b, #4a3040)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>N</div>
          {!collapsed && <>
            <span>Nexa Univ</span>
            <ChevronDown style={{ width: 12, height: 12, color: C.fontLight }} />
          </>}
        </button>

        {!collapsed && (
          <button onClick={() => setCollapsed(true)} title="Collapse sidebar" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 4,
            color: C.fontTertiary, border: "none", background: "transparent",
            cursor: "pointer", transition: "background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <PanelLeftClose style={{ width: 16, height: 16 }} />
          </button>
        )}

        {collapsed && (
          <button onClick={() => setCollapsed(false)} title="Expand sidebar" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 4, marginTop: 4,
            color: C.fontTertiary, border: "none", background: "transparent",
            cursor: "pointer", transition: "background 0.1s", position: "absolute",
            bottom: -32, left: "50%", transform: "translateX(-50%)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <PanelLeftOpen style={{ width: 16, height: 16 }} />
          </button>
        )}

        {/* Dropdown */}
        {dropdownOpen && !collapsed && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }}
              onClick={() => { setDropdownOpen(false); setThemeSubmenu(false); }} />
            <div style={{
              position: "absolute", top: 44, left: 8, width: 200,
              background: themeColors.bg.overlay,
              backdropFilter: "blur(12px) saturate(200%) contrast(100%) brightness(130%)",
              WebkitBackdropFilter: "blur(12px) saturate(200%) contrast(100%) brightness(130%)",
              border: `1px solid ${themeColors.border.light}`,
              borderRadius: 8, zIndex: 100,
              boxShadow: "2px 4px 16px 0px rgba(0,0,0,0.16), 0px 2px 4px 0px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}>
              <div style={{ padding: "4px 4px" }}>
                {!themeSubmenu ? (
                  <>
                    <button onClick={() => setThemeSubmenu(true)} style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent",
                      color: C.fontSecondary, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                      transition: "background 0.1s", textAlign: "left",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <Moon style={{ width: 16, height: 16, color: C.fontTertiary, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>Theme · {themeLabel}</span>
                      <ChevronRight style={{ width: 12, height: 12, color: C.fontLight }} />
                    </button>
                    <button onClick={() => { logout(); router.push("/login"); setDropdownOpen(false); }} style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent",
                      color: C.fontSecondary, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                      transition: "background 0.1s", textAlign: "left",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <LogOut style={{ width: 16, height: 16, color: C.fontTertiary, flexShrink: 0 }} />
                      <span>Sign Out</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setThemeSubmenu(false)} style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent",
                      color: C.fontSecondary, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                      transition: "background 0.1s", textAlign: "left", fontWeight: 500,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <ChevronDown style={{ width: 12, height: 12, transform: "rotate(90deg)", color: C.fontLight }} />
                      <span>Theme</span>
                    </button>
                    <div style={{ height: 1, background: themeColors.border.hover, margin: "2px 6px" }} />
                    {([
                      { mode: "light" as ThemeMode, label: "Light", icon: Sun },
                      { mode: "dark" as ThemeMode, label: "Dark", icon: Moon },
                      { mode: "system" as ThemeMode, label: "System", icon: Monitor },
                    ]).map((tm) => (
                      <button key={tm.mode} onClick={() => changeTheme(tm.mode)} style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%",
                        padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent",
                        color: mode === tm.mode ? C.fontPrimary : C.fontSecondary,
                        fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                        transition: "background 0.1s", textAlign: "left",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <tm.icon style={{ width: 16, height: 16, color: mode === tm.mode ? C.fontPrimary : C.fontTertiary, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{tm.label}</span>
                        {mode === tm.mode && <span style={{ color: C.fontTertiary, fontSize: 14 }}>✓</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", padding: collapsed ? "4px 6px 8px 6px" : "4px 8px 8px 8px" }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 8 }}>
            {!collapsed && <div style={{
              padding: "8px 8px 6px 8px", fontSize: 10, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.06em", color: C.fontLight,
            }}>{section.label}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {section.items.map((item) => {
                const hasSub = !!item.sub?.length;
                const itemActive = isActive(item.href) || (hasSub && item.sub ? isSubActive(item.sub) : false);
                const isExpanded = expanded.includes(item.label);
                return (
                  <div key={item.label}>
                    <NavItem
                      href={item.href}
                      icon={item.icon}
                      label={resolveLabel(item.label)}
                      active={itemActive}
                      collapsed={collapsed}
                      colors={C}
                      hasSub={hasSub}
                      expanded={isExpanded}
                      onToggle={() => toggleExpand(item.label)}
                    />
                    {hasSub && isExpanded && !collapsed && (
                      <div style={{ paddingLeft: 24, display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                        {item.sub!.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            style={{
                              display: "block", padding: "4px 8px", borderRadius: 4,
                              fontSize: 12, textDecoration: "none",
                              color: isActive(sub.href) ? C.fontPrimary : C.fontTertiary,
                              background: isActive(sub.href) ? C.activeBg : "transparent",
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={(e) => { if (!isActive(sub.href)) e.currentTarget.style.background = C.hoverBg; }}
                            onMouseLeave={(e) => { if (!isActive(sub.href)) e.currentTarget.style.background = "transparent"; }}
                          >
                            {resolveLabel(sub.label)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign Out */}
      <div style={{ padding: collapsed ? "8px 6px" : "8px 8px", borderTop: `1px solid ${themeColors.border.light}` }}>
        <button
          onClick={() => { logout(); router.push("/login"); }}
          title={collapsed ? "Sign Out" : undefined}
          style={{
            display: "flex", alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: collapsed ? 0 : 8, height: 28, width: "100%",
            padding: collapsed ? "0 4px" : "0 8px", borderRadius: 4,
            fontSize: 13, color: C.fontSecondary,
            background: "transparent", border: "none",
            cursor: "pointer", fontFamily: "inherit",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <LogOut style={{ width: 16, height: 16, color: C.fontTertiary, flexShrink: 0 }} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
