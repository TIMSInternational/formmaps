"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { UserProfileDropdown } from "@/components/ui/user-profile-dropdown";
import { AccessibleLanguageSwitcher } from "@/components/accessibility/AccessibleLanguageSwitcher";
import {
  MagnifyingGlass as Search,
  Bell,
  List as Menu,
} from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TopNavProps {
  className?: string;
  onMenuClick?: () => void;
}

export function TopNav({ className, onMenuClick }: TopNavProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useTranslation();

  const translatedNavItems = [
    { name: t("nav.dashboard"), active: true, path: "/dashboard" },
  ];

  return (
    <div className="px-4 md:px-8 py-4 sticky bg-none top-0 z-40 relative h-0 pointer-events-none">
      <header
        className={cn(
          "glass-card flex items-center justify-between px-4 md:px-6 py-1.5 md:py-2 rounded-full absolute left-0 right-0 mx-auto top-4 w-[92%] max-w-4xl pointer-events-auto",
          className,
        )}
        role="banner"
      >
        <div className="flex items-center w-full justify-between">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="lg:hidden text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            aria-label={t("accessibility.openMenu")}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>

          {/* Navigation Tabs */}
          <nav
            className="hidden md:flex items-center space-x-8"
            aria-label={t("accessibility.navigation")}
          >
            {translatedNavItems.map((item) => (
              <button
                key={item.name}
                className={cn(
                  "text-sm font-medium pb-1 border-b-2 transition-all duration-200",
                  item.active
                    ? "text-[#2563EB] border-blue-600"
                    : "text-slate-500 border-transparent hover:text-slate-800 hover:border-slate-200",
                )}
                aria-current={item.active ? "page" : undefined}
              >
                {item.name}
              </button>
            ))}
          </nav>

          {/* Right Section */}
          <div className="flex items-center space-x-3 md:space-x-5">
            {/* Search */}
            <div className="relative hidden sm:block group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search
                  className="h-4 w-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors"
                  aria-hidden="true"
                />
              </div>
              <Input
                type="search"
                placeholder={t("common.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 md:w-72 h-9 pl-10 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 rounded-full transition-all duration-200"
                aria-label={t("common.search")}
              />
            </div>

            {/* Mobile Search Button */}
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden text-slate-500 hover:text-slate-700"
              aria-label={t("common.search")}
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Button>

            {/* Language Switcher */}
            <AccessibleLanguageSwitcher />

            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-full"
              aria-label={t("nav.notifications")}
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              <span
                className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-white"
                aria-hidden="true"
              ></span>
              <span className="sr-only">
                {t("nav.notificationsCount", {
                  count: 3,
                  defaultValue: "3 new notifications",
                })}
              </span>
            </Button>

            {/* User Profile Dropdown */}
            <div className="pl-2 border-l border-slate-100">
              <UserProfileDropdown />
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
