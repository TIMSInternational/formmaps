/**
 * Audit D7: the schedule grid saves to the shared AssessmentSchedule store; emptying both dates
 * of a saved window now removes it (it used to be dropped from the save and stay forever).
 */
import { scheduleSaveItems } from "../ScheduleGrid";

describe("scheduleSaveItems", () => {
  const saved = [{ gradeLevel: 9, assessmentType: "PCA" }, { gradeLevel: 10, assessmentType: "MIL" }];

  it("saves complete cells and clears a saved window whose dates were both emptied", () => {
    const items = scheduleSaveItems(saved, {
      "9-PCA": { startDate: "2026-11-01", endDate: "2026-11-15" },
      "10-MIL": { startDate: "", endDate: "" },
    });
    expect(items).toEqual([
      { gradeLevel: 9, assessmentType: "PCA", startDate: "2026-11-01", endDate: "2026-11-15" },
      { gradeLevel: 10, assessmentType: "MIL", clear: true },
    ]);
  });

  it("never clears a half-edited cell or a window that was never saved", () => {
    const items = scheduleSaveItems(saved, {
      "9-PCA": { startDate: "2026-11-01", endDate: "" },
      "11-360": { startDate: "", endDate: "" },
    });
    expect(items).toEqual([]);
  });
});
