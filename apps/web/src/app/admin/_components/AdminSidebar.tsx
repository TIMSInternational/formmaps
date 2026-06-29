"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useRouter } from "next/navigation";
import { useAdminTheme } from "@/contexts/AdminThemeContext";
import { useChat } from "@/components/ai-chat/ChatContext";
import { useSidePanel } from "@/components/side-panel/SidePanel";
import { AIChatSidePanel } from "@/components/ai-chat/AIChatPanel";
import { groupThreadsByDate, formatThreadTime } from "@/components/ai-chat/useChatThreads";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CreditCard,
  Receipt,
  Wallet,
  Briefcase,
  HelpCircle,
  BarChart3,
  Settings,
  School,
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
} from "lucide-react";

type ThemeMode = "dark" | "light" | "system";

const WORKSPACE_NAV = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Schools", href: "/admin/schools", icon: School },
  { label: "Coaches", href: "/admin/coaches", icon: GraduationCap },
  { label: "Courses", href: "/admin/courses", icon: BookOpen },
  { label: "Careers", href: "/admin/careers", icon: Briefcase },
  { label: "360 Questions", href: "/admin/questions", icon: HelpCircle },
  { label: "Transactions", href: "/admin/transactions", icon: Receipt },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Plans", href: "/admin/plans", icon: CreditCard },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
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

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation("platform_owner");
  const { t: tCommon } = useTranslation();
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
    openPanel({ title: tCommon("shell.askAi"), content: <AIChatSidePanel /> });
  };

  const handleNewChat = () => {
    const thread = createThread();
    setActiveTab("chat");
    openChatInPanel(thread.id);
  };

  const chatGroups = groupThreadsByDate(threads);

  // Derive sidebar color shortcuts from theme tokens
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

  const themeLabel = mode === "dark" ? tCommon("shell.themeDark") : mode === "light" ? tCommon("shell.themeLight") : tCommon("shell.themeSystem");

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === href;
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
          <button onClick={() => setCollapsed(true)} title={tCommon("shell.collapseSidebar")} style={{
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
          <button onClick={() => setCollapsed(false)} title={tCommon("shell.expandSidebar")} style={{
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
            <TabBtn icon={Home} active={activeTab === "home"} onClick={() => setActiveTab("home")} title={tCommon("shell.navigationTab")} />
            <TabBtn icon={MessageCircle} active={activeTab === "chat"} onClick={() => setActiveTab("chat")} title={tCommon("shell.chatHistoryTab")} />
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
            <span>{tCommon("shell.newChat")}</span>
          </button>
        </div>
      )}

      {/* Navigation / Chat */}
      {activeTab === "home" ? (
      <nav style={{ flex: 1, overflowY: "auto", padding: collapsed ? "4px 6px 8px 6px" : "4px 8px 8px 8px" }}>
        <div>
          {!collapsed && <div style={{
            padding: "8px 8px 6px 8px", fontSize: 10, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.06em", color: C.fontLight,
          }}>{tCommon("shell.workspace")}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {WORKSPACE_NAV.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} colors={C} />
            ))}
          </div>
        </div>
      </nav>
      ) : (
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 4, paddingLeft: 4, paddingRight: 8, paddingBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {chatGroups.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, padding: 24 }}>
            <MessageCircle style={{ width: 24, height: 24, color: "var(--admin-font-light)" }} />
            <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{tCommon("shell.noChatsYet")}</span>
            <button onClick={handleNewChat} style={{
              display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px",
              borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500,
              fontFamily: "inherit", marginTop: 4, background: "var(--admin-accent-blue)", color: "#fff",
            }}>
              <MessageCirclePlus style={{ width: 14, height: 14 }} />
              {tCommon("shell.startChat")}
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
          }}>{user.name?.charAt(0)?.toUpperCase() || "A"}</div>
          {!collapsed && <>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || "Admin"}</div>
              <div style={{ fontSize: 10, color: C.fontTertiary }}>{t("sidebar.administratorRole")}</div>
            </div>
            <ChevronDown style={{ width: 12, height: 12, color: C.fontLight }} />
          </>}
        </button>

        {/* Action buttons */}
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 4px 0" }}>
            <Link href="/admin/settings" style={{
              display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 8px",
              borderRadius: 4, border: "none", background: "transparent",
              color: C.fontSecondary, fontSize: 12, textDecoration: "none",
              fontFamily: "inherit", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <Settings style={{ width: 14, height: 14, color: C.fontTertiary }} />
              <span>{tCommon("shell.settings")}</span>
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
              <span>{tCommon("shell.signOut")}</span>
            </button>
          </div>
        )}

        {/* Dropdown (theme picker) — opens upward */}
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
                    <span style={{ flex: 1 }}>{tCommon("shell.theme")} · {themeLabel}</span>
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
                      <span>{tCommon("shell.theme")}</span>
                    </button>
                    <div style={{ height: 1, background: themeColors.border.hover, margin: "2px 6px" }} />
                    {([
                      { mode: "light" as ThemeMode, label: tCommon("shell.themeLight"), icon: Sun },
                      { mode: "dark" as ThemeMode, label: tCommon("shell.themeDark"), icon: Moon },
                      { mode: "system" as ThemeMode, label: tCommon("shell.themeSystem"), icon: Monitor },
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
