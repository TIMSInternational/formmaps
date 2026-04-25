"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ChevronRight,
  TrendingDown,
  Bell,
  Radar,
  Users,
  Compass,
  Settings,
  CalendarDays,
} from "lucide-react";

interface CounselorLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { key: "dashboard", path: "/counselor", icon: LayoutDashboard, label: "Overview", section: "Main" },
  { key: "students", path: "/counselor/students", icon: Users, label: "My Students", section: "Caseload" },
  { key: "academicGaps", path: "/counselor/academic-gaps", icon: TrendingDown, label: "Academic Gaps" },
  { key: "evaluations", path: "/counselor/evaluations", icon: Radar, label: "360° Evaluations" },
  { key: "alerts", path: "/counselor/alerts", icon: Bell, label: "Alerts" },
  { key: "sessions", path: "/counselor/sessions", icon: CalendarDays, label: "Sessions", section: "Scheduling" },
  { key: "settings", path: "/counselor/settings", icon: Settings, label: "Settings", section: "Preferences" },
];

export function CounselorLayout({ children }: CounselorLayoutProps) {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout, user } = useGlobalStore();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isActive = (path: string) => {
    if (path === "/counselor") {
      return pathname === path;
    }
    return pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-indigo-900 via-indigo-800 to-slate-900 text-white h-screen flex flex-col transform transition-transform duration-300 ease-in-out shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 border-b border-indigo-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                <Compass className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight">Counselor</span>
                <p className="text-indigo-200 text-xs font-medium">UNIV.365</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg text-indigo-300 hover:text-white hover:bg-indigo-700/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item, index) => {
            const active = isActive(item.path);
            const showSection = item.section && (index === 0 || navItems[index - 1]?.section !== item.section);
            return (
              <div key={item.path}>
                {showSection && index > 0 && (
                  <div className="pt-4 pb-2 px-4">
                    <p className="text-xs font-semibold text-indigo-400/70 uppercase tracking-wider">{item.section}</p>
                  </div>
                )}
                <Link
                  href={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                    active
                      ? "bg-white/15 text-white shadow-lg backdrop-blur-sm"
                      : "text-indigo-100 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon className={cn("mr-3 h-4 w-4 transition-transform group-hover:scale-110", active ? "text-blue-300" : "text-indigo-300")} />
                  <span className="flex-1">{t(`counselor.nav.${item.key}`, item.label)}</span>
                  {active && <ChevronRight className="w-4 h-4 text-blue-300" />}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-indigo-700/50 space-y-2">
          <div className="px-4 py-3 bg-white/5 rounded-xl">
            <p className="text-sm font-medium text-white truncate">{user?.name || "Counselor"}</p>
            <p className="text-xs text-indigo-300 truncate">{user?.email || "counselor@school.com"}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 text-sm font-medium text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 group"
          >
            <LogOut className="mr-3 h-5 w-5 text-indigo-300 group-hover:text-red-400 transition-colors" />
            <span>{t("common.logout", "Logout")}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 md:px-6 py-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="hidden lg:block">
                <h1 className="text-lg font-semibold text-gray-900">
                  {t("counselor.title", "Counselor Dashboard")}
                </h1>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-indigo-100 to-blue-100 text-indigo-800 px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                {t("counselor.role", "Counselor")}
              </div>
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md">
                {user?.name?.charAt(0)?.toUpperCase() || "C"}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
