import { LEGAL_DOCUMENTS } from "@/lib/legal/content";
import { LEGAL_DOCUMENT_KEYS, LEGAL_DOCUMENT_PATHS } from "@/lib/legal/versions";
import { parseInline, isExternalHref } from "@/lib/legal/inline";
import { formatLegalDate } from "@/lib/legal/dates";
import type { LegalDocumentContent } from "@/lib/legal/types";

const allText = (doc: LegalDocumentContent): string[] => [
  doc.title,
  doc.summary,
  ...doc.sections.flatMap((s) => [
    s.title,
    ...s.blocks.flatMap((b) =>
      b.type === "p" ? [b.text] : b.type === "ul" ? b.items : [...b.head, ...b.rows.flat()],
    ),
  ]),
];

describe.each(LEGAL_DOCUMENT_KEYS)("legal document %s", (key) => {
  const en = LEGAL_DOCUMENTS.en[key];
  const es = LEGAL_DOCUMENTS.es[key];

  it("exists in both languages with the right key and locale", () => {
    expect(en.key).toBe(key);
    expect(es.key).toBe(key);
    expect(en.locale).toBe("en");
    expect(es.locale).toBe("es");
  });

  it("has the same section anchors and block shapes in EN and ES", () => {
    expect(es.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));
    const shape = (d: LegalDocumentContent) =>
      d.sections.map((s) =>
        s.blocks.map((b) =>
          b.type === "p" ? "p" : b.type === "ul" ? `ul${b.items.length}` : `t${b.head.length}x${b.rows.length}`,
        ),
      );
    expect(shape(es)).toEqual(shape(en));
  });

  it("has unique section anchors", () => {
    const ids = en.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never says draft / counsel review on a public page", () => {
    for (const t of [...allText(en), ...allText(es)]) {
      expect(t).not.toMatch(/\bdraft\b|borrador|counsel review|legal review|revisi[oó]n legal|placeholder|lorem/i);
      expect(t).not.toMatch(/TODO|TBD|XXX/);
    }
  });

  it("only links to known legal pages, https or mailto", () => {
    const known = new Set(Object.values(LEGAL_DOCUMENT_PATHS));
    for (const t of [...allText(en), ...allText(es)]) {
      for (const tok of parseInline(t)) {
        if (tok.kind !== "link") continue;
        if (isExternalHref(tok.href)) expect(tok.href).toMatch(/^(https:\/\/|mailto:)/);
        else expect(known.has(tok.href)).toBe(true);
      }
    }
  });

  it("has no unbalanced inline markup", () => {
    for (const t of [...allText(en), ...allText(es)]) {
      const leftover = parseInline(t)
        .filter((x) => x.kind === "text")
        .map((x) => x.text)
        .join("");
      expect(leftover).not.toMatch(/\*\*|\]\(/);
    }
  });
});

describe("parseInline", () => {
  it("splits bold and links out of plain text", () => {
    expect(parseInline("Read **this** and [the policy](/privacy) now.")).toEqual([
      { kind: "text", text: "Read " },
      { kind: "bold", text: "this" },
      { kind: "text", text: " and " },
      { kind: "link", text: "the policy", href: "/privacy" },
      { kind: "text", text: " now." },
    ]);
  });
  it("returns one text token when there is no markup", () => {
    expect(parseInline("plain")).toEqual([{ kind: "text", text: "plain" }]);
  });
  it("classifies hrefs", () => {
    expect(isExternalHref("/terms")).toBe(false);
    expect(isExternalHref("mailto:x@y.z")).toBe(true);
  });
});

describe("formatLegalDate", () => {
  it("formats the effective date in both languages without a time-zone shift", () => {
    expect(formatLegalDate("2026-10-15", "en")).toBe("October 15, 2026");
    expect(formatLegalDate("2026-10-15", "es")).toBe("15 de octubre de 2026");
  });
});

describe("parseTagged", () => {
  it("extracts <tag>label</tag> pieces", () => {
    const { parseTagged } = jest.requireActual("@/lib/legal/inline");
    expect(parseTagged("I accept the <terms>Terms</terms> and <privacy>Privacy</privacy>.")).toEqual([
      { kind: "text", text: "I accept the " },
      { kind: "tag", tag: "terms", text: "Terms" },
      { kind: "text", text: " and " },
      { kind: "tag", tag: "privacy", text: "Privacy" },
      { kind: "text", text: "." },
    ]);
  });
});
