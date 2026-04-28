"use client";

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

function NavItem({ href, icon: Icon, label, active }: {
  href: string; icon: any; label: string; active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 28,
        padding: "0 8px",
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
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </Link>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useGlobalStore();

  const isActive = (href: string) => {
    if (href === "/dashboard/admin") return pathname === href;
    return pathname?.startsWith(href) ?? false;
  };

  return (
    <aside style={{
      width: 220,
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      background: C.bgPrimary,
      borderRight: `1px solid ${C.borderMedium}`,
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      fontSize: 13,
      userSelect: "none",
      overflow: "hidden",
    }}>

      {/* Header — workspace selector */}
      <div style={{ padding: "12px 8px 0 8px" }}>
        <button style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "6px 8px",
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
        >
          <div style={{
            width: 20, height: 20, borderRadius: 4,
            background: "#333", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}>N</div>
          <span>NexaDev</span>
          <ChevronDown style={{ width: 14, height: 14, marginLeft: "auto", color: C.fontLight }} />
        </button>
      </div>

      {/* Icon button row */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "8px 8px 4px 8px" }}>
        {[
          { icon: Home, href: "/dashboard/admin" },
          { icon: SearchIcon, href: "#" },
          { icon: MessageSquare, href: "#" },
          { icon: Settings, href: "/dashboard/admin/settings" },
        ].map((btn, i) => (
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
      </div>

      {/* Navigation sections */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px 8px" }}>
        {/* Workspace */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            padding: "8px 8px 6px 8px",
            fontSize: 10, fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: C.fontLight,
          }}>Workspace</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {WORKSPACE_NAV.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </div>
        </div>

        {/* Other */}
        <div>
          <div style={{
            padding: "8px 8px 6px 8px",
            fontSize: 10, fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: C.fontLight,
          }}>Other</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {OTHER_NAV.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
            <button
              onClick={() => { logout(); router.push("/login"); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                height: 28, padding: "0 8px", borderRadius: 4,
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
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </nav>
    </aside>
  );
}
