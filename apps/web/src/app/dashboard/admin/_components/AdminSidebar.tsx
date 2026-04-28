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
  Home,
  MessageSquare,
  Search as SearchIcon,
  FileText,
  LogOut,
  ChevronLeft,
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
    }}>

      {/* Header — workspace selector */}
      <div style={{ padding: collapsed ? "12px 6px 0 6px" : "12px 8px 0 8px" }}>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: collapsed ? "6px 0" : "6px 8px",
            justifyContent: collapsed ? "center" : "flex-start",
            borderRadius: 4,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: C.fontPrimary,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "inherit",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          onClick={() => collapsed && setCollapsed(false)}
          title={collapsed ? "Expand sidebar" : "NexaDev"}
        >
          <div style={{
            width: 24, height: 24, borderRadius: 4,
            background: "#333", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>N</div>
          {!collapsed && <span>NexaDev</span>}
          {!collapsed && <ChevronDown style={{ width: 14, height: 14, marginLeft: "auto", color: C.fontLight }} />}
        </button>
      </div>

      {/* Icon button row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: collapsed ? "8px 6px 4px 6px" : "8px 8px 4px 8px",
        justifyContent: collapsed ? "center" : "flex-start",
        flexWrap: collapsed ? "wrap" : "nowrap",
      }}>
        {(collapsed
          ? [{ icon: SearchIcon, href: "#" }]
          : [
              { icon: Home, href: "/dashboard/admin" },
              { icon: SearchIcon, href: "#" },
              { icon: MessageSquare, href: "#" },
            ]
        ).map((btn, i) => (
          <Link key={i} href={btn.href} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 4,
            color: C.fontTertiary,
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <btn.icon style={{ width: 16, height: 16 }} />
          </Link>
        ))}
        {/* Collapse/expand toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 4,
            color: C.fontTertiary,
            transition: "background 0.1s",
            border: "none", background: "transparent", cursor: "pointer",
            marginLeft: collapsed ? 0 : "auto",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen style={{ width: 16, height: 16 }} /> : <PanelLeftClose style={{ width: 16, height: 16 }} />}
        </button>
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
