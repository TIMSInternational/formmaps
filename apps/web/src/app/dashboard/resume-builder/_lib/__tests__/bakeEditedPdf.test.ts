import { mapRectToPdf } from "../bakeEditedPdf";

describe("mapRectToPdf", () => {
  it("divides screen px by scale and flips Y to a bottom-left origin", () => {
    // A 792pt-tall (US Letter) page rendered at scale 2 → 1584px tall.
    // A run 100px from the left, 200px from the top, 60×24px.
    const out = mapRectToPdf({
      relX: 100,
      top: 200,
      width: 60,
      height: 24,
      scale: 2,
      pageHeightPt: 792,
    });
    expect(out.x).toBe(50); // 100 / 2
    expect(out.width).toBe(30); // 60 / 2
    expect(out.height).toBe(12); // 24 / 2
    // top 200px = 100pt from the top; bottom-left y = 792 - 100 - 12 = 680
    expect(out.y).toBe(680);
  });

  it("maps a run at the very top of the page near the page top in PDF space", () => {
    const out = mapRectToPdf({ relX: 0, top: 0, width: 50, height: 20, scale: 1, pageHeightPt: 792 });
    expect(out.x).toBe(0);
    // y = 792 - 0 - 20
    expect(out.y).toBe(772);
  });

  it("is scale-invariant for the same physical position", () => {
    const a = mapRectToPdf({ relX: 150, top: 300, width: 90, height: 36, scale: 3, pageHeightPt: 792 });
    const b = mapRectToPdf({ relX: 50, top: 100, width: 30, height: 12, scale: 1, pageHeightPt: 792 });
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
    expect(a.width).toBeCloseTo(b.width);
    expect(a.height).toBeCloseTo(b.height);
  });
});
