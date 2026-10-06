/** Dispatched on window to open the palette (e.g. by the top-bar search button). */
export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

/**
 * Dispatched on window when a modal surface (the command palette) opens, so
 * every open popover (notifications, …) closes and cannot keep focus (#407).
 */
export const CLOSE_POPOVERS_EVENT = "formmaps:close-popovers";
