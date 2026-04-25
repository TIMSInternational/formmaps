"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  User,
  Settings,
  LogOut,
  UserCircle,
  Bell,
  HelpCircle,
  Shield,
  Languages,
} from "lucide-react";

export function UserProfileDropdown() {
  const router = useRouter();
  const { user, logout, setLanguage, language } = useGlobalStore();
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Sync language from global store to i18n on mount
  useEffect(() => {
    const i18nLanguage = language === "spanish" ? "es" : "en";
    if (i18n.language !== i18nLanguage) {
      i18n.changeLanguage(i18nLanguage);
    }
  }, [language, i18n]);

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    // Also save to global store for persistence
    const globalStoreLanguage = languageCode === "es" ? "spanish" : "english";
    setLanguage(globalStoreLanguage);
  };

  const languages = [
    { code: "en", name: t("language.english"), flag: "🇺🇸" },
    { code: "es", name: t("language.spanish"), flag: "🇪🇸" },
  ];

  const currentLanguage =
    languages.find((lang) => lang.code === i18n.language) || languages[0];

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserDisplayName = () => {
    return user.name || user.email || "User";
  };

  const getUserRole = () => {
    return user.role || "Member";
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 w-10 rounded-full hover:bg-slate-100/80 transition-all duration-300 ease-out active:scale-95 border border-transparent hover:border-slate-200 shadow-sm"
        >
          <Avatar className="h-10 w-10 shadow-sm border border-slate-200/50">
            {(user.avatar?.length || user.image?.length) ? (
              <AvatarImage
                src={user.avatar || user.image || undefined}
                alt={getUserDisplayName()}
              />
            ) : null}
            <AvatarFallback className="bg-slate-900 text-white font-serif font-bold tracking-tight">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {getUserDisplayName()}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
            <p className="text-xs leading-none text-muted-foreground capitalize">
              {getUserRole()}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push("/dashboard/profile")}
          className="cursor-pointer"
        >
          <UserCircle className="mr-2 h-4 w-4" />
          <span>{t("nav.profile")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push("/dashboard/settings")}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>{t("nav.settings")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push("/dashboard/notifications")}
          className="cursor-pointer"
        >
          <Bell className="mr-2 h-4 w-4" />
          <span>{t("nav.notifications")}</span>
        </DropdownMenuItem>
        {user.role && ["admin", "super_admin"].includes(user.role) && (
          <DropdownMenuItem
            onClick={() => router.push("/dashboard/admin")}
            className="cursor-pointer"
          >
            <Shield className="mr-2 h-4 w-4" />
            <span>{t("nav.adminPanel")}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => router.push("/dashboard/help")}
          className="cursor-pointer"
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>{t("nav.help")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="mr-2 h-4 w-4" />
            <span>
              {currentLanguage.flag} {currentLanguage.name}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {languages.map((language) => (
              <DropdownMenuItem
                key={language.code}
                onClick={() => handleLanguageChange(language.code)}
                className={i18n.language === language.code ? "bg-accent" : ""}
              >
                <span className="mr-2">{language.flag}</span>
                {language.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t("nav.logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
