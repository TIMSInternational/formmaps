import i18n from "../index";

const NS = [
  "common",
  "student",
  "parent",
  "counselor",
  "teacher",
  "school_admin",
  "coach",
  "platform_owner",
];

test("all namespaces registered for en and es", () => {
  for (const ns of NS) {
    expect(i18n.hasResourceBundle("en", ns)).toBe(true);
    expect(i18n.hasResourceBundle("es", ns)).toBe(true);
  }
});

test("en and es have identical key sets per namespace (structural parity)", () => {
  const flat = (o: any, p = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === "object" && v ? flat(v, `${p}${k}.`) : [`${p}${k}`]
    );
  for (const ns of NS) {
    const en = flat(i18n.getResourceBundle("en", ns) || {}).sort();
    const es = flat(i18n.getResourceBundle("es", ns) || {}).sort();
    expect(es).toEqual(en);
  }
});
