import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

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

const NAMESPACES = [
  "common",
  "student",
  "parent",
  "counselor",
  "teacher",
  "school_admin",
  "coach",
  "platform_owner",
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
  },
};

i18n
  .use(LanguageDetector)
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
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
  });

export default i18n;
