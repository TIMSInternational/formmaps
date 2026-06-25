import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UploadLetterDialog } from "../UploadLetterDialog";
import * as svc from "@/services/recommendationService";

jest.mock("@/services/recommendationService");
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUpload = svc.uploadRecommendationLetter as jest.Mock;

function pickPdf() {
  const input = screen.getByLabelText(/letter pdf/i) as HTMLInputElement;
  const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "letter.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadLetterDialog", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uploads the selected PDF and calls onUploaded + onClose", async () => {
    mockUpload.mockResolvedValue({ id: "r1", status: "submitted" });
    const onUploaded = jest.fn();
    const onClose = jest.fn();
    render(<UploadLetterDialog requestId="r1" open onClose={onClose} onUploaded={onUploaded} />);
    pickPdf();
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith("r1", expect.any(File)));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("does not upload when no file is selected (button disabled)", () => {
    render(<UploadLetterDialog requestId="r1" open onClose={jest.fn()} onUploaded={jest.fn()} />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();
  });

  it("surfaces an error and does not close on upload failure", async () => {
    mockUpload.mockRejectedValue(new Error("Only PDF letters are accepted"));
    const onClose = jest.fn();
    render(<UploadLetterDialog requestId="r1" open onClose={onClose} onUploaded={jest.fn()} />);
    pickPdf();
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<UploadLetterDialog requestId="r1" open={false} onClose={jest.fn()} onUploaded={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("resets selected file when dialog is closed and reopened", () => {
    const { rerender } = render(<UploadLetterDialog requestId="r1" open={false} onClose={jest.fn()} onUploaded={jest.fn()} />);
    // Open the dialog and pick a file
    rerender(<UploadLetterDialog requestId="r1" open onClose={jest.fn()} onUploaded={jest.fn()} />);
    pickPdf();
    expect(screen.getByRole("button", { name: /upload/i })).not.toBeDisabled();
    // Close the dialog
    rerender(<UploadLetterDialog requestId="r1" open={false} onClose={jest.fn()} onUploaded={jest.fn()} />);
    // Reopen — file should be cleared, Upload button disabled again
    rerender(<UploadLetterDialog requestId="r1" open onClose={jest.fn()} onUploaded={jest.fn()} />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();
  });
});
