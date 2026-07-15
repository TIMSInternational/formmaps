import { escapeHtml, openPrintableReport } from "@/lib/printableReport";

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("Tom & Jerry's")).toBe("Tom &amp; Jerry&#39;s");
  });

  it("renders null/undefined as an empty string", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("openPrintableReport", () => {
  it("escapes the title and student name so a crafted name cannot inject markup", () => {
    let written = "";
    const fakeWindow = {
      document: { write: (s: string) => { written += s; }, close: () => {} },
    };
    const openSpy = jest.spyOn(window, "open").mockReturnValue(fakeWindow as unknown as Window);

    openPrintableReport("Report", `<img src=x onerror="alert(1)">`, [
      { heading: "Section", content: "<p>body</p>" },
    ]);

    expect(written).not.toContain("<img src=x onerror");
    expect(written).toContain("&lt;img src=x onerror");
    expect(written).toContain("window.print()");
    openSpy.mockRestore();
  });
});
