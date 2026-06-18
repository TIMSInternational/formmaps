import { render, screen, waitFor } from "@testing-library/react";
import { OriginalPdfEditor, bindContactFields, type ContactField } from "../OriginalPdfEditor";

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

    it("skips fields whose value isn't found in the document", () => {
      const host = makeHost(["Some unrelated heading"]);
      const out = new Map<ContactField, HTMLElement>();
      bindContactFields(host, { phone: "(999) 000-1111" }, out);
      expect(out.has("phone")).toBe(false);
      expect(host.querySelector("[data-field]")).toBeNull();
    });
  });
});
