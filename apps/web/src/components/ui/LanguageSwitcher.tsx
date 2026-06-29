"use client";

import { useTranslation } from "react-i18next";
import { FiGlobe } from "react-icons/fi";
import { useState } from "react";
import { useSetLanguage } from "@/lib/i18n/useSetLanguage";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const setLanguage = useSetLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: "en", name: t("language.english"), flag: "🇺🇸" },
    { code: "es", name: t("language.spanish"), flag: "🇪🇸" },
  ];

  const currentLanguage =
    languages.find((lang) => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (languageCode: string) => {
    setLanguage(languageCode as "en" | "es");
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer transition p-2 rounded-lg border border-blue-200 hover:border-blue-300"
        title={t("language.switchLanguage")}
      >
        <FiGlobe className="text-xl" />
        <span className="text-sm font-medium">{currentLanguage.flag}</span>
        <span className="text-xs font-semibold ml-1">
          {currentLanguage.code.toUpperCase()}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1">
            {languages.map((language) => (
              <button
                key={language.code}
                onClick={() => handleLanguageChange(language.code)}
                className={`flex items-center w-full px-4 py-2 text-sm hover:bg-gray-100 ${
                  i18n.language === language.code
                    ? "bg-gray-50 text-gray-900"
                    : "text-gray-700"
                }`}
              >
                <span className="mr-3">{language.flag}</span>
                {language.name}
                {i18n.language === language.code && (
                  <span className="ml-auto text-blue-600">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overlay to close dropdown when clicking outside */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}
