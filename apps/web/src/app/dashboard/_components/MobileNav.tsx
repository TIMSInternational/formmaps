"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, GraduationCap, FileText, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StudentSidebar } from "./StudentSidebar";

const navItems = [
  { href: "/dashboard", icon: Home, label: "nav.home" },
  { href: "/dashboard/career-paths", icon: Compass, label: "nav.careers" },
  { href: "/dashboard/university", icon: GraduationCap, label: "nav.universities" },
  { href: "/dashboard/assessments", icon: FileText, label: "nav.assessments" },
];

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Bottom tab bar — visible only on mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--admin-bg-panel)] border-t border-[var(--admin-border-panel)] safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  active ? "text-[var(--admin-accent-blue)]" : "text-[var(--admin-font-tertiary)]"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t(item.label)}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[var(--admin-font-tertiary)]"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] font-medium">{t("nav.more")}</span>
          </button>
        </div>
      </nav>

      {/* Full sidebar overlay on mobile */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[260px] animate-in slide-in-from-left duration-200">
            <StudentSidebar />
          </div>
        </div>
      )}
    </>
  );
}
