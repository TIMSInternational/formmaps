import { render, screen, waitFor } from "@testing-library/react";
import {
  OriginalPdfEditor,
  bindContactFields,
  bindFields,
  type ContactField,
  type BindTarget,
} from "../OriginalPdfEditor";

function makeHost(runs: string[]): HTMLElement {
  const host = document.createElement("div");
  const layer = document.createElement("div");
  layer.className = "pdf-edit-layer";
  runs.forEach((text) => {
    const span = document.createElement("span");
    span.dataset.orig = text;
    span.textContent = text;
    layer.appendChild(span);
  });
  host.appendChild(layer);
  return host;
}

// The happy path (canvas render + pdf.js TextLayer + in-place editing) is
// verified live in the browser; jsdom can't run canvas/worker. Here we cover
// the user-facing fallback states, which don't need pdf.js.

describe("OriginalPdfEditor", () => {
  it("shows a loading state before the document resolves", () => {
    render(<OriginalPdfEditor loadUrl={() => new Promise(() => {})} />);
    expect(screen.getByText(/loading your document for editing/i)).toBeInTheDocument();
  });

  it("falls back to an error message when there is no original URL", async () => {
    render(<OriginalPdfEditor loadUrl={() => Promise.resolve(null)} />);
    await waitFor(() =>
      expect(screen.getByText(/couldn't load your document for editing/i)).toBeInTheDocument(),
    );
  });

  describe("bindContactFields", () => {
    it("wraps a field value (substring of a run) in an editable [data-field] element", () => {
      const host = makeHost(["(407) 946-3245 | fede@vt.edu | github.com/fede"]);
      const out = new Map<ContactField, HTMLElement>();
      bindContactFields(host, { phone: "(407) 946-3245", email: "fede@vt.edu" }, out);

      const phoneEl = host.querySelector<HTMLElement>('span[data-field="phone"]');
      expect(phoneEl?.textContent).toBe("(407) 946-3245");
      expect(phoneEl?.contentEditable).toBe("true");
      expect(out.get("phone")).toBe(phoneEl);
      // The surrounding run text is preserved.
      expect(host.querySelector(".pdf-edit-layer span")?.textContent).toContain("| fede@vt.edu |");
    });

    it("matches case-insensitively but keeps the document's own casing", () => {
      const host = makeHost(["FEDERICO TAFUR"]);
      const out = new Map<ContactField, HTMLElement>();
      bindContactFields(host, { fullName: "Federico Tafur" }, out);
      expect(out.get("fullName")?.textContent).toBe("FEDERICO TAFUR");
    });

    it("binds a phone whose stored formatting differs, keeping the document's format", () => {
      const host = makeHost(["(407) 946-3245 | fede@vt.edu"]);
      const out = new Map<ContactField, HTMLElement>();
      // stored as digits/dashes only — not a substring of the PDF's "(407) 946-3245"
      bindContactFields(host, { phone: "407-946-3245" }, out);
      const phoneEl = host.querySelector<HTMLElement>('span[data-field="phone"]');
      expect(phoneEl?.textContent).toBe("(407) 946-3245");
      expect(out.get("phone")).toBe(phoneEl);
    });

    it("does not bind a phone whose digits don't match (e.g. corrupted value)", () => {
      const host = makeHost(["(407) 946-3245 | fede@vt.edu"]);
      const out = new Map<ContactField, HTMLElement>();
      // corrupted: 12 digits, not a digit-substring of the PDF's 10
      bindContactFields(host, { phone: "(407) 946-324666" }, out);
      expect(out.has("phone")).toBe(false);
    });

    it("skips fields whose value isn't found in the document", () => {
      const host = makeHost(["Some unrelated heading"]);
      const out = new Map<ContactField, HTMLElement>();
      bindContactFields(host, { phone: "(999) 000-1111" }, out);
      expect(out.has("phone")).toBe(false);
      expect(host.querySelector("[data-field]")).toBeNull();
    });
  });

  describe("bindFields (generic keyed targets — experience)", () => {
    it("binds an experience entry's single-line fields in one run", () => {
      const host = makeHost([
        "NexaDev Software Solutions   Feb 2024 - Feb 2026 Data-Analyst and Lead Developer   San José, Costa Rica",
      ]);
      const out = new Map<string, HTMLElement>();
      const targets: BindTarget[] = [
        { key: "exp.0.company", value: "NexaDev Software Solutions" },
        { key: "exp.0.startDate", value: "Feb 2024" },
        { key: "exp.0.endDate", value: "Feb 2026" },
        { key: "exp.0.jobTitle", value: "Data-Analyst and Lead Developer" },
        { key: "exp.0.location", value: "San José, Costa Rica" },
      ];
      bindFields(host, targets, out);
      expect(out.get("exp.0.company")?.textContent).toBe("NexaDev Software Solutions");
      expect(out.get("exp.0.startDate")?.textContent).toBe("Feb 2024");
      expect(out.get("exp.0.endDate")?.textContent).toBe("Feb 2026");
      expect(out.get("exp.0.jobTitle")?.textContent).toBe("Data-Analyst and Lead Developer");
      expect(out.get("exp.0.location")?.textContent).toBe("San José, Costa Rica");
    });

    it("assigns duplicate identical values to entries in document order", () => {
      const host = makeHost([
        "Company A   San José, Costa Rica",
        "Company B   San José, Costa Rica",
      ]);
      const out = new Map<string, HTMLElement>();
      bindFields(
        host,
        [
          { key: "exp.0.location", value: "San José, Costa Rica" },
          { key: "exp.1.location", value: "San José, Costa Rica" },
        ],
        out,
      );
      // Both bind, and in document order: exp.0 (first occurrence) before exp.1.
      const bound = Array.from(host.querySelectorAll("[data-field]")).map((e) =>
        e.getAttribute("data-field"),
      );
      expect(bound).toEqual(["exp.0.location", "exp.1.location"]);
    });

    it("leaves a contact Map-based call working through the generic path", () => {
      const host = makeHost(["FEDERICO TAFUR | fede@vt.edu"]);
      const out = new Map<ContactField, HTMLElement>();
      bindContactFields(host, { fullName: "FEDERICO TAFUR", email: "fede@vt.edu" }, out);
      expect(out.get("fullName")?.textContent).toBe("FEDERICO TAFUR");
      expect(out.get("email")?.textContent).toBe("fede@vt.edu");
    });
  });
});
