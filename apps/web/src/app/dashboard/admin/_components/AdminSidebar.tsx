"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useRouter } from "next/navigation";
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
  ChevronLeft,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

/*
 * Colors extracted from Twenty's theme-dark.css:
 * --t-background-primary:    #171717
 * --t-background-secondary:  #1b1b1b
 * --t-background-tertiary:   #1d1d1d
 * --t-border-color-medium:   #222222
 * --t-font-color-primary:    #ebebeb
 * --t-font-color-secondary:  #b3b3b3
 * --t-font-color-tertiary:   #818181
 * --t-font-color-light:      #666666
 * --t-background-transparent-light: rgba(255,255,255,0.06)
 * --t-background-transparent-medium: rgba(255,255,255,0.10)
 * --t-spacing: 4px increments
 * --t-border-radius-sm: 4px
 * --t-font-size-md: 13px (1rem at 13px base)
 * Nav item height: 28px (spacing[7])
 */

const C = {
  bgPrimary: "#171717",
  bgSecondary: "#1b1b1b",
  bgTertiary: "#1d1d1d",
  borderMedium: "#222",
  borderLight: "#1d1d1d",
  fontPrimary: "#ebebeb",
  fontSecondary: "#b3b3b3",
  fontTertiary: "#818181",
  fontLight: "#666",
  hoverBg: "rgba(255,255,255,0.06)",
  activeBg: "rgba(255,255,255,0.10)",
};

const WORKSPACE_NAV = [
  { label: "Dashboard", href: "/dashboard/admin", icon: LayoutDashboard },
  { label: "Users", href: "/dashboard/admin/users", icon: Users },
  { label: "Schools", href: "/dashboard/admin/schools", icon: School },
  { label: "Coaches", href: "/dashboard/admin/coaches", icon: GraduationCap },
  { label: "Courses", href: "/dashboard/admin/courses", icon: BookOpen },
  { label: "Careers", href: "/dashboard/admin/careers", icon: Briefcase },
  { label: "360° Questions", href: "/dashboard/admin/questions", icon: HelpCircle },
  { label: "Transactions", href: "/dashboard/admin/transactions", icon: Receipt },
  { label: "Payouts", href: "/dashboard/admin/payouts", icon: Wallet },
  { label: "Plans", href: "/dashboard/admin/plans", icon: CreditCard },
  { label: "Analytics", href: "/dashboard/admin/analytics", icon: BarChart3 },
];

const OTHER_NAV = [
  { label: "Settings", href: "/dashboard/admin/settings", icon: Settings },
  { label: "Student View", href: "/dashboard", icon: ChevronLeft },
];

function NavItem({ href, icon: Icon, label, active, collapsed }: {
  href: string; icon: any; label: string; active: boolean; collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: collapsed ? 0 : 8,
        height: 28,
        padding: collapsed ? "0 4px" : "0 8px",
        borderRadius: 4,
        fontSize: 13,
        color: active ? C.fontPrimary : C.fontSecondary,
        background: active ? C.activeBg : "transparent",
        textDecoration: "none",
        transition: "background 0.1s ease",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = C.hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon style={{ width: 16, height: 16, color: active ? C.fontPrimary : C.fontTertiary, flexShrink: 0 }} />
      {!collapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
    </Link>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useGlobalStore();
  const [collapsed, setCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard/admin") return pathname === href;
    return pathname?.startsWith(href) ?? false;
  };

  const COLLAPSED_W = 52;
  const EXPANDED_W = 220;

  return (
    <aside style={{
      width: collapsed ? COLLAPSED_W : EXPANDED_W,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      background: "transparent",
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      fontSize: 13,
      userSelect: "none",
      overflow: "hidden",
      transition: "width 0.2s ease",
      position: "relative",
    }}>

      {/* Top bar: [N NexaDev ˅]  [🔍] [📋] */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: collapsed ? "10px 6px 6px 6px" : "10px 8px 6px 12px",
        gap: 4,
        position: "relative",
      }}>
        {/* Workspace selector */}
        <button
          onClick={() => {
            if (collapsed) { setCollapsed(false); return; }
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
            <span>NexaDev</span>
            <ChevronDown style={{ width: 12, height: 12, color: C.fontLight }} />
          </>}
        </button>

        {/* Right icons: Search + Collapse */}
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {[
              { icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>, action: () => {}, title: "Search" },
              { icon: () => <PanelLeftClose style={{ width: 16, height: 16 }} />, action: () => setCollapsed(true), title: "Collapse sidebar" },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} title={btn.title} style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 4,
                color: C.fontTertiary, border: "none", background: "transparent",
                cursor: "pointer", transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <btn.icon />
              </button>
            ))}
          </div>
        )}

        {/* Collapsed: just show expand button */}
        {collapsed && (
          <button onClick={() => setCollapsed(false)} title="Expand sidebar" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 4, marginTop: 4,
            color: C.fontTertiary, border: "none", background: "transparent",
            cursor: "pointer", transition: "background 0.1s", position: "absolute",
            bottom: -32, left: "50%", transform: "translateX(-50%)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <PanelLeftOpen style={{ width: 16, height: 16 }} />
          </button>
        )}

        {/* Dropdown menu */}
        {dropdownOpen && !collapsed && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }}
              onClick={() => setDropdownOpen(false)} />
            <div style={{
              position: "absolute", top: 44, left: 8, width: 210,
              background: "rgba(30, 30, 30, 0.80)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: 4, zIndex: 100,
              boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            }}>
              {/* Workspace header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", marginBottom: 2,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: "linear-gradient(135deg, #8b5a6b, #4a3040)",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>N</div>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 500, flex: 1 }}>NexaDev</span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="#666">
                  <circle cx="8" cy="3" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13" r="1.5" />
                </svg>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 4px 4px 4px" }} />

              {/* Menu items with lucide-style icons */}
              {[
                { label: "Theme · Dark", href: "#", hasChevron: true,
                  iconSvg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg> },
                { label: "Invite user", href: "#",
                  iconSvg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg> },
                { label: "Settings", href: "/dashboard/admin/settings",
                  iconSvg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> },
              ].map((item, i) => (
                <Link key={i} href={item.href}
                  onClick={() => setDropdownOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "8px 10px", borderRadius: 4,
                    color: C.fontSecondary, fontSize: 13,
                    textDecoration: "none", transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: C.fontTertiary, flexShrink: 0 }}>{item.iconSvg}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.hasChevron && <ChevronDown style={{ width: 12, height: 12, color: C.fontLight, transform: "rotate(-90deg)" }} />}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Navigation sections */}
      <nav style={{ flex: 1, overflowY: "auto", padding: collapsed ? "4px 6px 8px 6px" : "4px 8px 8px 8px" }}>
        {/* Workspace */}
        <div style={{ marginBottom: 12 }}>
          {!collapsed && <div style={{
            padding: "8px 8px 6px 8px",
            fontSize: 10, fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: C.fontLight,
          }}>Workspace</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {WORKSPACE_NAV.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
          </div>
        </div>

        {/* Other */}
        <div>
          {!collapsed && <div style={{
            padding: "8px 8px 6px 8px",
            fontSize: 10, fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: C.fontLight,
          }}>Other</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {OTHER_NAV.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
            <button
              onClick={() => { logout(); router.push("/login"); }}
              title={collapsed ? "Sign Out" : undefined}
              style={{
                display: "flex", alignItems: "center",
                justifyContent: collapsed ? "center" : "flex-start",
                gap: collapsed ? 0 : 8,
                height: 28, padding: collapsed ? "0 4px" : "0 8px", borderRadius: 4,
                fontSize: 13, color: C.fontSecondary,
                background: "transparent", border: "none",
                cursor: "pointer", fontFamily: "inherit",
                transition: "background 0.1s",
                width: "100%", textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <LogOut style={{ width: 16, height: 16, color: C.fontTertiary, flexShrink: 0 }} />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </div>
      </nav>
    </aside>
  );
}
