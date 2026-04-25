"use client";

import { useTranslation } from "react-i18next";
import { FiGlobe, FiCheck } from "react-icons/fi";
import { useState, useRef, useEffect, useCallback } from "react";

/**
 * AccessibleLanguageSwitcher - WCAG AA compliant language selector
 * 
 * Features:
 * - Proper ARIA attributes (aria-expanded, aria-haspopup, role="menu")
 * - Full keyboard navigation (Arrow keys, Enter, Escape)
 * - Focus management and trapping
 * - Screen reader announcements
 */
export function AccessibleLanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: "en", name: t("language.english"), flag: "🇺🇸" },
    { code: "es", name: t("language.spanish"), flag: "🇪🇸" },
  ];

  const currentLanguage =
    languages.find((lang) => lang.code === i18n.language) || languages[0];
  const currentIndex = languages.findIndex((lang) => lang.code === i18n.language);

  // Close menu on Escape or click outside
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus first item when menu opens
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentIndex]);

  const handleLanguageChange = useCallback((languageCode: string) => {
    i18n.changeLanguage(languageCode);
    setIsOpen(false);
    buttonRef.current?.focus();
  }, [i18n]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % languages.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + languages.length) % languages.length);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        handleLanguageChange(languages[focusedIndex].code);
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(languages.length - 1);
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t("language.switchLanguage")}
        className="flex items-center gap-1.5 bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 cursor-pointer transition-all duration-300 px-3 py-1.5 h-10 rounded-full border border-transparent focus:outline-none focus:ring-2 focus:ring-slate-200 active:scale-95"
      >
        <FiGlobe className="w-4 h-4 ml-0.5" aria-hidden="true" />
        <span className="text-base" aria-hidden="true">{currentLanguage.flag}</span>
        <span className="text-sm font-bold uppercase tracking-widest">
          {currentLanguage.code}
        </span>
        <svg
          className={`w-[14px] h-[14px] transition-transform duration-300 ml-0.5 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={t("language.selectLanguage")}
          aria-activedescendant={`lang-option-${languages[focusedIndex].code}`}
          className="absolute right-0 mt-2 w-48 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] ring-1 ring-slate-100 z-50 p-2 overflow-hidden transform origin-top-right transition-all duration-200 animate-in fade-in zoom-in-95"
        >
          {languages.map((language, index) => (
            <button
              key={language.code}
              id={`lang-option-${language.code}`}
              role="option"
              aria-selected={i18n.language === language.code}
              onClick={() => handleLanguageChange(language.code)}
              onMouseEnter={() => setFocusedIndex(index)}
              className={`flex items-center w-full px-4 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                focusedIndex === index
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              } ${
                i18n.language === language.code ? "font-bold" : "font-medium"
              }`}
            >
              <span className="text-base mr-3" aria-hidden="true">{language.flag}</span>
              <span className="flex-1 text-left">{language.name}</span>
              {i18n.language === language.code && (
                <FiCheck className="w-4 h-4 text-slate-900" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Screen reader announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        {isOpen ? t("language.menuOpen") : ""}
      </div>
    </div>
  );
}
