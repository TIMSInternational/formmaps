import { render, screen, waitFor } from "@testing-library/react";
import { OriginalPdfEditor } from "../OriginalPdfEditor";

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
});
