import { useState, useCallback, useRef } from "react";
import type { SlashMenuItem } from "../components/slash-menu";
import type { EditorItem } from "../types";
import { genClientId, emptyItem } from "../utils";

interface UseSlashMenuParams {
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  focusedRow: number | null;
  setFocusedRow: React.Dispatch<React.SetStateAction<number | null>>;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  documentId: number | undefined;
  addPosition: (type: string, parentJumboIndex?: number) => void;
  recalcTitelsummen: (allItems: EditorItem[]) => EditorItem[];
  setArtikelDialog: React.Dispatch<React.SetStateAction<{ filter: string; parentJumboIndex?: number } | null>>;
  setFloskelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setFloskelTarget?: React.Dispatch<React.SetStateAction<string>>;
  onRequestKiText?: () => void;
  setzeBedarf?: (index: number) => void;
  setzeAlternativ?: (index: number) => void;
}

export function useSlashMenu(params: UseSlashMenuParams) {
  const {
    items,
    setItems,
    focusedRow,
    setFocusedRow,
    setDirty,
    documentId,
    addPosition,
    recalcTitelsummen,
    setArtikelDialog,
    setFloskelOpen,
    setFloskelTarget,
    onRequestKiText,
    setzeBedarf,
    setzeAlternativ,
  } = params;

  const [slashVisible, setSlashVisible] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashAnchorRect, setSlashAnchorRect] = useState<DOMRect | null>(null);
  const slashTriggerIndex = useRef<number | null>(null);
  const slashOriginalValue = useRef<string>("");

  const openSlashMenu = useCallback((index: number, rect: DOMRect, originalValue: string) => {
    slashTriggerIndex.current = index;
    slashOriginalValue.current = originalValue;
    setSlashAnchorRect(rect);
    setSlashFilter("");
    setSlashVisible(true);
  }, []);

  const closeSlashMenu = useCallback((restoreText = true) => {
    if (restoreText && slashTriggerIndex.current !== null) {
      const origVal = slashOriginalValue.current;
      const triggerIdx = slashTriggerIndex.current;
      setItems(prev => {
        const updated = [...prev];
        if (updated[triggerIdx]) {
          updated[triggerIdx] = { ...updated[triggerIdx], title: origVal };
        }
        return updated;
      });
      const row = document.querySelector(`[data-row="${triggerIdx}"]`);
      const titleEl = row?.querySelector('[data-field="title"]') as HTMLElement | null;
      if (titleEl) {
        titleEl.textContent = origVal.replace(/<[^>]*>/g, "");
      }
    }
    setSlashVisible(false);
    setSlashFilter("");
    slashTriggerIndex.current = null;
  }, [setItems]);

  const handleSlashInput = useCallback((index: number, value: string, inputEl: HTMLElement | null) => {
    const plainValue = value.replace(/<[^>]*>/g, "").trim();
    const slashMatch = plainValue.match(/^\/(\S*)$/);
    if (slashMatch) {
      const rect = inputEl?.getBoundingClientRect() || null;
      if (!slashVisible) {
        const currentItem = items[index];
        const prevTitle = currentItem?.title?.replace(/<[^>]*>/g, "").replace(/\/\S*$/, "").trim() || "";
        openSlashMenu(index, rect!, prevTitle);
      }
      setSlashFilter(slashMatch[1]);
      return true;
    } else if (slashVisible) {
      closeSlashMenu(true);
    }
    return false;
  }, [slashVisible, openSlashMenu, closeSlashMenu, items]);

  const handleSlashSelect = useCallback((menuItem: SlashMenuItem) => {
    const insertIndex = slashTriggerIndex.current ?? focusedRow ?? items.length;

    if (slashTriggerIndex.current !== null) {
      const triggerIdx = slashTriggerIndex.current;
      setItems(prev => {
        const updated = [...prev];
        if (updated[triggerIdx]) {
          updated[triggerIdx] = { ...updated[triggerIdx], title: "" };
        }
        return updated;
      });
    }

    closeSlashMenu(false);

    switch (menuItem.id) {
      case "leistung":
      case "lohn":
      case "jumbo":
      case "manuell":
        addPosition(menuItem.id);
        break;
      case "bedarf": {
        const bedarfItem = emptyItem("leistung", documentId || 0, insertIndex + 1, null);
        bedarfItem.positionFlag = "bedarf";
        setItems(prev => {
          const updated = [...prev];
          updated.splice(insertIndex + 1, 0, bedarfItem);
          updated.forEach((it, i) => { it.sortOrder = i; });
          return recalcTitelsummen(updated);
        });
        setFocusedRow(insertIndex + 1);
        setDirty(true);
        break;
      }
      case "alternative": {
        const altItem = emptyItem("leistung", documentId || 0, insertIndex + 1, null);
        altItem.positionFlag = "alternativ";
        setItems(prev => {
          const updated = [...prev];
          updated.splice(insertIndex + 1, 0, altItem);
          updated.forEach((it, i) => { it.sortOrder = i; });
          return recalcTitelsummen(updated);
        });
        setFocusedRow(insertIndex + 1);
        setDirty(true);
        break;
      }
      case "titel": {
        const titleItem = emptyItem("titel", documentId || 0, insertIndex + 1, null);
        const sumItem = emptyItem("titelsumme", documentId || 0, insertIndex + 2, null);
        setItems(prev => {
          const updated = [...prev];
          updated.splice(insertIndex + 1, 0, titleItem, sumItem);
          updated.forEach((it, i) => { it.sortOrder = i; });
          return recalcTitelsummen(updated);
        });
        setFocusedRow(insertIndex + 1);
        setDirty(true);
        break;
      }
      case "freitext": {
        const textItem = emptyItem("freitext", documentId || 0, insertIndex + 1, null);
        setItems(prev => {
          const updated = [...prev];
          updated.splice(insertIndex + 1, 0, textItem);
          updated.forEach((it, i) => { it.sortOrder = i; });
          return recalcTitelsummen(updated);
        });
        setFocusedRow(insertIndex + 1);
        setDirty(true);
        break;
      }
      case "trennlinie": {
        const lineItem = emptyItem("freitext", documentId || 0, insertIndex + 1, null);
        lineItem.title = "———";
        setItems(prev => {
          const updated = [...prev];
          updated.splice(insertIndex + 1, 0, lineItem);
          updated.forEach((it, i) => { it.sortOrder = i; });
          return recalcTitelsummen(updated);
        });
        setFocusedRow(insertIndex + 1);
        setDirty(true);
        break;
      }
      case "zwischensumme": {
        const zsItem = emptyItem("zwischensumme", documentId || 0, insertIndex + 1, null);
        setItems(prev => {
          const updated = [...prev];
          updated.splice(insertIndex + 1, 0, zsItem);
          updated.forEach((it, i) => { it.sortOrder = i; });
          return recalcTitelsummen(updated);
        });
        setFocusedRow(insertIndex + 1);
        setDirty(true);
        break;
      }
      case "floskel":
        setFloskelOpen(true);
        break;
      case "material":
        setArtikelDialog({ filter: "Material" });
        break;
      case "ki":
        onRequestKiText?.();
        break;
    }
  }, [focusedRow, items, documentId, addPosition, recalcTitelsummen, setItems, setFocusedRow, setDirty, setArtikelDialog, setFloskelOpen, setFloskelTarget, onRequestKiText, closeSlashMenu]);

  return {
    slashVisible,
    slashFilter,
    slashAnchorRect,
    openSlashMenu,
    closeSlashMenu,
    handleSlashInput,
    handleSlashSelect,
  };
}
