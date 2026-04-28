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
  ChevronLeft,
  LogOut,
  Search,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard/admin", icon: LayoutDashboard },
      { label: "Analytics", href: "/dashboard/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Users", href: "/dashboard/admin/users", icon: Users },
      { label: "Schools", href: "/dashboard/admin/schools", icon: School },
      { label: "Coaches", href: "/dashboard/admin/coaches", icon: GraduationCap },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Courses", href: "/dashboard/admin/courses", icon: BookOpen },
      { label: "Careers", href: "/dashboard/admin/careers", icon: Briefcase },
      { label: "360° Questions", href: "/dashboard/admin/questions", icon: HelpCircle },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Plans", href: "/dashboard/admin/plans", icon: CreditCard },
      { label: "Transactions", href: "/dashboard/admin/transactions", icon: Receipt },
      { label: "Payouts", href: "/dashboard/admin/payouts", icon: Wallet },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", href: "/dashboard/admin/settings", icon: Settings },
    ],
  },
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
    <aside className="w-[220px] h-screen bg-[#fafafa] dark:bg-[#1a1a1a] border-r border-[#e4e4e7] dark:border-[#2a2a2a] flex flex-col shrink-0 select-none"
      style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: "13px" }}>

      {/* Logo / Header */}
      <div className="px-3 pt-4 pb-2">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-6 h-6 bg-black dark:bg-white rounded flex items-center justify-center text-[10px] font-bold text-white dark:text-black">
            N
          </div>
          <span className="text-[13px] font-semibold text-[#141414] dark:text-white tracking-tight">
            Nexa Admin
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <button className="w-full flex items-center gap-2 px-2.5 py-[7px] text-[12px] text-[#8a8a8e] bg-[#f0f0f0] dark:bg-[#2a2a2a] rounded-md hover:bg-[#e8e8e8] dark:hover:bg-[#333] transition-colors">
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <span className="ml-auto text-[10px] opacity-50">⌘K</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a8a8e]">
              {group.label}
            </div>
            <div className="space-y-[1px]">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] transition-colors",
                      active
                        ? "bg-[#e8e8eb] dark:bg-[#333] text-[#141414] dark:text-white font-medium"
                        : "text-[#666] dark:text-[#999] hover:bg-[#efefef] dark:hover:bg-[#2a2a2a] hover:text-[#141414] dark:hover:text-white"
                    )}
                  >
                    <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#141414] dark:text-white" : "text-[#8a8a8e]")} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-[#e4e4e7] dark:border-[#2a2a2a] space-y-[1px]">
        <button
          onClick={() => router.push("/dashboard")}
          className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] text-[#666] dark:text-[#999] hover:bg-[#efefef] dark:hover:bg-[#2a2a2a] hover:text-[#141414] dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-[#8a8a8e]" />
          <span>Student View</span>
        </button>
        <button
          onClick={() => { logout(); router.push("/login"); }}
          className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] text-[#666] dark:text-[#999] hover:bg-[#efefef] dark:hover:bg-[#2a2a2a] hover:text-[#141414] dark:hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 text-[#8a8a8e]" />
          <span>Sign Out</span>
        </button>
        {/* User */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 mt-1">
          <div className="w-6 h-6 rounded-full bg-[#e4e4e7] dark:bg-[#333] flex items-center justify-center text-[10px] font-semibold text-[#666] dark:text-[#999]">
            {user?.name?.charAt(0) || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[#141414] dark:text-white truncate">{user?.name || "Admin"}</div>
            <div className="text-[10px] text-[#8a8a8e] truncate">{user?.email || ""}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
