// Real i18next (English) so assertions read the rendered copy, not raw keys.
import i18n from "@/lib/i18n";
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PipelineTable } from "../PipelineTable";
import type { PipelineStudent } from "@/services/assessmentCommandService";

// New keys ship through the locale patch (school_admin:pipeline.*); registered here so the test does
// not depend on when that patch lands in the locale files.
i18n.addResource("en", "school_admin", "pipeline.milName", "Labor Intelligence Measurement");

const student: PipelineStudent = {
  id: "s1",
  name: "Ana Pérez",
  email: "ana@example.com",
  gradeLevel: 10,
  pca: { PatternRecognition: "not_started", VerbalReasoning: "done" },
  mil: "not_started",
  eval360: "in_progress",
  eval360Detail: { total: 3, completed: 1 },
  personality: "not_started",
};

function renderTable(onSendReminders = jest.fn()) {
  render(
    <PipelineTable
      pipeline={[student]}
      onSendReminders={onSendReminders}
      onSetup360={jest.fn()}
      isSendingReminders={false}
      isSettingUp360={false}
    />,
  );
  return onSendReminders;
}

describe("PipelineTable", () => {
  it("sends reminders as stable assessment codes, never English display strings", () => {
    const onSendReminders = renderTable();
    const [, rowCheckbox] = screen.getAllByRole("checkbox");
    fireEvent.click(rowCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /Remind \(1\)/ }));

    expect(onSendReminders).toHaveBeenCalledWith(["s1"], ["pca", "mil", "eval360", "personality"]);
    const [, types] = onSendReminders.mock.calls[0];
    expect(types.join(" ")).not.toMatch(/Multiple Intelligence Lens|Personal Competence|Evaluation|Assessment/);
  });

  it("only lists the codes that are actually incomplete", () => {
    const onSendReminders = jest.fn();
    render(
      <PipelineTable
        pipeline={[{ ...student, pca: { PatternRecognition: "done" }, mil: "done", personality: "done" }]}
        onSendReminders={onSendReminders}
        onSetup360={jest.fn()}
        isSendingReminders={false}
        isSettingUp360={false}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Remind \(1\)/ }));
    expect(onSendReminders).toHaveBeenCalledWith(["s1"], ["eval360"]);
  });

  it("names MIL correctly in the student dialog (Labor Intelligence Measurement, not 'Multiple Intelligence Lens')", () => {
    renderTable();
    fireEvent.click(screen.getByText("Ana Pérez"));
    expect(screen.getByText("Labor Intelligence Measurement")).toBeInTheDocument();
    expect(screen.queryByText("Multiple Intelligence Lens")).not.toBeInTheDocument();
  });
});
