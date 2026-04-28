"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
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
  Home,
  MessageSquare,
  Search,
  FileText,
  Workflow,
} from "lucide-react";

const WORKSPACE_ITEMS = [
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

const OTHER_ITEMS = [
  { label: "Settings", href: "/dashboard/admin/settings", icon: Settings },
  { label: "Student View", href: "/dashboard", icon: ChevronLeft },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useGlobalStore();

  const isActive = (href: string) => {
    if (href === "/dashboard/admin") return pathname === href;
    return pathname?.startsWith(href) ?? false;
  };

  return (
    <aside
      className="w-[200px] h-screen flex flex-col shrink-0 select-none border-r"
      style={{
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
        fontSize: "13px",
        background: "#141414",
        borderColor: "#2a2a2a",
        color: "#b3b3b3",
      }}
    >
      {/* Workspace selector */}
      <div className="px-2 pt-3 pb-1">
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#222] transition-colors">
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{ background: "#333", color: "#fff" }}
          >
            N
          </div>
          <span className="text-[13px] font-medium text-white truncate">NexaDev</span>
          <ChevronDown className="w-3.5 h-3.5 ml-auto text-[#666] shrink-0" />
        </button>
      </div>

      {/* Icon buttons row */}
      <div className="px-2 py-1 flex items-center gap-0.5">
        {[
          { icon: Home, href: "/dashboard/admin", label: "Home" },
          { icon: Search, href: "#", label: "Search" },
          { icon: MessageSquare, href: "#", label: "Chat" },
          { icon: Settings, href: "/dashboard/admin/settings", label: "Settings" },
        ].map((btn) => (
          <Link
            key={btn.label}
            href={btn.href}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#222] transition-colors"
            title={btn.label}
          >
            <btn.icon className="w-4 h-4 text-[#666]" />
          </Link>
        ))}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pt-2 pb-2">
        {/* Workspace section */}
        <div className="mb-3">
          <div
            className="px-2 pb-1.5 pt-1"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#555",
            }}
          >
            Workspace
          </div>
          <div className="space-y-px">
            {WORKSPACE_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-2 py-[6px] rounded transition-colors",
                    active
                      ? "bg-[#222] text-white"
                      : "text-[#999] hover:bg-[#1e1e1e] hover:text-[#ccc]"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-4 h-4 shrink-0",
                      active ? "text-white" : "text-[#666]"
                    )}
                  />
                  <span className="truncate" style={{ fontSize: "13px" }}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Other section */}
        <div>
          <div
            className="px-2 pb-1.5 pt-1"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#555",
            }}
          >
            Other
          </div>
          <div className="space-y-px">
            {OTHER_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-2 py-[6px] rounded text-[#999] hover:bg-[#1e1e1e] hover:text-[#ccc] transition-colors"
              >
                <item.icon className="w-4 h-4 shrink-0 text-[#666]" />
                <span className="truncate" style={{ fontSize: "13px" }}>
                  {item.label}
                </span>
              </Link>
            ))}
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="w-full flex items-center gap-2 px-2 py-[6px] rounded text-[#999] hover:bg-[#1e1e1e] hover:text-[#ccc] transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0 text-[#666]" />
              <span className="truncate" style={{ fontSize: "13px" }}>
                Sign Out
              </span>
            </button>
          </div>
        </div>
      </nav>
    </aside>
  );
}
