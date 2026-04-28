"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { sidebarData, coachSidebarData, adminSidebarData } from "./data";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePermission } from "@/hooks/usePermission";
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
  const { isSuperAdmin, isCoach } = usePermission();

  const isAdminRoute = pathname?.includes("/dashboard/admin");

  let currentSidebarData = sidebarData;
  if (isAdminRoute && isSuperAdmin) {
    currentSidebarData = adminSidebarData;
  } else if (isCoach) {
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
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-[260px] flex flex-col transform transition-transform duration-300 ease-in-out",
          "bg-card border-r border-border",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          className,
        )}
        aria-label={t("accessibility.navigation")}
      >
        {/* Logo */}
        <div className="px-5 pt-7 pb-5 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-foreground rounded-xl flex items-center justify-center text-background font-bold text-sm">
                {currentSidebarData.logo.icon}
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground">
                {currentSidebarData.logo.text}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label={t("accessibility.closeMenu")}
            >
              <XIconComponent className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin"
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
              <div key={item.id}>
                {hasSubmenu ? (
                  <button
                    type="button"
                    className={cn(
                      "group relative flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 text-left",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                    )}
                    onClick={() => toggleExpanded(item.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`submenu-${item.id}`}
                  >
                    <span className="flex items-center flex-1">
                      <Icon
                        className={cn(
                          "w-[18px] h-[18px] mr-3",
                          isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground",
                        )}
                        weight={isActive ? "fill" : "regular"}
                        aria-hidden="true"
                      />
                      <span>{t(item.name)}</span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 transition-transform duration-200",
                        isActive ? "text-background/60" : "text-muted-foreground",
                        isExpanded ? "rotate-180" : "",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                ) : (
                  <Link
                    href={item.path}
                    className={cn(
                      "group relative flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon
                      className={cn(
                        "w-[18px] h-[18px] mr-3",
                        isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground",
                      )}
                      weight={isActive ? "fill" : "regular"}
                      aria-hidden="true"
                    />
                    <span>{t(item.name)}</span>
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
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div
                        id={`submenu-${item.id}`}
                        className="ml-5 mt-0.5 pl-4 border-l border-border space-y-0.5 py-1"
                        role="group"
                        aria-label={t(item.name)}
                      >
                        {(item as any).submenu?.map(
                          (subItem: any) => {
                            const isSubItemActive = isItemActive(subItem.path);
                            return (
                              <Link
                                key={subItem.path}
                                href={subItem.path}
                                className={cn(
                                  "relative block px-3 py-2 text-[13px] rounded-lg transition-colors duration-200",
                                  isSubItemActive
                                    ? "text-foreground font-semibold bg-secondary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                                )}
                                aria-current={isSubItemActive ? "page" : undefined}
                              >
                                {isSubItemActive && (
                                  <span className="absolute left-[-20.5px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-foreground" />
                                )}
                                {t(subItem.name)}
                              </Link>
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

        {/* User Profile */}
        <div className="p-3 border-t border-border shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 px-2 w-full justify-between cursor-pointer group hover:bg-secondary p-2 rounded-xl transition-colors outline-none">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarImage
                      src={user?.avatar || user?.image || undefined}
                      alt=""
                    />
                    <AvatarFallback className="bg-secondary text-foreground text-sm font-semibold">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {user?.name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate capitalize">
                      {user?.role || "Member"}
                    </p>
                  </div>
                </div>
                <MoreVertical className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              className="w-56 mb-2"
            >
              <DropdownMenuItem
                onClick={() => router.push("/dashboard/profile")}
                className="cursor-pointer"
              >
                <User className="mr-2 h-4 w-4" />
                <span>{t("nav.viewProfile", "View Profile")}</span>
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer">
                  <Globe className="mr-2 h-4 w-4" />
                  <span>{t("language.switchLanguage", "Language")}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="ml-2">
                    <DropdownMenuItem
                      onClick={() => i18n.changeLanguage("en")}
                      className="cursor-pointer"
                    >
                      English
                      {i18n.language === "en" && (
                        <span className="ml-auto text-primary font-bold">✓</span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => i18n.changeLanguage("es")}
                      className="cursor-pointer"
                    >
                      Español
                      {i18n.language === "es" && (
                        <span className="ml-auto text-primary font-bold">✓</span>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t("common.logout", "Logout")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
