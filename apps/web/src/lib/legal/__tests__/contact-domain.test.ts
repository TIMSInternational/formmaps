/** Legal/privacy contact addresses are on formmaps.com; the old formmaps.ai inboxes must not come back. */
import fs from "node:fs";
import path from "node:path";
import { LEGAL_CONTACT } from "../company";

const LOCALES = path.resolve(__dirname, "../../i18n/locales");

describe("legal contact addresses", () => {
  it("company contacts use @formmaps.com", () => {
    const emails = Object.entries(LEGAL_CONTACT).filter(([k]) => /Email$/.test(k)).map(([, v]) => String(v));
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) expect(e).toMatch(/@formmaps\.com$/);
  });

  it("no locale string mentions an @formmaps.ai address", () => {
    for (const lang of fs.readdirSync(LOCALES)) {
      for (const f of fs.readdirSync(path.join(LOCALES, lang))) {
        expect(fs.readFileSync(path.join(LOCALES, lang, f), "utf8")).not.toMatch(/@formmaps\.ai\b/);
      }
    }
  });
});
