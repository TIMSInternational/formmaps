import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const checkoutProps: Array<Record<string, unknown>> = [];
jest.mock("@/components/StripeCheckout", () => ({
  __esModule: true,
  default: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    checkoutProps.push(props);
    return <div data-testid="stripe-checkout">{props.children}</div>;
  },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? ["a", "b"] : k) }),
}));

import { OneTimeReportCard, ONE_TIME_PLAN_ID } from "../OneTimeReportCard";

describe("OneTimeReportCard (#243)", () => {
  beforeEach(() => { checkoutProps.length = 0; });

  it("checks out the one_time catalog plan at $150", () => {
    render(<OneTimeReportCard userId="u1" />);
    const last = checkoutProps[checkoutProps.length - 1];
    expect(last.planId).toBe(ONE_TIME_PLAN_ID);
    expect(ONE_TIME_PLAN_ID).toBe("one_time");
    expect(last.amount).toBe(15000);
  });

  it("stays disabled until every one-time legal box is ticked, then sends the consent payload", () => {
    render(<OneTimeReportCard userId="u1" />);
    expect(checkoutProps[checkoutProps.length - 1].disabled).toBe(true);
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    const last = checkoutProps[checkoutProps.length - 1];
    expect(last.disabled).toBe(false);
    expect(last.legalConsent).toBeTruthy();
  });
});
