/**
 * Ported tims LIATimer regression tests: the countdown must keep ticking
 * every wall-clock second while the parent re-renders with fresh callback
 * identities (rapid answering), warnings fire once at the right thresholds,
 * and the timeout never double-fires (incl. StrictMode expired-mount).
 */
import { StrictMode } from "react";
import { render, screen, act } from "@testing-library/react";
import { LIATimer, TimerWarningToast } from "../LIATimer";

describe("LIATimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps ticking every second while parent re-renders with fresh callback identities (rapid answering)", () => {
    const startedAt = new Date(Date.now());
    const { rerender } = render(
      <LIATimer totalSeconds={240} startedAt={startedAt} onTimeout={() => {}} onWarning={() => {}} />,
    );
    expect(screen.getByText("4:00")).toBeInTheDocument();

    // Simulate a candidate answering faster than once per second: each answer
    // re-renders the page and hands the timer brand-new callback references.
    for (let i = 0; i < 10; i++) {
      act(() => {
        jest.advanceTimersByTime(400);
      });
      rerender(
        <LIATimer totalSeconds={240} startedAt={startedAt} onTimeout={() => {}} onWarning={() => {}} />,
      );
    }

    // 4 seconds of wall-clock time have passed; the display must reflect it.
    expect(screen.getByText("3:56")).toBeInTheDocument();
  });

  it("does not fire the 10s warning while plenty of time remains", () => {
    const onWarning = jest.fn();
    const startedAt = new Date(Date.now());
    render(
      <LIATimer totalSeconds={240} startedAt={startedAt} onTimeout={() => {}} onWarning={onWarning} />,
    );

    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("fires the 30s and 10s warnings exactly once, at the right thresholds", () => {
    const onWarning = jest.fn();
    const startedAt = new Date(Date.now());
    render(
      <LIATimer totalSeconds={60} startedAt={startedAt} onTimeout={() => {}} onWarning={onWarning} />,
    );

    act(() => {
      jest.advanceTimersByTime(30_000); // remaining = 30
    });
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning).toHaveBeenCalledWith(30);

    act(() => {
      jest.advanceTimersByTime(20_000); // remaining = 10
    });
    expect(onWarning).toHaveBeenCalledTimes(2);
    expect(onWarning).toHaveBeenLastCalledWith(10);

    act(() => {
      jest.advanceTimersByTime(5_000); // remaining = 5, no re-fire
    });
    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it("fires warnings even when the parent re-renders continuously with fresh callbacks", () => {
    const calls: number[] = [];
    const startedAt = new Date(Date.now());
    const { rerender } = render(
      <LIATimer totalSeconds={40} startedAt={startedAt} onTimeout={() => {}} onWarning={(s) => calls.push(s)} />,
    );

    for (let i = 0; i < 80; i++) {
      act(() => {
        jest.advanceTimersByTime(500);
      });
      rerender(
        <LIATimer totalSeconds={40} startedAt={startedAt} onTimeout={() => {}} onWarning={(s) => calls.push(s)} />,
      );
    }

    expect(calls).toEqual([30, 10]);
  });

  it("calls onTimeout exactly once when time runs out, even across re-renders", () => {
    let timeouts = 0;
    const startedAt = new Date(Date.now());
    const { rerender } = render(
      <LIATimer totalSeconds={3} startedAt={startedAt} onTimeout={() => { timeouts += 1; }} />,
    );

    for (let i = 0; i < 12; i++) {
      act(() => {
        jest.advanceTimersByTime(500);
      });
      rerender(
        <LIATimer totalSeconds={3} startedAt={startedAt} onTimeout={() => { timeouts += 1; }} />,
      );
    }

    expect(timeouts).toBe(1);
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("fires onTimeout once when mounted onto an already-expired subtest under StrictMode", () => {
    const onTimeout = jest.fn();
    // Subtest expired 5s ago (e.g. candidate reloaded mid-session).
    const startedAt = new Date(Date.now() - 65_000);
    render(
      <StrictMode>
        <LIATimer totalSeconds={60} startedAt={startedAt} onTimeout={onTimeout} />
      </StrictMode>,
    );

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    // StrictMode mounts effects twice in dev; the timeout must not double-fire.
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});

describe("TimerWarningToast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("auto-closes after 3s even while the parent re-renders with fresh onClose identities", () => {
    const closes: number[] = [];
    const { rerender } = render(
      <TimerWarningToast secondsLeft={10} onClose={() => closes.push(1)} />,
    );

    // Rapid answering re-renders the parent every 400ms; the 3s auto-close
    // must not be reset by the new inline onClose reference each time.
    for (let i = 0; i < 6; i++) {
      act(() => {
        jest.advanceTimersByTime(400);
      });
      rerender(<TimerWarningToast secondsLeft={10} onClose={() => closes.push(1)} />);
    }
    act(() => {
      jest.advanceTimersByTime(700); // 3.1s total
    });

    expect(closes).toEqual([1]);
  });
});
