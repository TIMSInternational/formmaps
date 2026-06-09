"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useAdminTheme } from "@/contexts/AdminThemeContext";
import { useTranslation } from "react-i18next";
import { useChat } from "@/components/ai-chat/ChatContext";
import { useSidePanel } from "@/components/side-panel/SidePanel";
import { AIChatSidePanel } from "@/components/ai-chat/AIChatPanel";
import { groupThreadsByDate, formatThreadTime } from "@/components/ai-chat/useChatThreads";
import { useIsSchoolStudent } from "@/hooks/useSubscription";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  GraduationCap,
  BookOpen,
  Target,
  CreditCard,
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
  Settings,
  Search,
  Eye,
  Brain,
  Scale,
  Clock,
  Map,
  University,
  BookMarked,
  Award,
  Calendar,
  UserCheck,
  Users,
  Home,
  MessageCircle,
  MessageCirclePlus,
  Video,
  HeartHandshake,
} from "lucide-react";

type ThemeMode = "dark" | "light" | "system";
type SidebarTab = "home" | "chat";

interface NavSubItem { label: string; href: string; icon: React.ElementType }
interface NavSection {
  label: string;
  items: { label: string; href: string; icon: React.ElementType; sub?: NavSubItem[] }[];
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
          { label: "common.overview", href: "/dashboard/assessments", icon: Eye },
          { label: "dashboard.pcaAssessment", href: "/dashboard/assessments/pca", icon: Brain },
          { label: "dashboard.liaAssessment", href: "/dashboard/assessments/lia", icon: Scale },
          { label: "dashboard.evaluationTitle", href: "/dashboard/assessments/evaluation", icon: Target },
          { label: "dashboard.timeline", href: "/dashboard/timeline", icon: Clock },
        ],
      },
      {
        label: "nav.careerEducation", href: "#", icon: Briefcase,
        sub: [
          { label: "dashboard.careerPathsExplorer", href: "/dashboard/career-paths", icon: Map },
          { label: "dashboard.universitySuggestions", href: "/dashboard/university", icon: University },
        ],
      },
      {
        label: "nav.learning", href: "/dashboard/learning", icon: GraduationCap,
        sub: [
          { label: "dashboard.courses", href: "/dashboard/learning/courses", icon: BookMarked },
          { label: "dashboard.certifications", href: "/dashboard/learning/certifications", icon: Award },
        ],
      },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "dashboard.resumeBuilder", href: "/dashboard/resumes", icon: ClipboardList },
      { label: "dashboard.portfolio", href: "/dashboard/portfolio", icon: FolderOpen },
      { label: "Applications", href: "/dashboard/applications", icon: Target },
      { label: "Test Scores", href: "/dashboard/test-scores", icon: FileText },
      { label: "Transcript", href: "/dashboard/transcript", icon: BookOpen },
      { label: "Recommendations", href: "/dashboard/recommendations", icon: Award },
      { label: "Community Service", href: "/dashboard/community-service", icon: HeartHandshake },
    ],
  },
  {
    label: "Sessions",
    items: [
      {
        label: "Counseling & Coaching", href: "/dashboard/my-sessions", icon: Users,
        sub: [
          { label: "My Sessions", href: "/dashboard/my-sessions", icon: Calendar },
          { label: "Book Counselor", href: "/dashboard/book-counselor", icon: UserCheck },
          { label: "Find Coach", href: "/dashboard/book-coach", icon: Search },
        ],
      },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Messages", href: "/dashboard/messages", icon: MessageCircle },
      { label: "Video Calls", href: "/dashboard/video", icon: Video },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "dashboard.subscriptions", href: "/dashboard/subscriptions", icon: CreditCard },
    ],
  },
];

// ── Twenty-style Breadcrumb line for sub-items ──
function SubItemBreadcrumb({ isLast, isActive }: { isLast: boolean; isActive: boolean }) {
  const lineColor = "var(--admin-border-default)";
  const activeColor = "var(--admin-font-tertiary)";
  return (
    <div style={{ position: "relative", width: 16, height: 28, flexShrink: 0, marginLeft: 8 }}>
      <div style={{ position: "absolute", left: 4, top: 0, width: 1, height: 14, background: isActive ? activeColor : lineColor }} />
      <div style={{ position: "absolute", left: 4, top: 14, width: 8, height: 1, background: isActive ? activeColor : lineColor, borderBottomLeftRadius: 2 }} />
      {!isLast && <div style={{ position: "absolute", left: 4, top: 14, width: 1, height: 14, background: lineColor }} />}
    </div>
  );
}

// ── NavItem ──
function NavItem({ href, icon: Icon, label, active, hasSub, expanded, onToggle, colors }: {
  href: string; icon: React.ElementType; label: string; active: boolean;
  hasSub?: boolean; expanded?: boolean; onToggle?: () => void;
  colors: { fontSecondary: string; fontTertiary: string; hoverBg: string };
}) {
  return (
    <Link
      href={hasSub ? "#" : href}
      onClick={(e) => { if (hasSub && onToggle) { e.preventDefault(); onToggle(); } }}
      style={{
        display: "flex", alignItems: "center", gap: 8, height: 28, padding: "0 8px",
        borderRadius: 4, fontSize: 13, fontWeight: 500, textDecoration: "none", cursor: "pointer",
        color: active && !hasSub ? "#fff" : colors.fontSecondary,
        background: active && !hasSub ? "#065292" : "transparent",
        transition: "background 0.1s ease",
      }}
      onMouseEnter={(e) => { if (!(active && !hasSub)) e.currentTarget.style.background = colors.hoverBg; }}
      onMouseLeave={(e) => { if (!(active && !hasSub)) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon style={{ width: 16, height: 16, color: active && !hasSub ? "#fff" : colors.fontTertiary, flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {hasSub && (
        <ChevronRight style={{
          width: 12, height: 12, color: colors.fontTertiary,
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.3s", flexShrink: 0,
        }} />
      )}
    </Link>
  );
}

// ── Tab Button (Home / Chat) ──
function TabBtn({ icon: Icon, active, onClick, title }: {
  icon: React.ElementType; active: boolean; onClick: () => void; title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
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

export function StudentSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useGlobalStore();
  const { t } = useTranslation();
  const { mode, setMode, colors: themeColors } = useAdminTheme();
  const { threads, currentThreadId, createThread, selectThread } = useChat();
  const isSchoolStudent = useIsSchoolStudent();
  const { openPanel } = useSidePanel();

  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<string[]>(["dashboard.assessments"]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [themeSubmenu, setThemeSubmenu] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("home");

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

  const openChatInPanel = (threadId?: string) => {
    if (threadId) selectThread(threadId);
    openPanel({ title: "Ask AI", content: <AIChatSidePanel /> });
  };

  const handleNewChat = () => {
    const thread = createThread();
    setActiveTab("chat");
    openChatInPanel(thread.id);
  };

  const themeLabel = mode === "dark" ? "Dark" : mode === "light" ? "Light" : "System";
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    if (href === "#") return false;
    if (href === "/dashboard/assessments") return pathname === href;
    return pathname?.startsWith(href) ?? false;
  };
  const isSubActive = (subs: NavSubItem[]) => subs.some(s => pathname?.startsWith(s.href));
  const resolveLabel = (key: string) => { const v = t(key); return v === key ? key : v; };

  const COLLAPSED_W = 52;
  const EXPANDED_W = 220;
  const chatGroups = groupThreadsByDate(threads);

  return (
    <aside style={{
      width: collapsed ? COLLAPSED_W : EXPANDED_W,
      height: "100%", display: "flex", flexDirection: "column", flexShrink: 0,
      background: "transparent", fontFamily: "var(--font-poppins), Poppins, Inter, -apple-system, system-ui, sans-serif",
      fontSize: 13, userSelect: "none", overflow: "hidden", transition: "width 0.2s ease",
      position: "relative",
    }}>

      {/* ── Logo bar ── */}
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
      </div>

      {/* ── Tab Row: Home / Chat / New Chat (Twenty-style) ── */}
      {!collapsed && (
        <div style={{
          display: "flex", alignItems: "center", gap: 4, padding: "0 4px",
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 2,
            padding: 2, borderRadius: 6,
            background: "var(--admin-bg-card-hover)",
          }}>
            <TabBtn icon={Home} active={activeTab === "home"} onClick={() => setActiveTab("home")} title="Navigation" />
            <TabBtn icon={MessageCircle} active={activeTab === "chat"} onClick={() => setActiveTab("chat")} title="Chat history" />
          </div>
          <button
            onClick={handleNewChat}
            style={{
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
            <span>New chat</span>
          </button>
        </div>
      )}

      {/* ── Scrollable Content (switches between Nav and Chat History) ── */}
      {activeTab === "home" ? (
        /* ── Navigation ── */
        <nav style={{
          flex: 1, overflowY: "auto",
          padding: collapsed ? "4px 6px 8px 6px" : "4px 8px 8px 8px",
        }}>
          {NAV_SECTIONS.filter(s => !(s.label === "Account" && isSchoolStudent)).map((section) => (
            <div key={section.label} style={{ marginBottom: 8 }}>
              {!collapsed && (
                <div style={{
                  padding: "8px 8px 6px 8px", fontSize: 10, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.06em", color: C.fontLight,
                }}>
                  {section.label}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {section.items.map((item) => {
                  const hasSub = !!item.sub?.length;
                  const itemActive = isActive(item.href) || (hasSub && item.sub ? isSubActive(item.sub) : false);
                  const isExp = expanded.includes(item.label);
                  const selectedSubIndex = hasSub && item.sub ? item.sub.findIndex(s => isActive(s.href)) : -1;

                  return (
                    <div key={item.label}>
                      {collapsed ? (
                        <Link href={hasSub ? (item.sub?.[0]?.href || item.href) : item.href}
                          title={resolveLabel(item.label)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            height: 28, borderRadius: 4,
                            background: itemActive ? "#065292" : "transparent", textDecoration: "none",
                          }}
                          onMouseEnter={(e) => { if (!itemActive) e.currentTarget.style.background = C.hoverBg; }}
                          onMouseLeave={(e) => { if (!itemActive) e.currentTarget.style.background = "transparent"; }}
                        >
                          <item.icon style={{ width: 16, height: 16, color: itemActive ? "#fff" : C.fontTertiary }} />
                        </Link>
                      ) : (
                        <NavItem
                          href={item.href} icon={item.icon} label={resolveLabel(item.label)}
                          active={itemActive} hasSub={hasSub} expanded={isExp}
                          onToggle={() => toggleExpand(item.label)}
                          colors={C}
                        />
                      )}

                      {hasSub && isExp && !collapsed && (
                        <div style={{ display: "flex", flexDirection: "column", marginTop: 2 }}>
                          {item.sub!.map((sub, idx) => {
                            const subActive = isActive(sub.href);
                            const isLast = idx === item.sub!.length - 1;
                            const SubIcon = sub.icon;
                            return (
                              <Link key={sub.href} href={sub.href}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, height: 28,
                                  padding: "0 4px 0 0", borderRadius: 4, fontSize: 13, fontWeight: 500,
                                  textDecoration: "none", transition: "background 0.1s",
                                  color: subActive ? "#fff" : C.fontSecondary,
                                  background: subActive ? "#065292" : "transparent",
                                }}
                                onMouseEnter={(e) => { if (!subActive) e.currentTarget.style.background = C.hoverBg; }}
                                onMouseLeave={(e) => { if (!subActive) e.currentTarget.style.background = "transparent"; }}
                              >
                                <SubItemBreadcrumb isLast={isLast} isActive={subActive || idx <= selectedSubIndex} />
                                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}>
                                  <SubIcon style={{ width: 14, height: 14, color: subActive ? "#fff" : C.fontTertiary }} />
                                </span>
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {resolveLabel(sub.label)}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      ) : (
        /* ── Chat History (Twenty-style) ── */
        <div style={{
          flex: 1, overflowY: "auto", paddingTop: 4,
          paddingLeft: 4, paddingRight: 8, paddingBottom: 8,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {chatGroups.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", flex: 1, gap: 8, padding: 24,
            }}>
              <MessageCircle style={{ width: 24, height: 24, color: "var(--admin-font-light)" }} />
              <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>No chats yet</span>
              <button
                onClick={handleNewChat}
                style={{
                  display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px",
                  borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500,
                  fontFamily: "inherit", marginTop: 4,
                  background: "var(--admin-accent-blue)", color: "#fff",
                }}
              >
                <MessageCirclePlus style={{ width: 14, height: 14 }} />
                Start a chat
              </button>
            </div>
          ) : (
            chatGroups.map((group) => (
              <div key={group.label}>
                <div style={{
                  height: 20, display: "flex", alignItems: "center", padding: "4px 4px",
                  fontSize: 11, fontWeight: 600, color: "var(--admin-font-light)",
                }}>
                  {group.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {group.threads.map((thread) => {
                    const isCurrent = thread.id === currentThreadId;
                    return (
                      <div
                        key={thread.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, height: 28, padding: "0 4px",
                          borderRadius: 4, cursor: "pointer",
                          background: isCurrent ? "var(--admin-bg-active)" : "transparent",
                          transition: "background 0.1s",
                        }}
                        onClick={() => openChatInPanel(thread.id)}
                        onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                        onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                      >
                        <MessageCircle style={{
                          width: 14, height: 14, flexShrink: 0,
                          color: isCurrent ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)",
                        }} />
                        <span style={{
                          flex: 1, fontSize: 13, fontWeight: 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          color: isCurrent ? "var(--admin-font-primary)" : "var(--admin-font-secondary)",
                        }}>
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

      {/* ── User profile — bottom ── */}
      <div style={{ padding: collapsed ? "8px 6px" : "8px 8px", borderTop: `1px solid ${themeColors.border.light}`, position: "relative" }}>
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
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || "Student"}</div>
              <div style={{ fontSize: 10, color: C.fontTertiary }}>Student</div>
            </div>
            <ChevronDown style={{ width: 12, height: 12, color: C.fontLight }} />
          </>}
        </button>

        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 4px 0" }}>
            <Link href="/dashboard/settings" style={{
              display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 8px",
              borderRadius: 4, border: "none", background: "transparent",
              color: C.fontSecondary, fontSize: 12, textDecoration: "none",
              fontFamily: "inherit", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <Settings style={{ width: 14, height: 14, color: C.fontTertiary }} />
              <span>Settings</span>
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
              <span>Sign Out</span>
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
              borderRadius: 8, zIndex: 100,
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
                    <span style={{ flex: 1 }}>Theme · {themeLabel}</span>
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
                      <span>Theme</span>
                    </button>
                    <div style={{ height: 1, background: themeColors.border.hover, margin: "2px 6px" }} />
                    {([
                      { mode: "light" as ThemeMode, label: "Light", icon: Sun },
                      { mode: "dark" as ThemeMode, label: "Dark", icon: Moon },
                      { mode: "system" as ThemeMode, label: "System", icon: Monitor },
                    ]).map((th) => (
                      <button key={th.mode} onClick={() => changeTheme(th.mode)} style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%",
                        padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent",
                        color: mode === th.mode ? C.fontPrimary : C.fontSecondary,
                        fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                        transition: "background 0.1s", textAlign: "left",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <th.icon style={{ width: 16, height: 16, color: mode === th.mode ? C.fontPrimary : C.fontTertiary, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{th.label}</span>
                        {mode === th.mode && <span style={{ color: C.fontTertiary, fontSize: 14 }}>✓</span>}
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

