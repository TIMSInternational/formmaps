/**
 * A real i18next instance over the shipped common.json, for tests that need what the
 * key-lookup mocks elsewhere can't give: interpolation ({{name}}), plurals (_one/_other) and
 * a Spanish render from the same code. Import it in a `jest.mock("react-i18next", ...)`
 * factory via `require`, since mock factories run before imports.
 */
import i18next, { type i18n as I18n } from "i18next";

export function createTestI18n(lng: "en" | "es" = "en"): I18n {
  const inst = i18next.createInstance();
  inst.init({
    lng,
    fallbackLng: "en",
    ns: ["common", "platform_owner", "school_admin"],
    defaultNS: "common",
    resources: {
      en: {
        common: require("@/lib/i18n/locales/en/common.json"),
        platform_owner: require("@/lib/i18n/locales/en/platform_owner.json"),
        school_admin: require("@/lib/i18n/locales/en/school_admin.json"),
      },
      es: {
        common: require("@/lib/i18n/locales/es/common.json"),
        platform_owner: require("@/lib/i18n/locales/es/platform_owner.json"),
        school_admin: require("@/lib/i18n/locales/es/school_admin.json"),
      },
    },
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return inst;
}
