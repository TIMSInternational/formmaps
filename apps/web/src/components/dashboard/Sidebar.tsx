"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FiHome,
  FiBarChart2,
  FiBookOpen,
  FiBriefcase,
  FiUsers,
  FiSettings,
  FiUser,
  FiLogOut,
} from "react-icons/fi";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { name: t("nav.dashboard", "Dashboard"), icon: FiHome, path: "/dashboard" },
    { name: t("nav.analytics", "Analytics"), icon: FiBarChart2, path: "/dashboard/analytics" },
    { name: t("nav.careerPlanning", "Career Planning"), icon: FiBookOpen, path: "#", hasSubmenu: true },
    {
      name: t("nav.opportunities", "Opportunities"),
      icon: FiBriefcase,
      path: "/dashboard/opportunities",
    },
    {
      name: t("nav.learning", "Learning & Tools"),
      icon: FiUsers,
      path: "/dashboard/learning",
      hasSubmenu: true,
    },
  ];

  const subMenuItems: Record<string, { name: string; path: string }[]> = {
    [t("nav.careerPlanning", "Career Planning")]: [
      { name: t("nav.careerPaths", "Career Paths Explorer"), path: "/dashboard/career-paths" },
      { name: t("nav.university", "University Suggestions"), path: "/dashboard/university" },
      { name: t("nav.assessments", "Assessments"), path: "/dashboard/assessments" },
      { name: t("nav.assessmentTimeline", "Assessment Timeline"), path: "/dashboard/assessments/timeline" },
      { name: t("nav.progressTimeline", "Progress Timeline"), path: "/dashboard/timeline" },
      { name: t("nav.milestones", "Progress Milestones"), path: "/dashboard/progress" },
      { name: t("nav.benchmarks", "Benchmark"), path: "/dashboard/benchmarks" },
    ],
    [t("nav.learning", "Learning & Tools")]: [
      { name: t("nav.courses", "Course Catalog"), path: "/dashboard/courses" },
      { name: t("nav.resume", "Resume Builder"), path: "/dashboard/resume" },
      { name: t("nav.resources", "Resource Library"), path: "/dashboard/resources" },
    ],
    [t("nav.opportunities", "Opportunities")]: [
      { name: t("nav.jobs", "Job Openings"), path: "/dashboard/jobs" },
      { name: t("nav.internships", "Internship Opportunities"), path: "/dashboard/internships" },
      { name: t("nav.mentorship", "Mentorship Matches"), path: "/dashboard/mentorship" },
      { name: t("nav.coaching", "Coaching Sessions"), path: "/dashboard/coaching" },
      { name: t("nav.sessions", "My Sessions"), path: "/dashboard/my-sessions" },
    ],
  };

  return (
    <aside 
      className="w-64 bg-gray-900 text-white h-screen p-6 flex flex-col"
      aria-label={t("nav.mainNavigation", "Main navigation")}
    >
      {/* Logo */}
      <div className="flex items-center space-x-2 mb-10">
        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
          <span className="text-white font-bold" aria-hidden="true">U</span>
        </div>
        <span className="text-xl font-bold">UNIV.365</span>
      </div>

      {/* Navigation */}
      <nav 
        className="flex-1 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
        aria-label={t("nav.mainNavigation", "Main navigation")}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          const Icon = item.icon;

          return (
            <div key={item.name}>
              <Link
                href={item.path}
                className={cn(
                  "flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500",
                  "hover:bg-gray-800",
                  isActive && "bg-blue-600 text-white"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="mr-3 text-lg" aria-hidden="true" />
                <span>{item.name}</span>
                {item.hasSubmenu && <span className="ml-auto" aria-hidden="true">▼</span>}
              </Link>

              {/* Submenu for expanded items */}
              {item.hasSubmenu && subMenuItems[item.name] && (
                <div className="ml-6 mt-2 space-y-1" role="group" aria-label={item.name}>
                  {subMenuItems[item.name].map((subItem) => (
                    <Link
                      key={subItem.path}
                      href={subItem.path}
                      className={cn(
                        "block px-4 py-2 rounded-lg text-sm transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500",
                        pathname === subItem.path ? "text-white font-medium" : "text-gray-400"
                      )}
                      aria-current={pathname === subItem.path ? "page" : undefined}
                    >
                      {subItem.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User & Settings */}
      <div className="pt-6 border-t border-gray-800 space-y-2">
        <Link
          href="/dashboard/profile"
          className="flex items-center px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <FiUser className="mr-3 text-lg" aria-hidden="true" />
          <span>{t("nav.profile", "Profile")}</span>
        </Link>
        <Link
          href="/settings"
          className="flex items-center px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <FiSettings className="mr-3 text-lg" aria-hidden="true" />
          <span>{t("nav.settings", "Settings")}</span>
        </Link>
        <button 
          className="w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-gray-800 transition-colors"
          onClick={() => {}}
        >
          <FiLogOut className="mr-3 text-lg" aria-hidden="true" />
          <span>{t("nav.logout", "Logout")}</span>
        </button>
      </div>
    </aside>
  );
}
