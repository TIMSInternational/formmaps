/**
 * The 360° evaluator page must render fully in Spanish (a Playwright run in `es` showed the
 * back link, the self-evaluation gate and the invitation dialogs still in English).
 */
import { render, screen } from "@testing-library/react";
import EvaluatorsPage from "../page";
import { useEvaluationGroups } from "@/hooks/useAssessmentQueries";

let mockLang: "en" | "es" = "es";
jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const insts = { en: createTestI18n("en"), es: createTestI18n("es") };
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => ({ t: insts[mockLang].t.bind(insts[mockLang]), i18n: insts[mockLang] }),
  };
});
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ user: { id: "u1", name: "Ana", email: "ana@example.com" }, language: "es" }),
}));
jest.mock("@/hooks/useAssessmentQueries", () => ({ useEvaluationGroups: jest.fn() }));
jest.mock("@/services/evaluationService", () => ({ getSelfEvaluationUrl: jest.fn() }));
jest.mock("../_components/useEvaluatorManagement", () => ({
  useEvaluatorManagement: () => ({
    evaluatorGroups: [
      { id: "parent", name: "Padre/madre", type: "parent", minRequired: 1, maxAllowed: 2, evaluators: [] },
      { id: "teacher", name: "Profesor", type: "teacher", minRequired: 1, maxAllowed: 3, evaluators: [] },
      { id: "sibling_friend", name: "Hermano/a o amigo/a", type: "sibling_friend", minRequired: 1, maxAllowed: 3, evaluators: [] },
    ],
    showAddModal: false, setShowAddModal: jest.fn(),
    selectedGroup: "", setSelectedGroup: jest.fn(),
    newEvaluator: { name: "", email: "", phone: "", relationship: "" }, setNewEvaluator: jest.fn(),
    errors: {}, apiEvaluators: [], loading: false, selectedEvaluator: null,
    showDropdown: null, setShowDropdown: jest.fn(),
    setEmailSendMode: jest.fn(), setSmsSendMode: jest.fn(),
    selectedEvaluatorsForEmail: [], setSelectedEvaluatorsForEmail: jest.fn(),
    selectedEvaluatorsForSMS: [], setSelectedEvaluatorsForSMS: jest.fn(),
    // Both selector dialogs open so their title/description/send label render.
    showEmailSelector: true, setShowEmailSelector: jest.fn(),
    showSMSSelector: true, setShowSMSSelector: jest.fn(),
    getTotalEvaluators: () => 0, areAllGroupsComplete: () => false,
    openAddModal: jest.fn(), handleAddEvaluator: jest.fn(), handleRemoveEvaluator: jest.fn(),
    handleEditEvaluator: jest.fn(), handleResendEmailLink: jest.fn(), handleResendPhoneLink: jest.fn(),
    handleSendEmailInvitations: jest.fn(), handleSendSMSInvitations: jest.fn(), handleCancelModal: jest.fn(),
  }),
}));

const mockGroups = useEvaluationGroups as jest.Mock;
beforeEach(() => { mockLang = "es"; });

it("renders the self-evaluation gate in Spanish", () => {
  mockGroups.mockReturnValue({ data: [], isLoading: false });
  render(<EvaluatorsPage />);
  expect(screen.getByText("Evaluaciones")).toBeInTheDocument();
  expect(screen.getByText("Primero completa tu autoevaluación")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Comenzar autoevaluación/ })).toBeInTheDocument();
  expect(screen.queryByText(/Complete Your Self-Evaluation|Before inviting|^Assessments$/)).not.toBeInTheDocument();
});

it("renders the evaluator page and both invitation dialogs in Spanish", () => {
  mockGroups.mockReturnValue({
    data: [{ relation: "Self", groupType: "Self", isEvaluationCompleted: true }],
    isLoading: false,
  });
  render(<EvaluatorsPage />);
  expect(screen.getByText("Evaluación 360°")).toBeInTheDocument();
  expect(screen.getByText(/Ahora invita a evaluadores/)).toBeInTheDocument();
  expect(screen.getByText("0 evaluadores en 3 grupos")).toBeInTheDocument();
  expect(screen.getByText("Selecciona los evaluadores para invitar por correo")).toBeInTheDocument();
  expect(screen.getByText("Selecciona los evaluadores para invitar por SMS")).toBeInTheDocument();
  expect(screen.getByText(/Enviar correos/)).toBeInTheDocument();
  expect(screen.getByText(/Enviar SMS/)).toBeInTheDocument();
  expect(screen.getByText("Agregar evaluador (Padre/madre)")).toBeInTheDocument();
  expect(
    screen.queryByText(/360° Evaluation|Now invite|Select Evaluators|Send Emails|Send SMS|Not Sent|Incomplete/)
  ).not.toBeInTheDocument();
});
