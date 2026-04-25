import { useState, useEffect } from "react";
import { FiBell, FiSearch, FiUser } from "react-icons/fi";
import { getNotifications } from "@/services/coachService";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function TopNav() {
  const [query, setQuery] = useState("");
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const { t } = useTranslation();

  console.log("TopNav rendered with translations");

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const res = await getNotifications();
        const notifications = res?.data || [];
        const unread = notifications.filter((n: any) => !n.read).length;
        setUnreadCount(unread);
      } catch (error) {
        console.warn("Failed to load notifications", error);
      }
    };
    loadNotifications();
  }, []);

  return (
    <header className="flex items-center justify-between bg-white px-6 py-4 shadow">
      <nav className="space-x-4 text-gray-600">
        {[
          t("nav.dashboard"),
          t("nav.analytics"),
          t("nav.careerPaths"),
          t("nav.jobs"),
          t("nav.community"),
        ].map((item) => (
          <a
            key={item}
            href="#"
            className={cn("text-sm font-medium hover:text-gray-900")}
          >
            {item}
          </a>
        ))}
      </nav>
      <div className="flex items-center space-x-4">
        <div className="relative">
          <FiSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            placeholder={t("common.search")}
            aria-label={t("common.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-4 py-1 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button 
          className="relative rounded-full p-1 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        >
          <FiBell className="text-xl text-gray-600" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
        <div className="border-l border-gray-300 h-6 mx-2" aria-hidden="true"></div>
        <button 
          className="rounded-full p-1 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="User profile"
        >
          <FiUser className="text-2xl text-gray-600" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
