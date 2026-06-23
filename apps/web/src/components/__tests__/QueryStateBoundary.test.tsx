import { render, screen, fireEvent } from "@testing-library/react";
import QueryStateBoundary from "../QueryStateBoundary";

describe("QueryStateBoundary", () => {
  it("(a) loading fallback wins over isError and isEmpty (role=status)", () => {
    render(
      <QueryStateBoundary isLoading isError isEmpty>
        <span>children</span>
      </QueryStateBoundary>
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("children")).toBeNull();
  });

  it("(b) error state shows role=alert when isError && !isLoading and NOT the children", () => {
    render(
      <QueryStateBoundary isLoading={false} isError>
        <span>children</span>
      </QueryStateBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("children")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("(c) onRetry fires from the default error 'Try again' button", () => {
    const onRetry = jest.fn();
    render(
      <QueryStateBoundary isLoading={false} isError onRetry={onRetry}>
        <span>children</span>
      </QueryStateBoundary>
    );
    fireEvent.click(screen.getByText(/try again/i));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("(d) empty fallback shows when isEmpty && !isLoading && !isError", () => {
    render(
      <QueryStateBoundary isLoading={false} isError={false} isEmpty emptyFallback={<span>no data here</span>}>
        <span>children</span>
      </QueryStateBoundary>
    );
    expect(screen.getByText("no data here")).toBeInTheDocument();
    expect(screen.queryByText("children")).toBeNull();
  });

  it("(e) children render when isLoading=false, isError=false, isEmpty=false", () => {
    render(
      <QueryStateBoundary isLoading={false} isError={false}>
        <span>children</span>
      </QueryStateBoundary>
    );
    expect(screen.getByText("children")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("(f) custom loadingFallback and errorFallback are honored", () => {
    const { rerender } = render(
      <QueryStateBoundary
        isLoading
        isError={false}
        loadingFallback={<span>custom loading</span>}
      >
        <span>children</span>
      </QueryStateBoundary>
    );
    expect(screen.getByText("custom loading")).toBeInTheDocument();

    rerender(
      <QueryStateBoundary
        isLoading={false}
        isError
        errorFallback={<span>custom error</span>}
      >
        <span>children</span>
      </QueryStateBoundary>
    );
    expect(screen.getByText("custom error")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
