"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useAdminTheme } from "@/contexts/AdminThemeContext";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  FileText,
  Settings,
  Building2,
  UserCog,
  CalendarDays,
  BookOpen,
  Library,
  GitBranch,
  ClipboardCheck,
  Plug,
  TrendingDown,
  Bell,
  Radar,
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";

type ThemeMode = "dark" | "light" | "system";

const NAV_SECTIONS = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/school-admin", icon: LayoutDashboard },
      { label: "Students", href: "/school-admin/students", icon: Users },
      { label: "Analytics", href: "/school-admin/analytics", icon: BarChart3 },
      { label: "Results", href: "/school-admin/results", icon: FileText },
    ],
  },
  {
    label: "School Setup",
    items: [
      { label: "School Profile", href: "/school-admin/profile", icon: Building2 },
      { label: "Users & Roles", href: "/school-admin/users", icon: UserCog },
      { label: "Calendar", href: "/school-admin/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Academics",
    items: [
      { label: "Curriculum", href: "/school-admin/curriculum", icon: BookOpen },
      { label: "Courses", href: "/school-admin/courses", icon: Library },
      { label: "Sequences", href: "/school-admin/course-sequences", icon: GitBranch },
    ],
  },
  {
    label: "Data & Assessment",
    items: [
      { label: "Assessments", href: "/school-admin/assessments", icon: ClipboardCheck },
      { label: "Integrations", href: "/school-admin/integrations", icon: Plug },
    ],
  },
  {
    label: "Counselor",
    items: [
      { label: "Academic Gaps", href: "/school-admin/academic-gaps", icon: TrendingDown },
      { label: "360° Evaluations", href: "/school-admin/evaluations", icon: Radar },
      { label: "Alerts", href: "/school-admin/alerts", icon: Bell },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", href: "/school-admin/settings", icon: Settings },
    ],
  },
];

function NavItem({ href, icon: Icon, label, active, collapsed, colors }: {
  href: string; icon: React.ElementType; label: string; active: boolean; collapsed?: boolean;
  colors: { fontPrimary: string; fontSecondary: string; fontTertiary: string; hoverBg: string; activeBg: string };
}) {
  return (
    <Link href={href} title={collapsed ? label : undefined}
      style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: collapsed ? 0 : 8, height: 28,
        padding: collapsed ? "0 4px" : "0 8px", borderRadius: 4,
        fontSize: 13, color: active ? colors.fontPrimary : colors.fontSecondary,
        background: active ? colors.activeBg : "transparent",
        textDecoration: "none", transition: "background 0.1s ease", cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = colors.hoverBg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon style={{ width: 16, height: 16, color: active ? colors.fontPrimary : colors.fontTertiary, flexShrink: 0 }} />
      {!collapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
    </Link>
  );
}

export function SchoolAdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useGlobalStore();
  const { mode, isDark, setMode, colors: themeColors } = useAdminTheme();

  const [collapsed, setCollapsed] = useState(false);
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

  const changeTheme = (newMode: ThemeMode) => {
    setMode(newMode);
    setThemeSubmenu(false);
    setDropdownOpen(false);
  };

  const themeLabel = mode === "dark" ? "Dark" : mode === "light" ? "Light" : "System";

  const isActive = (href: string) => {
    if (href === "/school-admin") return pathname === href;
    return pathname?.startsWith(href) ?? false;
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
            background: "linear-gradient(135deg, #0d9488, #06b6d4)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>S</div>
          {!collapsed && <>
            <span>School Admin</span>
            <ChevronDown style={{ width: 12, height: 12, color: C.fontLight }} />
          </>}
        </button>

        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
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
          </div>
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
              borderRadius: 8, padding: 0, zIndex: 100,
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
                    <Link href="/school-admin/settings" onClick={() => setDropdownOpen(false)} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "8px 10px", borderRadius: 4,
                      color: C.fontSecondary, fontSize: 13,
                      textDecoration: "none", transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <Settings style={{ width: 16, height: 16, color: C.fontTertiary, flexShrink: 0 }} />
                      <span>Settings</span>
                    </Link>
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
                    ]).map((t) => (
                      <button key={t.mode} onClick={() => changeTheme(t.mode)} style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%",
                        padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent",
                        color: mode === t.mode ? C.fontPrimary : C.fontSecondary,
                        fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                        transition: "background 0.1s", textAlign: "left",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <t.icon style={{ width: 16, height: 16, color: mode === t.mode ? C.fontPrimary : C.fontTertiary, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{t.label}</span>
                        {mode === t.mode && <span style={{ color: C.fontTertiary, fontSize: 14 }}>✓</span>}
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
              {section.items.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} colors={C} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign Out — bottom */}
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
