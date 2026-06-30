import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { resolveDocumentEditorShortcut } from "@shared/document-engine/editor-shortcuts";
import type { EditorItem } from "../types";
import { remapClipboardItems, expandSelectionWithChildren } from "../utils";

interface UseKeyboardShortcutsParams {
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  focusedRow: number | null;
  setFocusedRow: React.Dispatch<React.SetStateAction<number | null>>;
  selectedRows: Set<number>;
  setSelectedRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  clipboard: EditorItem[] | null;
  setClipboard: React.Dispatch<React.SetStateAction<EditorItem[] | null>>;
  setArtikelDialog: React.Dispatch<React.SetStateAction<{ filter: string; parentJumboIndex?: number } | null>>;
  setEigenschaftenItem: React.Dispatch<React.SetStateAction<{ index: number; item: Partial<EditorItem> } | null>>;
  setLohnOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLohnTargetJumbo: React.Dispatch<React.SetStateAction<number | null>>;
  addPosition: (type: string, parentJumboIndex?: number, insertAfterIndex?: number) => void;
  removeItem: (index: number) => Promise<void>;
  copyItem: (index: number) => void;
  moveItem: (index: number, direction: -1 | 1) => void;
  selectAll: () => void;
  recalcTitelsummen: (allItems: EditorItem[]) => EditorItem[];
  saveMutate: () => void;
  undo: () => void;
  redo: () => void;
  confirmDeleteLines?: boolean | null;
  onRequestDeleteSelected?: () => void;
}

export function useKeyboardShortcuts(params: UseKeyboardShortcutsParams) {
  const {
    items,
    setItems,
    focusedRow,
    setFocusedRow,
    selectedRows,
    setSelectedRows,
    setDirty,
    clipboard,
    setClipboard,
    setArtikelDialog,
    setEigenschaftenItem,
    setLohnOpen,
    setLohnTargetJumbo,
    addPosition,
    removeItem,
    copyItem,
    moveItem,
    selectAll,
    recalcTitelsummen,
    saveMutate,
    undo,
    redo,
    confirmDeleteLines,
    onRequestDeleteSelected,
  } = params;
  const { toast } = useToast();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const inInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;
      const isAltArrow = e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown");
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault();
        redo();
        return;
      }
      if (
        inInput &&
        !["F2", "F3", "F4", "F5", "F6"].includes(e.key) &&
        !(e.ctrlKey && ["d", "m", "s"].includes(e.key)) &&
        !isAltArrow
      )
        return;
      const shortcut = resolveDocumentEditorShortcut(e.key, e);
      if (shortcut) {
        e.preventDefault();
        if (shortcut === "open_material_catalog") {
          setArtikelDialog({ filter: "Material" });
        } else if (shortcut === "add_service_position") {
          addPosition("leistung");
        } else if (shortcut === "open_jumbo_catalog") {
          setArtikelDialog({ filter: "Jumbo" });
        } else if (shortcut === "add_free_jumbo") {
          addPosition("jumbo");
        }
        return;
      } else if (e.key === "F6") {
        e.preventDefault();
        if (focusedRow !== null && items[focusedRow])
          setEigenschaftenItem({ index: focusedRow, item: items[focusedRow] });
      } else if (e.key === "Escape") {
        if (selectedRows.size > 0) {
          e.preventDefault();
          setSelectedRows(new Set());
        }
      } else if (e.key === "Delete" && selectedRows.size > 0) {
        e.preventDefault();
        if (confirmDeleteLines !== false) {
          onRequestDeleteSelected?.();
          return;
        }
        const expanded = expandSelectionWithChildren(selectedRows, items);
        setItems(prev => {
          const u = prev.filter((_, i) => !expanded.has(i));
          u.forEach((it, i) => { it.sortOrder = i; });
          return recalcTitelsummen(u);
        });
        setSelectedRows(new Set());
        setFocusedRow(null);
        setDirty(true);
      } else if (e.ctrlKey && e.key === "a") {
        const active = document.activeElement;
        const isInInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || (active as HTMLElement).isContentEditable);
        if (!isInInput) {
          e.preventDefault();
          selectAll();
        }
      } else if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        if (focusedRow !== null && items[focusedRow]) {
          copyItem(focusedRow);
          toast({ title: "Position dupliziert" });
        }
      } else if (e.ctrlKey && e.key === "m") {
        e.preventDefault();
        addPosition("manuell");
      } else if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        saveMutate();
      } else if (e.ctrlKey && e.key === "x") {
        const isEditing = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || (document.activeElement as HTMLElement).isContentEditable);
        if (isEditing) return;
        e.preventDefault();
        if (selectedRows.size > 0) {
          const expanded = expandSelectionWithChildren(selectedRows, items);
          const sorted = [...expanded].sort((a, b) => a - b);
          setClipboard(sorted.map((i) => ({ ...items[i] })));
          setItems((prev) => {
            const u = prev.filter((_, i) => !expanded.has(i));
            u.forEach((it, i) => { it.sortOrder = i; });
            return recalcTitelsummen(u);
          });
          setSelectedRows(new Set());
          setFocusedRow(null);
          setDirty(true);
          toast({ title: `${sorted.length} Position${sorted.length > 1 ? "en" : ""} ausgeschnitten` });
        } else if (focusedRow !== null && items[focusedRow]) {
          setClipboard([{ ...items[focusedRow] }]);
          removeItem(focusedRow);
        }
      } else if (e.ctrlKey && e.key === "c") {
        const isEditing = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || (document.activeElement as HTMLElement).isContentEditable);
        if (isEditing) return;
        e.preventDefault();
        if (selectedRows.size > 0) {
          const expanded = expandSelectionWithChildren(selectedRows, items);
          const sorted = [...expanded].sort((a, b) => a - b);
          setClipboard(sorted.map((i) => ({ ...items[i] })));
          toast({ title: `${sorted.length} Position${sorted.length > 1 ? "en" : ""} kopiert` });
        } else if (focusedRow !== null && items[focusedRow]) {
          setClipboard([{ ...items[focusedRow] }]);
          toast({ title: "Position kopiert" });
        }
      } else if (e.ctrlKey && e.key === "v") {
        const isEditing = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || (document.activeElement as HTMLElement).isContentEditable);
        if (isEditing) return;
        e.preventDefault();
        if (clipboard && clipboard.length > 0) {
          const insertAfter = selectedRows.size > 0
            ? Math.max(...selectedRows)
            : focusedRow !== null
              ? focusedRow
              : items.length - 1;
          const at = insertAfter + 1;
          const newItems = remapClipboardItems(clipboard);
          newItems.forEach((it, ci) => { it.sortOrder = at + ci; });
          setItems((prev) => {
            const u = [...prev];
            u.splice(at, 0, ...newItems);
            u.forEach((it, i) => {
              it.sortOrder = i;
            });
            return recalcTitelsummen(u);
          });
          setFocusedRow(at + newItems.length - 1);
          setSelectedRows(new Set());
          setDirty(true);
          toast({ title: `${newItems.length} Position${newItems.length > 1 ? "en" : ""} eingefügt` });
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [addPosition, saveMutate, focusedRow, items, selectAll, selectedRows, recalcTitelsummen, clipboard, setClipboard, removeItem, copyItem, moveItem, toast, setItems, setFocusedRow, setSelectedRows, setDirty, setArtikelDialog, setEigenschaftenItem, setLohnOpen, setLohnTargetJumbo, onRequestDeleteSelected]);
}
