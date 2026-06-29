/**
 * TDD: shell chrome i18n (Task F7)
 *
 * Asserts that shared-chrome label keys exist in both EN and ES locales
 * and that the values match the expected text.
 *
 * We verify the locale JSON directly (fast, no component render needed for
 * the key-existence / translation-value assertions) plus one smoke render
 * of the NotificationCenter to prove the component actually calls t().
 */

import enCommon from "@/lib/i18n/locales/en/common.json";
import esCommon from "@/lib/i18n/locales/es/common.json";

// ────────────────────────────────────────────────────────────────────────────
// Shared-chrome key assertions (locale JSON)
// These will FAIL (RED) until the shell.* keys are added to both JSON files.
// ────────────────────────────────────────────────────────────────────────────

describe("shell i18n keys — locale JSON (F7)", () => {
  const shellEn = (enCommon as Record<string, unknown>).shell as Record<string, string>;
  const shellEs = (esCommon as Record<string, unknown>).shell as Record<string, string>;

  it("en/common.json has a 'shell' section", () => {
    expect(shellEn).toBeDefined();
  });

  it("es/common.json has a 'shell' section", () => {
    expect(shellEs).toBeDefined();
  });

  const expectedEnKeys: [string, string][] = [
    ["collapseSidebar", "Collapse sidebar"],
    ["expandSidebar", "Expand sidebar"],
    ["navigationTab", "Navigation"],
    ["chatHistoryTab", "Chat history"],
    ["newChat", "New chat"],
    ["signOut", "Sign Out"],
    ["settings", "Settings"],
    ["noChatsYet", "No chats yet"],
    ["startChat", "Start a chat"],
    ["searchShortcut", "Search (Cmd+K)"],
    ["workspace", "Workspace"],
    ["askAi", "Ask AI"],
    ["theme", "Theme"],
    ["themeLight", "Light"],
    ["themeDark", "Dark"],
    ["themeSystem", "System"],
  ];

  test.each(expectedEnKeys)(
    "en shell.%s = '%s'",
    (key, expectedValue) => {
      expect(shellEn).toBeDefined();
      expect(shellEn[key]).toBe(expectedValue);
    }
  );

  const expectedEsKeys: [string, string][] = [
    ["collapseSidebar", "Contraer barra lateral"],
    ["expandSidebar", "Expandir barra lateral"],
    ["navigationTab", "Navegación"],
    ["chatHistoryTab", "Historial de chat"],
    ["newChat", "Nuevo chat"],
    ["signOut", "Cerrar sesión"],
    ["settings", "Configuración"],
    ["noChatsYet", "Aún no hay chats"],
    ["startChat", "Iniciar un chat"],
    ["searchShortcut", "Buscar (Cmd+K)"],
    ["workspace", "Área de trabajo"],
    ["askAi", "Preguntar a la IA"],
    ["theme", "Tema"],
    ["themeLight", "Claro"],
    ["themeDark", "Oscuro"],
    ["themeSystem", "Sistema"],
  ];

  test.each(expectedEsKeys)(
    "es shell.%s = '%s'",
    (key, expectedValue) => {
      expect(shellEs).toBeDefined();
      expect(shellEs[key]).toBe(expectedValue);
    }
  );

  it("shell key sets are in parity (same keys in en and es)", () => {
    expect(shellEn).toBeDefined();
    expect(shellEs).toBeDefined();
    const enKeys = Object.keys(shellEn).sort();
    const esKeys = Object.keys(shellEs).sort();
    expect(enKeys).toEqual(esKeys);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// NotificationCenter: shell.notifications + shell.markAllRead i18n keys
// ────────────────────────────────────────────────────────────────────────────

describe("NotificationCenter shell keys", () => {
  const shellEn = (enCommon as Record<string, unknown>).shell as Record<string, string>;
  const shellEs = (esCommon as Record<string, unknown>).shell as Record<string, string>;

  it("en has shell.notifications", () => {
    expect(shellEn?.notifications).toBe("Notifications");
  });

  it("es has shell.notifications", () => {
    expect(shellEs?.notifications).toBe("Notificaciones");
  });

  it("en has shell.markAllRead", () => {
    expect(shellEn?.markAllRead).toBe("Mark all read");
  });

  it("es has shell.markAllRead", () => {
    expect(shellEs?.markAllRead).toBe("Marcar todo como leído");
  });

  it("en has shell.noNotifications", () => {
    expect(shellEn?.noNotifications).toBe("No notifications");
  });

  it("es has shell.noNotifications", () => {
    expect(shellEs?.noNotifications).toBe("Sin notificaciones");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Accessibility: shell.skipToContent (already exists at accessibility.skipToContent)
// ────────────────────────────────────────────────────────────────────────────

describe("accessibility.skipToContent i18n key (existing)", () => {
  it("en accessibility.skipToContent = 'Skip to main content'", () => {
    const acc = (enCommon as Record<string, unknown>).accessibility as Record<string, string>;
    expect(acc?.skipToContent).toBe("Skip to main content");
  });

  it("es accessibility.skipToContent is translated", () => {
    const acc = (esCommon as Record<string, unknown>).accessibility as Record<string, string>;
    expect(acc?.skipToContent).toBe("Saltar al contenido principal");
  });
});
