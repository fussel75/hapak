export const PRINT_DISPLAY_MODES = ["normal", "kurzliste", "summenliste", "ohne-preise"] as const;

export type PrintDisplayMode = (typeof PRINT_DISPLAY_MODES)[number];

export function normalizePrintDisplayMode(displayMode?: string | null): PrintDisplayMode {
  return PRINT_DISPLAY_MODES.includes(displayMode as PrintDisplayMode)
    ? (displayMode as PrintDisplayMode)
    : "normal";
}
