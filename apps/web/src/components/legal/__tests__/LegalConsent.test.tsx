import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { LegalConsent } from "@/components/legal/LegalConsent";
import { EMPTY_LEGAL_CONSENT, type LegalConsentValues, type LegalConsentVariant } from "@/lib/legal/consent";

jest.mock("react-i18next", () => {
  const i18next = require("i18next");
  const inst = i18next.createInstance();
  inst.init({
    lng: "en",
    fallbackLng: "en",
    ns: ["legal"],
    defaultNS: "legal",
    resources: {
      en: { legal: require("@/lib/i18n/locales/en/legal.json") },
      es: { legal: require("@/lib/i18n/locales/es/legal.json") },
    },
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return { useTranslation: (ns: string) => ({ t: inst.getFixedT(null, ns), i18n: inst }) };
});

function Harness(props: {
  variant: LegalConsentVariant;
  isMinor?: boolean;
  isParentPurchaser?: boolean;
  price?: string;
  locale?: "en" | "es";
  onValidity?: (v: boolean) => void;
  initial?: Partial<LegalConsentValues>;
  onValues?: (v: LegalConsentValues) => void;
}) {
  const [values, setValues] = useState<LegalConsentValues>({ ...EMPTY_LEGAL_CONSENT, ...props.initial });
  return (
    <LegalConsent
      variant={props.variant}
      values={values}
      onChange={(v) => {
        setValues(v);
        props.onValues?.(v);
      }}
      onValidityChange={props.onValidity}
      isMinor={props.isMinor}
      isParentPurchaser={props.isParentPurchaser}
      price={props.price}
      locale={props.locale}
    />
  );
}

const boxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];

describe("LegalConsent", () => {
  it("signup (adult): one unchecked required box with links to Terms and Privacy in a new tab", () => {
    render(<Harness variant="signup" />);
    expect(boxes()).toHaveLength(1);
    expect(boxes()[0]).not.toBeChecked();
    expect(boxes()[0]).toBeRequired();
    const terms = screen.getByRole("link", { name: /Terms of Service/ });
    expect(terms).toHaveAttribute("href", "/terms");
    expect(terms).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /Privacy Policy/ })).toHaveAttribute("href", "/privacy");
    // The checkbox is labelled by its sentence (accessible name).
    expect(screen.getByLabelText(/I accept the/)).toBe(boxes()[0]);
  });

  it("signup (minor): adds the parent/guardian box linking to /parental-consent", () => {
    render(<Harness variant="signup" isMinor />);
    expect(boxes()).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Parental Consent/ })).toHaveAttribute("href", "/parental-consent");
  });

  it("reports validity changes: false first, true once every shown box is ticked", () => {
    const onValidity = jest.fn();
    render(<Harness variant="signup" isMinor onValidity={onValidity} />);
    expect(onValidity).toHaveBeenLastCalledWith(false);
    fireEvent.click(boxes()[0]);
    expect(onValidity).toHaveBeenLastCalledWith(false);
    fireEvent.click(boxes()[1]);
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });

  it("checkout-subscription quotes the price and the 7-day trial conversion", () => {
    render(<Harness variant="checkout-subscription" price="$29.99" />);
    expect(boxes()).toHaveLength(1);
    expect(screen.getByLabelText(/renews automatically each month at \$29\.99 until I cancel/)).toBeInTheDocument();
    expect(screen.getByText(/7-day free trial converts to a paid subscription/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Refund & Cancellation Policy/ })).toHaveAttribute("href", "/refunds");
  });

  it("checkout-subscription without a price falls back to the chosen plan's price", () => {
    render(<Harness variant="checkout-subscription" />);
    expect(screen.getByText(/the monthly price of the plan I choose/)).toBeInTheDocument();
  });

  it("checkout-one-time: refund + immediate delivery, plus parent box for a parent purchaser", () => {
    render(<Harness variant="checkout-one-time" isParentPurchaser />);
    expect(boxes()).toHaveLength(3);
    expect(screen.getByLabelText(/immediate delivery of digital content/)).toBeInTheDocument();
  });

  it("clears a parent tick that stops being shown (DOB moved to 18+)", () => {
    const onValues = jest.fn();
    const { rerender } = render(
      <Harness variant="signup" isMinor initial={{ termsAccepted: true, parentConfirmed: true }} onValues={onValues} />,
    );
    expect(onValues).not.toHaveBeenCalled();
    rerender(
      <Harness variant="signup" isMinor={false} initial={{ termsAccepted: true, parentConfirmed: true }} onValues={onValues} />,
    );
    expect(onValues).toHaveBeenLastCalledWith(expect.objectContaining({ termsAccepted: true, parentConfirmed: false }));
  });

  it("renders Spanish copy when locale='es'", () => {
    render(<Harness variant="signup" locale="es" />);
    expect(screen.getByRole("link", { name: /Términos de Servicio/ })).toHaveAttribute("href", "/terms");
  });
});
