"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useAdminTheme } from "@/contexts/AdminThemeContext";
import { useChat } from "@/components/ai-chat/ChatContext";
import { useSidePanel } from "@/components/side-panel/SidePanel";
import { AIChatSidePanel } from "@/components/ai-chat/AIChatPanel";
import { groupThreadsByDate, formatThreadTime } from "@/components/ai-chat/useChatThreads";
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
  GraduationCap,
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
  Home,
  MessageCircle,
  MessageCirclePlus,
  Upload,
  Video,
} from "lucide-react";

type ThemeMode = "dark" | "light" | "system";

const getNavSections = (t: (key: string, fallback: string) => string) => [
  {
    label: t("nav.main", "Main"),
    items: [
      { label: t("schoolAdmin.nav.dashboard", "Dashboard"), href: "/school-admin", icon: LayoutDashboard },
      { label: t("schoolAdmin.nav.students", "Users"), href: "/school-admin/users", icon: Users },
      { label: "Parents", href: "/school-admin/parents", icon: UserCog },
      { label: t("schoolAdmin.nav.academics", "Academics"), href: "/school-admin/academics", icon: BookOpen },
      { label: t("schoolAdmin.nav.grades", "Grades & Progress"), href: "/school-admin/grades", icon: GraduationCap },
      { label: t("schoolAdmin.nav.assessments", "Assessment Hub"), href: "/school-admin/assessments", icon: ClipboardCheck },
      { label: t("schoolAdmin.nav.analytics", "Analytics"), href: "/school-admin/analytics", icon: BarChart3 },
      { label: t("schoolAdmin.nav.insights", "AI Insights"), href: "/school-admin/insights", icon: Radar },
      { label: t("schoolAdmin.nav.reports", "Reports"), href: "/school-admin/reports", icon: FileText },
      { label: "Calendar", href: "/school-admin/calendar", icon: CalendarDays },
      { label: "Counselor Workload", href: "/school-admin/counselor-workload", icon: Users },
    ],
  },
  {
    label: t("schoolAdmin.nav.communication", "Communication"),
    items: [
      { label: t("schoolAdmin.nav.communications", "Communications"), href: "/school-admin/messages", icon: MessageCircle },
      { label: t("schoolAdmin.nav.videoCalls", "Video Calls"), href: "/school-admin/video", icon: Video },
      { label: t("schoolAdmin.nav.sessionNotes", "Session Notes"), href: "/school-admin/notes", icon: FileText },
      { label: t("schoolAdmin.nav.recommendations", "Recommendations"), href: "/school-admin/recommendations", icon: FileText },
    ],
  },
  {
    label: t("schoolAdmin.nav.system", "System"),
    items: [
      { label: "Integrations", href: "/school-admin/integrations", icon: Plug },
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
        fontSize: 13, color: active ? "#fff" : colors.fontSecondary,
        background: active ? "#065292" : "transparent",
        textDecoration: "none", transition: "background 0.1s ease", cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = colors.hoverBg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon style={{ width: 16, height: 16, color: active ? "#fff" : colors.fontTertiary, flexShrink: 0 }} />
      {!collapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
    </Link>
  );
}

type SidebarTab = "home" | "chat";

function TabBtn({ icon: Icon, active, onClick, title }: {
  icon: React.ElementType; active: boolean; onClick: () => void; title: string;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer",
      background: active ? "var(--admin-bg-active)" : "transparent",
      color: active ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)",
      transition: "background 0.1s",
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon style={{ width: 16, height: 16 }} />
    </button>
  );
}

export function SchoolAdminSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useGlobalStore();
  const { mode, isDark, setMode, colors: themeColors } = useAdminTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [themeSubmenu, setThemeSubmenu] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("home");

  const { threads, currentThreadId, createThread, selectThread } = useChat();
  const { openPanel } = useSidePanel();

  const openChatInPanel = (threadId?: string) => {
    if (threadId) selectThread(threadId);
    openPanel({ title: t("shell.askAi"), content: <AIChatSidePanel /> });
  };

  const handleNewChat = () => {
    const thread = createThread();
    setActiveTab("chat");
    openChatInPanel(thread.id);
  };

  const NAV_SECTIONS = getNavSections(t);
  const chatGroups = groupThreadsByDate(threads);

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

  const themeLabel = mode === "dark" ? t("shell.themeDark") : mode === "light" ? t("shell.themeLight") : t("shell.themeSystem");

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
      fontFamily: "var(--font-poppins), Poppins, Inter, -apple-system, system-ui, sans-serif",
      fontSize: 13, userSelect: "none", overflow: "hidden",
      transition: "width 0.2s ease", position: "relative",
    }}>

      {/* Logo bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: collapsed ? "14px 6px 10px" : "14px 10px 10px 12px",
      }}>
        {!collapsed ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/logo-icon.svg" alt="FormMaps" style={{ width: 28, height: 28 }} />
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
              <span style={{ color: C.fontPrimary }}>FORM</span>
              <span style={{ color: "#065292" }}>MAPS</span>
            </span>
          </div>
        ) : (
          <img src="/logo-icon.svg" alt="FormMaps" style={{ width: 24, height: 24, margin: "0 auto" }} />
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} title={t("shell.collapseSidebar")} style={{
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
          <button onClick={() => setCollapsed(false)} title={t("shell.expandSidebar")} style={{
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
      </div>

      {/* Tab Row */}
      {!collapsed && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 6, background: "var(--admin-bg-card-hover)" }}>
            <TabBtn icon={Home} active={activeTab === "home"} onClick={() => setActiveTab("home")} title={t("shell.navigationTab")} />
            <TabBtn icon={MessageCircle} active={activeTab === "chat"} onClick={() => setActiveTab("chat")} title={t("shell.chatHistoryTab")} />
          </div>
          <button onClick={handleNewChat} style={{
            display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px 0 8px",
            borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500,
            fontFamily: "inherit", marginLeft: "auto",
            background: "var(--admin-bg-card-hover)", color: "var(--admin-font-secondary)",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--admin-bg-card-hover)"; }}
          >
            <MessageCirclePlus style={{ width: 14, height: 14 }} />
            <span>{t("shell.newChat")}</span>
          </button>
        </div>
      )}

      {/* Navigation / Chat */}
      {activeTab === "home" ? (
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
      ) : (
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 4, paddingLeft: 4, paddingRight: 8, paddingBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {chatGroups.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, padding: 24 }}>
            <MessageCircle style={{ width: 24, height: 24, color: "var(--admin-font-light)" }} />
            <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("shell.noChatsYet")}</span>
            <button onClick={handleNewChat} style={{
              display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px",
              borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500,
              fontFamily: "inherit", marginTop: 4, background: "var(--admin-accent-blue)", color: "#fff",
            }}>
              <MessageCirclePlus style={{ width: 14, height: 14 }} />
              {t("shell.startChat")}
            </button>
          </div>
        ) : (
          chatGroups.map((group) => (
            <div key={group.label}>
              <div style={{ height: 20, display: "flex", alignItems: "center", padding: "4px 4px", fontSize: 11, fontWeight: 600, color: "var(--admin-font-light)" }}>
                {group.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {group.threads.map((thread) => {
                  const isCurrent = thread.id === currentThreadId;
                  return (
                    <div key={thread.id} style={{
                      display: "flex", alignItems: "center", gap: 8, height: 28, padding: "0 4px",
                      borderRadius: 4, cursor: "pointer",
                      background: isCurrent ? "var(--admin-bg-active)" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onClick={() => openChatInPanel(thread.id)}
                    onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                    >
                      <MessageCircle style={{ width: 14, height: 14, flexShrink: 0, color: isCurrent ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)" }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isCurrent ? "var(--admin-font-primary)" : "var(--admin-font-secondary)" }}>
                        {thread.title}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--admin-font-light)", flexShrink: 0 }}>
                        {formatThreadTime(thread.updatedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {/* User profile — bottom */}
      <div style={{ padding: collapsed ? "8px 6px" : "8px 8px", borderTop: `1px solid ${themeColors.border.light}`, position: "relative" }}>
        {/* User button */}
        <button
          onClick={() => {
            if (collapsed) { setCollapsed(false); return; }
            setThemeSubmenu(false);
            setDropdownOpen(!dropdownOpen);
          }}
          style={{
            display: "flex", alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10, width: "100%",
            padding: collapsed ? "6px 4px" : "8px 8px", borderRadius: 6,
            border: "none", background: "transparent",
            cursor: "pointer", color: C.fontPrimary,
            fontFamily: "inherit", transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{
            width: collapsed ? 24 : 28, height: collapsed ? 24 : 28, borderRadius: 7,
            background: "#065292", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>{user.name?.charAt(0)?.toUpperCase() || "S"}</div>
          {!collapsed && <>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || "School Admin"}</div>
              <div style={{ fontSize: 10, color: C.fontTertiary }}>School Administrator</div>
            </div>
            <ChevronDown style={{ width: 12, height: 12, color: C.fontLight }} />
          </>}
        </button>

        {/* Action buttons */}
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 4px 0" }}>
            <Link href="/school-admin/settings" style={{
              display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 8px",
              borderRadius: 4, border: "none", background: "transparent",
              color: C.fontSecondary, fontSize: 12, textDecoration: "none",
              fontFamily: "inherit", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <Settings style={{ width: 14, height: 14, color: C.fontTertiary }} />
              <span>{t("shell.settings")}</span>
            </Link>
            <button onClick={() => { logout(); router.push("/login"); }} style={{
              display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 8px",
              borderRadius: 4, border: "none", background: "transparent",
              color: C.fontSecondary, fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", marginLeft: "auto", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <LogOut style={{ width: 14, height: 14, color: C.fontTertiary }} />
              <span>{t("shell.signOut")}</span>
            </button>
          </div>
        )}

        {/* Dropdown (theme picker) */}
        {dropdownOpen && !collapsed && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }}
              onClick={() => { setDropdownOpen(false); setThemeSubmenu(false); }} />
            <div style={{
              position: "absolute", bottom: "100%", left: 8, width: 200, marginBottom: 4,
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
                  <button onClick={() => setThemeSubmenu(true)} style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent",
                    color: C.fontSecondary, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    transition: "background 0.1s", textAlign: "left",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <Moon style={{ width: 16, height: 16, color: C.fontTertiary, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{t("shell.theme")} · {themeLabel}</span>
                    <ChevronRight style={{ width: 12, height: 12, color: C.fontLight }} />
                  </button>
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
                      <span>{t("shell.theme")}</span>
                    </button>
                    <div style={{ height: 1, background: themeColors.border.hover, margin: "2px 6px" }} />
                    {([
                      { mode: "light" as ThemeMode, label: t("shell.themeLight"), icon: Sun },
                      { mode: "dark" as ThemeMode, label: t("shell.themeDark"), icon: Moon },
                      { mode: "system" as ThemeMode, label: t("shell.themeSystem"), icon: Monitor },
                    ]).map((themeOption) => (
                      <button key={themeOption.mode} onClick={() => changeTheme(themeOption.mode)} style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%",
                        padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent",
                        color: mode === themeOption.mode ? C.fontPrimary : C.fontSecondary,
                        fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                        transition: "background 0.1s", textAlign: "left",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <themeOption.icon style={{ width: 16, height: 16, color: mode === themeOption.mode ? C.fontPrimary : C.fontTertiary, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{themeOption.label}</span>
                        {mode === themeOption.mode && <span style={{ color: C.fontTertiary, fontSize: 14 }}>✓</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
