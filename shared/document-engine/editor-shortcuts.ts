export type DocumentEditorShortcut =
  | "open_material_catalog"
  | "add_service_position"
  | "open_jumbo_catalog"
  | "add_free_jumbo";

export function resolveDocumentEditorShortcut(
  key: string,
  modifiers: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
): DocumentEditorShortcut | null {
  if (modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey) return null;

  switch (key) {
    case "F2":
      return "open_material_catalog";
    case "F3":
      return "add_service_position";
    case "F4":
      return "open_jumbo_catalog";
    case "F5":
      return "add_free_jumbo";
    default:
      return null;
  }
}
