// Real i18next (English) so assertions read the rendered copy, not raw keys.
import "@/lib/i18n";
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PipelineTable } from "../PipelineTable";
import type { PipelineStudent } from "@/services/assessmentCommandService";


const student: PipelineStudent = {
  id: "s1",
  name: "Ana Pérez",
  email: "ana@example.com",
  gradeLevel: 10,
  lia: { PatternRecognition: "not_started", VerbalReasoning: "done" },
  pcaStatus: "not_started",
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
        pipeline={[{ ...student, lia: { PatternRecognition: "done" }, pcaStatus: "done", personality: "done" }]}
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

  // Audit D1: the five subtests are the MIL / LIA; the PCA is the DISC survey, shown on its own.
  it("labels the subtests MIL / LIA and shows the real PCA separately", () => {
    renderTable();
    expect(screen.getByRole("columnheader", { name: "MIL / LIA" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "PCA" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "MIL" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ana Pérez"));
    expect(screen.getByText(/MIL \/ LIA Assessment \(1\/2\)/)).toBeInTheDocument();
    expect(screen.getByText("Personal Competence Analysis (DISC)")).toBeInTheDocument();
    expect(screen.queryByText("Multiple Intelligence Lens")).not.toBeInTheDocument();
  });

  it("asks for a PCA reminder when only the PCA is missing, and a MIL reminder when only the LIA is", () => {
    const onSendReminders = jest.fn();
    const done = { ...student, eval360: "done" as const, eval360Detail: { total: 1, completed: 1 }, personality: "done" as const };
    render(
      <PipelineTable
        pipeline={[
          { ...done, id: "a", name: "Only PCA missing", lia: { PatternRecognition: "done" }, pcaStatus: "in_progress" },
          { ...done, id: "b", name: "Only LIA missing", lia: { PatternRecognition: "in_progress" }, pcaStatus: "done" },
        ]}
        onSendReminders={onSendReminders}
        onSetup360={jest.fn()}
        isSendingReminders={false}
        isSettingUp360={false}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Remind \(1\)/ }));
    expect(onSendReminders).toHaveBeenLastCalledWith(["a"], ["pca"]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    fireEvent.click(screen.getByRole("button", { name: /Remind \(1\)/ }));
    expect(onSendReminders).toHaveBeenLastCalledWith(["b"], ["mil"]);
  });
});
