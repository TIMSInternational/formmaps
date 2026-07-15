import { formatAcceptanceRate } from "@/components/dashboard/University/universityFormat";

describe("formatAcceptanceRate", () => {
  it("renders fraction-stored rates as percentages (0.68 -> 68%)", () => {
    expect(formatAcceptanceRate(0.68)).toBe("68%");
    expect(formatAcceptanceRate("0.7352")).toBe("74%");
    expect(formatAcceptanceRate(1)).toBe("100%");
  });

  it("passes through values already expressed as percentages (legacy rows)", () => {
    expect(formatAcceptanceRate(68)).toBe("68%");
  });

  it("returns em dash for missing values", () => {
    expect(formatAcceptanceRate(null)).toBe("—");
    expect(formatAcceptanceRate(undefined)).toBe("—");
    expect(formatAcceptanceRate(0)).toBe("—");
  });
});
