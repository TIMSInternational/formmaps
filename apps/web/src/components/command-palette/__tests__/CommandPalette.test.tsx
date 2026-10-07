import { act, render, screen, fireEvent, waitFor, waitForElementToBeRemoved } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/lib/i18n";
import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from "@/components/command-palette/CommandPalette";
import { CLOSE_POPOVERS_EVENT } from "@/components/command-palette/events";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

let mockRole = "student";
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: (sel?: (s: unknown) => unknown) => {
    const state = { user: { id: "stu-1", role: mockRole }, language: "english" };
    return sel ? sel(state) : state;
  },
}));

const mockListApplications = jest.fn();
jest.mock("@/services/applicationService", () => ({
  listApplications: () => mockListApplications(),
}));
const mockListCourses = jest.fn();
jest.mock("@/services/courseService", () => ({
  listCourses: () => mockListCourses(),
}));
const mockListCareers = jest.fn();
const mockFavorites = jest.fn();
jest.mock("@/services/careerService", () => ({
  listCareers: () => mockListCareers(),
  getFavoritesForUser: () => mockFavorites(),
}));

// jsdom lacks ResizeObserver/scrollIntoView, which cmdk uses
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockRole = "student";
  mockListApplications.mockResolvedValue([
    { id: "app-1", name: "Universidad de Costa Rica - Medicina", type: "university", column: "applying", createdAt: "" },
    { id: "app-2", name: "TEC - Ingeniería en Computación", type: "university", column: "researching", createdAt: "" },
  ]);
  mockListCourses.mockResolvedValue({ courses: [{ id: "c-1", title: "Introducción a la Biología", provider: "Coursera" }] });
  mockListCareers.mockResolvedValue({ careers: [{ id: "car-1", title: { en: "Medicine", es: "Medicina" } }, { id: "car-2", title: { en: "Law", es: "Derecho" } }] });
  mockFavorites.mockResolvedValue({ favorites: ["car-1"] });
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

function renderPalette() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommandPalette />
    </QueryClientProvider>,
  );
}

const PLACEHOLDER = "Search pages, applications, careers, courses…";

describe("CommandPalette", () => {
  it("opens on Cmd+K with the search input focused (#407)", () => {
    renderPalette();
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    expect(input).toHaveFocus();
  });

  it("closes other popovers when it opens, and takes focus from them (#407)", () => {
    const onClose = jest.fn();
    window.addEventListener(CLOSE_POPOVERS_EVENT, onClose);
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    renderPalette();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveFocus();
    window.removeEventListener(CLOSE_POPOVERS_EVENT, onClose);
    other.remove();
  });

  it("opens on the global open-command-palette event (used by the top-bar search button)", () => {
    renderPalette();
    fireEvent(window, new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
  });

  it("closes on Escape (the ESC hint must not be decorative)", async () => {
    renderPalette();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    // AnimatePresence exit-animates before unmounting
    await waitForElementToBeRemoved(() => screen.queryByPlaceholderText(PLACEHOLDER));
  });

  it("uses neutral descriptions and LIA naming from the assessment source of truth (#398)", () => {
    renderPalette();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByText("Your career matches")).toBeInTheDocument();
    expect(screen.queryByText(/top 10|10 best/i)).toBeNull();
    expect(screen.getByText("PCA, LIA, 360°, and Personality")).toBeInTheDocument();
    expect(screen.queryByText(/MIL/)).toBeNull();
    // one "start" action per instrument
    for (const name of ["PCA Assessment", "LIA Assessment", "360° Evaluation", "Personality Assessment"]) {
      expect(screen.getByText(`Start ${name}`)).toBeInTheDocument();
    }
  });

  it("renders in Spanish", async () => {
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    renderPalette();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText("Buscar páginas, postulaciones, carreras, cursos…")).toBeInTheDocument();
    expect(screen.getByText("Tus coincidencias de carrera")).toBeInTheDocument();
    expect(screen.getByText("PCA, LIA, 360° y Personalidad")).toBeInTheDocument();
  });

  it("finds the student's own application accent/case-insensitively and navigates to it (#407)", async () => {
    renderPalette();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "medicina" } });
    const app = await screen.findByText("Universidad de Costa Rica - Medicina");
    expect(screen.queryByText(/No results found/)).toBeNull();
    fireEvent.click(app);
    expect(push).toHaveBeenCalledWith("/dashboard/applications/app-1");
  });

  it("searches saved careers and courses without accents", async () => {
    renderPalette();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(input, { target: { value: "introduccion biologia" } });
    fireEvent.click(await screen.findByText("Introducción a la Biología"));
    expect(push).toHaveBeenCalledWith("/dashboard/learning/courses?course=c-1");

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "medicine" } });
    fireEvent.click(await screen.findByText("Medicine"));
    expect(push).toHaveBeenCalledWith("/careers/car-1");
    // an unsaved, unmatched career is not offered
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "law" } });
    await waitFor(() => expect(screen.getByText("No results found.")).toBeInTheDocument());
  });

  it("does not fetch student content for non-students", async () => {
    mockRole = "counselor";
    renderPalette();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "medicina" } });
    await waitFor(() => expect(screen.getByText("No results found.")).toBeInTheDocument());
    expect(mockListApplications).not.toHaveBeenCalled();
  });
});
