import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ResumePreviewWithToggle } from "../ResumePreviewWithToggle";

describe("ResumePreviewWithToggle", () => {
  it("defaults to the Original tab and embeds the signed PDF URL when hasOriginal", async () => {
    const loadUrl = jest.fn().mockResolvedValue("https://signed.example/x.pdf");
    render(
      <ResumePreviewWithToggle hasOriginal loadOriginalUrl={loadUrl} edited={<div>EDITED CONTENT</div>} />,
    );
    await waitFor(() => expect(loadUrl).toHaveBeenCalled());
    const frame = await screen.findByTitle("Original resume document");
    expect(frame).toHaveAttribute("src", "https://signed.example/x.pdf");
  });

  it("defaults to Edited and hides the Original tab when there is no original", () => {
    render(
      <ResumePreviewWithToggle hasOriginal={false} loadOriginalUrl={jest.fn()} edited={<div>EDITED CONTENT</div>} />,
    );
    expect(screen.getByText("EDITED CONTENT")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /original/i })).not.toBeInTheDocument();
  });

  it("switches to Edited when the Edited tab is clicked", async () => {
    render(
      <ResumePreviewWithToggle hasOriginal loadOriginalUrl={jest.fn().mockResolvedValue("https://signed.example/x.pdf")} edited={<div>EDITED CONTENT</div>} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /edited/i }));
    expect(screen.getByText("EDITED CONTENT")).toBeInTheDocument();
  });

  it("shows an error + fallback to Edited when the original fails to load", async () => {
    render(
      <ResumePreviewWithToggle hasOriginal loadOriginalUrl={jest.fn().mockResolvedValue(null)} edited={<div>EDITED CONTENT</div>} />,
    );
    expect(await screen.findByText(/couldn't load the original/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view edited version/i }));
    expect(screen.getByText("EDITED CONTENT")).toBeInTheDocument();
  });
});
