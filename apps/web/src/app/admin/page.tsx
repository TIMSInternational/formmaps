"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export default function AdminRedirectPage() {
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    // Redirect to the admin dashboard
    router.replace("/dashboard/admin");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-red-50">
      <div className="text-center">
        <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-xl">A</span>
        </div>
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-700 font-medium">{t("admin.redirecting")}</p>
        <p className="text-gray-500 text-sm mt-2">
          {t("admin.accessRequired")}
        </p>
      </div>
    </div>
  );
}
