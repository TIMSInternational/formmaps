import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { browserLanguageDetector } from "./browserLanguage";

// Common namespace (all existing keys — preserves every t('key') call)
import enCommon from "./locales/en/common.json";
import esCommon from "./locales/es/common.json";

// Role namespaces (empty until Phase R fills them)
import enStudent from "./locales/en/student.json";
import esStudent from "./locales/es/student.json";
import enParent from "./locales/en/parent.json";
import esParent from "./locales/es/parent.json";
import enCounselor from "./locales/en/counselor.json";
import esCounselor from "./locales/es/counselor.json";
import enTeacher from "./locales/en/teacher.json";
import esTeacher from "./locales/es/teacher.json";
import enSchoolAdmin from "./locales/en/school_admin.json";
import esSchoolAdmin from "./locales/es/school_admin.json";
import enCoach from "./locales/en/coach.json";
import esCoach from "./locales/es/coach.json";
import enPlatformOwner from "./locales/en/platform_owner.json";
import esPlatformOwner from "./locales/es/platform_owner.json";
// Legal pages chrome + consent checkbox copy (the documents themselves live in src/lib/legal/content)
import enLegal from "./locales/en/legal.json";
import esLegal from "./locales/es/legal.json";

const NAMESPACES = [
  "common",
  "student",
  "parent",
  "counselor",
  "teacher",
  "school_admin",
  "coach",
  "platform_owner",
  "legal",
] as const;

const resources = {
  en: {
    common: enCommon,
    student: enStudent,
    parent: enParent,
    counselor: enCounselor,
    teacher: enTeacher,
    school_admin: enSchoolAdmin,
    coach: enCoach,
    platform_owner: enPlatformOwner,
    legal: enLegal,
  },
  es: {
    common: esCommon,
    student: esStudent,
    parent: esParent,
    counselor: esCounselor,
    teacher: esTeacher,
    school_admin: esSchoolAdmin,
    coach: esCoach,
    platform_owner: esPlatformOwner,
    legal: esLegal,
  },
};

// A stored choice (localStorage) wins; otherwise the browser's languages, Spanish when it is neither
// Spanish nor English (browserLanguage.ts). The stock "navigator" + "htmlTag" detectors fell through to
// English (fallbackLng / the root layout's lang="en") while every email defaults to Spanish.
const languageDetector = new LanguageDetector();
languageDetector.addDetector(browserLanguageDetector);

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns: [...NAMESPACES],
    defaultNS: "common",
    fallbackNS: "common",
    fallbackLng: "en",
    debug: false,

    interpolation: {
      escapeValue: false,
    },

    detection: {
      order: ["localStorage", browserLanguageDetector.name],
      caches: ["localStorage"],
    },
  });

export default i18n;
