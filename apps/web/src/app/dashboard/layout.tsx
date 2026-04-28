"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import { Sidebar as DashboardSidebar } from "./_components/Sidebar";
import { TopNav } from "./_components/TopNav";
import { Button } from "@/components/ui/button";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import { usePermission } from "@/hooks/usePermission";
import { Bell, List as Menu, User } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const { user } = useGlobalStore();
  const { t } = useTranslation();

  // Track page views across dashboard routes
  usePageViewTracking();
  const { isCoach, isSuperAdmin } = usePermission();

  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/dashboard/admin");

  // Admin routes have their own layout with Twenty-style sidebar
  if (isAdminRoute) {
    return <>{children}</>;
  }

  if (isCoach) {
    return (
      <div className="flex min-h-[100dvh] bg-[#eff6ff]">
        <DashboardSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col overflow-hidden lg:ml-0 transition-all duration-300">
          {/* Mobile header */}
          <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-40 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
              aria-label={t("accessibility.openMenu", "Open menu")}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>

            <div className="flex items-center gap-2 ml-auto">
              {/* Notifications */}
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                aria-label={t("nav.notifications", "Notifications")}
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                <span
                  className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"
                  aria-hidden="true"
                ></span>
              </Button>

              {/* User Profile Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    aria-label={t("accessibility.userMenu", "User menu")}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={user.avatar || user.image || undefined}
                      />
                      <AvatarFallback>
                        {user.name?.charAt(0).toUpperCase() || "C"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-xs text-gray-500">
                        {user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => router.push("/dashboard/coaching/profile")}
                  >
                    <User className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("nav.profile", "Profile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/dashboard/coaching/settings")}
                  >
                    {t("nav.settings", "Settings")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      useGlobalStore.getState().logout();
                      router.push("/login");
                    }}
                    className="text-red-600"
                  >
                    {t("common.logout", "Logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto bg-transparent focus:outline-none"
          >
            {children}
          </main>
        </div>
      </div>
    );
  }

  // Student Layout
  return (
    <div className="flex h-[100dvh] bg-slate-50 relative overflow-hidden transition-colors duration-300">
      {/* Subtle grid texture — no gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#94a3b8_0.5px,transparent_0.5px),linear-gradient(to_bottom,#94a3b8_0.5px,transparent_0.5px)] bg-[size:32px_32px] opacity-[0.02]" />
      </div>

      <div className="flex flex-1 z-10 w-full relative h-[100dvh]">
        <DashboardSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col overflow-hidden lg:ml-0 transition-all duration-300 relative h-full">
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto focus:outline-none relative z-10 "
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
