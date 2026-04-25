"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { sidebarData, coachSidebarData, adminSidebarData } from "./data";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import {
  SquaresFour as LayoutDashboard,
  ChartBar as BarChart2,
  SuitcaseSimple as Briefcase,
  GraduationCap,
  CreditCard,
  CalendarBlank as Calendar,
  FileText,
  GearSix as Settings,
  SignOut as LogOut,
  CaretDown as ChevronDown,
  User,
  BookOpen,
  Target,
  Users,
  Receipt,
  DotsThreeVertical as MoreVertical,
  Globe,
  Lightning as Zap,
  X as XIconComponent,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

// Icon mapping
const IconMap: Record<string, any> = {
  dashboard: LayoutDashboard,
  analytics: BarChart2,
  career: Briefcase,
  opportunities: Target,
  learning: GraduationCap,
  assessments: FileText,
  subscriptions: CreditCard,
  transactions: Receipt,
  sessions: Calendar,
  calendar: Calendar,
  settings: Settings,
  people: Users,
  resources: BookOpen,
};

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ className, isOpen = true, onClose }: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>(["analytics"]);
  const { logout, user } = useGlobalStore();
  const router = useRouter();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();

  // Select sidebar data based on current path, then role
  const role = user.role?.toLowerCase();
  const isAdminRoute = pathname?.includes("/dashboard/admin");

  let currentSidebarData = sidebarData;
  // Admin routes take priority - show admin sidebar only on /dashboard/admin/* pages
  if (isAdminRoute) {
    currentSidebarData = adminSidebarData;
  } else if (role === "coach") {
    currentSidebarData = coachSidebarData;
  }

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const isItemActive = (itemPath: string) => {
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-[280px] flex flex-col transform transition-transform duration-300 ease-in-out",
          "lg:bg-transparent bg-white border-r lg:border-none border-slate-200/60 shadow-sm lg:shadow-none lg:p-4 lg:pr-0",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          className,
        )}
        aria-label={t("accessibility.navigation")}
      >
        <div className="flex flex-col h-full bg-white/60 backdrop-blur-xl border-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_8px_32px_0_rgba(31,38,135,0.05)] lg:rounded-[2rem] lg:border relative overflow-hidden">
          {/* Logo */}
          <div className="p-6 pt-8 pb-6 border-b border-slate-100/40 relative overflow-hidden group">
            {/* Subtle logo liquid background */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[#eff6ff] to-white opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center space-x-3">
                <div className="relative w-10 h-10 bg-[#2563EB] rounded-[16px] flex items-center justify-center overflow-hidden shadow-[0_8px_16px_-4px_rgba(37,99,235,0.4)] text-white">
                  {/* Rotating subtle effect behind logo icon */}
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 24,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="absolute -inset-4 bg-[conic-gradient(from_90deg_at_50%_50%,#1d4ed8_0%,#60a5fa_50%,#1d4ed8_100%)] opacity-[0.4]"
                  />
                  <span
                    className="font-bold text-lg font-sans relative z-10"
                    aria-hidden="true"
                  >
                    {currentSidebarData.logo.icon}
                  </span>
                  {/* Top liquid shine */}
                  <div className="absolute top-0 right-0 left-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                </div>
                <span className="text-xl font-sans font-bold tracking-tighter text-slate-900 leading-none">
                  {currentSidebarData.logo.text}
                </span>
              </div>
              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100/80 transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                aria-label={t("accessibility.closeMenu")}
              >
                <XIconComponent className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav
            className="flex-1 px-4 py-6 space-y-[2px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent relative"
            aria-label={t("accessibility.navigation")}
          >
            {currentSidebarData.navigation.map((item) => {
              const isExpanded = expandedItems.includes(item.id);
              const hasSubmenu =
                Array.isArray((item as any).submenu) &&
                (item as any).submenu.length > 0;
              const isActive = isItemActive(item.path);
              const Icon =
                IconMap[item.icon as keyof typeof IconMap] || FileText;

              return (
                <div key={item.id} className="relative z-10">
                  {/* Main Menu Item */}
                  {hasSubmenu ? (
                    <button
                      type="button"
                      className={cn(
                        "group relative flex items-center justify-between w-full px-3 py-3 rounded-[14px] text-sm font-medium transition-all duration-300 text-left focus:outline-none",
                        isActive
                          ? "text-white font-semibold shadow-[0_2px_10px_-2px_rgba(37,99,235,0.4)]"
                          : "text-slate-600 hover:text-slate-900",
                      )}
                      onClick={() => toggleExpanded(item.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`submenu-${item.id}`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="active-sidebar-indicator"
                          className="absolute inset-0 bg-[#2563EB] rounded-[14px] -z-10"
                          transition={{
                            type: "spring",
                            stiffness: 250,
                            damping: 25,
                          }}
                        >
                          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        </motion.div>
                      )}
                      {!isActive && (
                        <div className="absolute inset-0 bg-slate-50/0 group-hover:bg-[#6275AF]/10 rounded-[14px] -z-10 transition-colors duration-300 pointer-events-none" />
                      )}

                      <span className="flex items-center flex-1">
                        <Icon
                          className={cn(
                            "w-5 h-5 mr-3 transition-all duration-300",
                            isActive
                              ? "text-white drop-shadow-sm"
                              : "text-slate-500 group-hover:text-[#2563EB] group-hover:scale-110",
                          )}
                          weight={isActive ? "fill" : "regular"}
                          aria-hidden="true"
                        />
                        <span className="relative">{t(item.name)}</span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 transition-transform duration-300",
                          isActive
                            ? "text-white/80"
                            : "text-slate-400 group-hover:text-[#2563EB]",
                          isExpanded ? "rotate-180" : "",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <Link
                      href={item.path}
                      className={cn(
                        "group relative flex items-center justify-between px-3 py-3 rounded-[14px] text-sm font-medium transition-all duration-300 focus:outline-none",
                        isActive
                          ? "text-white font-semibold shadow-[0_2px_10px_-2px_rgba(37,99,235,0.4)]"
                          : "text-slate-600 hover:text-slate-900",
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="active-sidebar-indicator"
                          className="absolute inset-0 bg-[#2563EB] rounded-[14px] -z-10"
                          transition={{
                            type: "spring",
                            stiffness: 250,
                            damping: 25,
                          }}
                        >
                          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        </motion.div>
                      )}
                      {!isActive && (
                        <div className="absolute inset-0 bg-slate-50/0 group-hover:bg-[#6275AF]/10 rounded-[14px] -z-10 transition-colors duration-300 pointer-events-none" />
                      )}

                      <span className="flex items-center flex-1">
                        <Icon
                          className={cn(
                            "w-5 h-5 mr-3 transition-all duration-300",
                            isActive
                              ? "text-white drop-shadow-sm"
                              : "text-slate-500 group-hover:text-[#2563EB] group-hover:scale-110",
                          )}
                          weight={isActive ? "fill" : "regular"}
                          aria-hidden="true"
                        />
                        <span>{t(item.name)}</span>
                      </span>
                    </Link>
                  )}

                  {/* Submenu */}
                  <AnimatePresence initial={false}>
                    {hasSubmenu && isExpanded && (
                      <motion.div
                        key={`submenu-${item.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div
                          id={`submenu-${item.id}`}
                          className="ml-5 mt-1 pl-4 border-l border-slate-200/50 space-y-1 my-1"
                          role="group"
                          aria-label={t(item.name)}
                        >
                          {(item as any).submenu?.map(
                            (subItem: any, i: number) => {
                              const isSubItemActive = isItemActive(
                                subItem.path,
                              );
                              return (
                                <motion.div
                                  key={subItem.path}
                                  initial={{ x: -10, opacity: 0 }}
                                  animate={{ x: 0, opacity: 1 }}
                                  transition={{
                                    delay: i * 0.05 + 0.05,
                                    duration: 0.3,
                                    ease: "easeOut",
                                  }}
                                >
                                  <Link
                                    href={subItem.path}
                                    className={cn(
                                      "relative block px-3 py-2 text-[13px] rounded-lg transition-all duration-200 focus:outline-none",
                                      isSubItemActive
                                        ? "text-[#2563EB] font-semibold bg-[#2563EB]/5"
                                        : "text-slate-500 hover:text-slate-900 hover:bg-[#6275AF]/5",
                                    )}
                                    aria-current={
                                      isSubItemActive ? "page" : undefined
                                    }
                                  >
                                    {/* Liquid active dot for subitems */}
                                    {isSubItemActive && (
                                      <motion.div
                                        layoutId="active-subitem-dot"
                                        className="absolute left-[-21px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#2563EB]"
                                        transition={{
                                          type: "spring",
                                          stiffness: 300,
                                          damping: 25,
                                        }}
                                      />
                                    )}
                                    {t(subItem.name)}
                                  </Link>
                                </motion.div>
                              );
                            },
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          {/* User Profile & Logout */}
          <div className="p-4 border-t border-slate-100/50 bg-white/50 backdrop-blur-xl shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 px-2 w-full justify-between cursor-pointer group hover:bg-slate-50 p-2 rounded-xl transition-colors outline-none focus:ring-2 focus:ring-[#2563EB]">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 border border-slate-200">
                      <AvatarImage
                        src={user?.avatar || user?.image || undefined}
                        alt=""
                      />
                      <AvatarFallback className="bg-[#eff6ff] text-blue-700">
                        {user?.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {user?.name || "User"}
                      </p>
                      <p className="text-xs text-slate-500 truncate capitalize">
                        {user?.role || "Member"}
                      </p>
                    </div>
                  </div>
                  <button className="text-slate-400 group-hover:text-slate-600 transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                className="w-60 bg-white border border-slate-200/60 shadow-lg text-slate-700 mb-2"
              >
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard/profile")}
                  className="hover:bg-slate-50 focus:bg-slate-50 cursor-pointer"
                >
                  <User className="mr-2 h-4 w-4 text-[#2563EB]" />
                  <span>{t("nav.viewProfile", "View Profile")}</span>
                </DropdownMenuItem>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="hover:bg-slate-50 focus:bg-slate-50 cursor-pointer">
                    <Globe className="mr-2 h-4 w-4 text-[#2563EB]" />
                    <span>{t("language.switchLanguage", "Language")}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="bg-slate-900 border-slate-800 text-slate-200 ml-2">
                      <DropdownMenuItem
                        onClick={() => i18n.changeLanguage("en")}
                        className="hover:bg-slate-800 focus:bg-slate-800 cursor-pointer"
                      >
                        <span className="mr-2">🇺🇸</span> English
                        {i18n.language === "en" && (
                          <span className="ml-auto text-blue-400">✓</span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => i18n.changeLanguage("es")}
                        className="hover:bg-slate-800 focus:bg-slate-800 cursor-pointer"
                      >
                        <span className="mr-2">🇪🇸</span> Español
                        {i18n.language === "es" && (
                          <span className="ml-auto text-blue-400">✓</span>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                <DropdownMenuSeparator className="bg-slate-100/50" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 focus:bg-rose-50 cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t("common.logout", "Logout")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>
    </>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}
