/**
 * Audit F: generated alerts were stored in English, so Spanish staff read English. They now carry a
 * key + params in `details`; the web renders them in the viewer's language. Free text stays as stored.
 */
import { createTestI18n } from "@/test-utils/realI18n";
import { alertI18nOf, localizeAlert } from "../localizeAlert";

const details = (key: string, params: Record<string, string | number> = {}) => JSON.stringify({ i18n: { key, params } });

describe("localizeAlert", () => {
  const es = createTestI18n("es");
  const en = createTestI18n("en");

  it("renders a generated alert in Spanish for a Spanish viewer", () => {
    const a = { title: "Low GPA", message: "GPA is 1.20 — below the 2.0 threshold.", details: details("low_gpa", { gpa: "1.20" }) };
    expect(localizeAlert(a, es.t, "es")).toEqual({ title: "Promedio bajo", message: "El promedio es 1.20, por debajo del mínimo de 2.0." });
    expect(localizeAlert(a, en.t, "en")).toEqual({ title: "Low GPA", message: "GPA is 1.20 — below the 2.0 threshold." });
  });

  it("fills every param and formats the follow-up date for the viewer", () => {
    const credit = localizeAlert({ title: "x", message: "x", details: details("credit_deficit", { earned: 3, expected: 18, grade: 12 }) }, es.t, "es");
    expect(credit.message).toBe("Tiene 3 de los ~18 créditos esperados para el grado 12.");
    const due = localizeAlert({ title: "x", message: "x", details: details("overdue_followup", { date: "2026-06-01" }) }, es.t, "es");
    expect(due.message).toMatch(/^Un seguimiento del orientador vencía el 1 jun 2026/);
  });

  it("keeps free text and older rows exactly as stored", () => {
    expect(localizeAlert({ title: "Call home", message: "Parent asked for a call", details: null }, es.t, "es")).toEqual({ title: "Call home", message: "Parent asked for a call" });
    expect(localizeAlert({ title: null, message: "Only a message", details: "plain words" }, es.t, "es")).toEqual({ title: "Only a message", message: "Only a message" });
    expect(localizeAlert({ title: "T", message: "M", details: details("unknown_key") }, es.t, "es")).toEqual({ title: "T", message: "M" });
  });

  it("accepts details already parsed into an object", () => {
    expect(alertI18nOf({ i18n: { key: "stalled_assessments", params: {} } })).toEqual({ key: "stalled_assessments", params: {} });
    expect(alertI18nOf("{bad json")).toBeNull();
  });
});
