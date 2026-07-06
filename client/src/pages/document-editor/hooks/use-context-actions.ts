import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import type { EditorItem } from "../types";
import { emptyItem, genClientId, expandSelectionWithChildren, remapClipboardItems, getVortextEndIdx } from "../utils";

interface UseContextActionsArgs {
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  focusedRow: number | null;
  setFocusedRow: (idx: number | null) => void;
  clipboard: EditorItem[] | null;
  setClipboard: React.Dispatch<React.SetStateAction<EditorItem[] | null>>;
  selectedRows: Set<number>;
  setSelectedRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  setDirty: (v: boolean) => void;
  documentId: number | null | undefined;
  recalcTitelsummen: (items: EditorItem[]) => EditorItem[];
  removeItem: (idx: number) => void;
  addPosition: (type: string, parentJumboIndex?: number, afterIdx?: number) => void;
  getTitleBlockIndices: (idx: number) => number[];
  setArtikelDialog: (v: any) => void;
  setIdsDialog: (v: any) => void;
  setFloskelOpen: (v: boolean) => void;
  setFloskelTarget: (v: string) => void;
  setLohnOpen: (v: boolean) => void;
  setLohnTargetJumbo: (v: number | null) => void;
  setEigenschaftenItem: (v: any) => void;
  setPriceDialogItem: (v: any) => void;
  setProzentDialog: (v: boolean) => void;
  setzeAlternativ: (idx: number) => void;
  setzeBedarf: (idx: number) => void;
  updateMaterialPrices: () => void;
  confirmDeleteLines?: boolean | null;
  onRequestDeleteSelected?: () => void;
}

export function useContextActions({
  items,
  setItems,
  focusedRow,
  setFocusedRow,
  clipboard,
  setClipboard,
  selectedRows,
  setSelectedRows,
  setDirty,
  documentId,
  recalcTitelsummen,
  removeItem,
  addPosition,
  getTitleBlockIndices,
  setArtikelDialog,
  setIdsDialog,
  setFloskelOpen,
  setFloskelTarget,
  setLohnOpen,
  setLohnTargetJumbo,
  setEigenschaftenItem,
  setPriceDialogItem,
  setProzentDialog,
  setzeAlternativ,
  setzeBedarf,
  updateMaterialPrices,
  confirmDeleteLines,
  onRequestDeleteSelected,
}: UseContextActionsArgs) {
  const { toast } = useToast();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [insertIdx, setInsertIdx] = useState<number | null>(null);
  const AFTER_TOTALS_SENTINEL = 999999;
  const BEFORE_TABLE_SENTINEL = 999998;
  const afterTotalsAllowedTypes = new Set(["freitext", "text", "floskel", "trennlinie", "skonto"]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
      if (selectedRows.size > 0 && selectedRows.has(index)) {
        setInsertIdx(Math.max(...selectedRows));
      } else {
        setInsertIdx(index);
      }
    },
    [selectedRows],
  );

  const handleAreaContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-row]")) return;
      e.preventDefault();
      const clickY = e.clientY;
      let bestIdx = items.length - 1;
      const rows = document.querySelectorAll("[data-row]");
      let foundBelow = false;
      rows.forEach((row) => {
        const rect = row.getBoundingClientRect();
        const idx = parseInt(row.getAttribute("data-row") || "-1", 10);
        if (idx < 0) return;
        if (!foundBelow && rect.top > clickY) {
          bestIdx = idx - 1;
          foundBelow = true;
        }
      });
      if (!foundBelow && rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const lastIdx = parseInt(lastRow.getAttribute("data-row") || "-1", 10);
        if (lastIdx >= 0) bestIdx = lastIdx;
      }
      if (bestIdx < 0 && items.length > 0) {
        const vEnd = getVortextEndIdx(items);
        bestIdx = vEnd > 0 ? vEnd - 1 : -1;
      }
      setContextMenu({ x: e.clientX, y: e.clientY });
      setInsertIdx(bestIdx);
    },
    [items],
  );

  const handleBeforeTableContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
      setInsertIdx(BEFORE_TABLE_SENTINEL);
    },
    [],
  );

  const handleAfterTotalsContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
      setInsertIdx(AFTER_TOTALS_SENTINEL);
    },
    [],
  );

  const handleContextInsert = useCallback(
    (type: string) => {
      const rawIdx = insertIdx !== null ? insertIdx : items.length - 1;
      const isAfterTotals = rawIdx === AFTER_TOTALS_SENTINEL;
      const isBeforeTable = rawIdx === BEFORE_TABLE_SENTINEL;
      if (isAfterTotals && !afterTotalsAllowedTypes.has(type) && !type.startsWith("_")) {
        toast({
          title: "Nach der Summe nicht moeglich",
          description: "Hier sind nur Nachtext, Floskel, Trennlinie oder Skonto vorgesehen.",
          variant: "destructive",
        });
        setContextMenu(null);
        return;
      }
      if (isBeforeTable) {
        const vEnd = getVortextEndIdx(items);
        if (type === "freitext" || type === "text") {
          const ni = emptyItem("freitext", documentId || 0, vEnd);
          const u = [...items];
          u.splice(vEnd, 0, ni);
          u.forEach((it, i) => { it.sortOrder = i; });
          setItems(recalcTitelsummen(u));
          setFocusedRow(vEnd);
          setDirty(true);
        } else if (type === "trennlinie") {
          const ni = emptyItem("freitext", documentId || 0, vEnd);
          ni.title = "———";
          const u = [...items];
          u.splice(vEnd, 0, ni);
          u.forEach((it, i) => { it.sortOrder = i; });
          setItems(recalcTitelsummen(u));
          setFocusedRow(vEnd);
          setDirty(true);
        } else if (type === "floskel") {
          setFocusedRow(vEnd > 0 ? vEnd - 1 : -1);
          setFloskelOpen(true);
        }
        setContextMenu(null);
        return;
      }
      const idx = isAfterTotals ? items.length - 1 : rawIdx < 0 ? -1 : rawIdx;
      const insertAt = isAfterTotals ? items.length : idx + 1;
      if (type === "_eigenschaften") {
        if (items[idx]) setEigenschaftenItem({ index: idx, item: items[idx] });
      } else if (type === "_kalkulation") {
        if (items[idx]) setPriceDialogItem({ index: idx, item: items[idx] });
      } else if (type === "_seitenwechsel") {
        if (items[idx]) {
          setItems((prev) => {
            const u = [...prev];
            u[idx] = { ...u[idx], pageBreakBefore: !u[idx].pageBreakBefore };
            return u;
          });
          setDirty(true);
        }
      } else if (type === "material") {
        setArtikelDialog({ filter: "Material" });
      } else if (type === "jumbo") {
        setArtikelDialog({ filter: "Jumbo" });
      } else if (type === "jumbo_blank") {
        setTimeout(() => addPosition("jumbo", undefined, idx), 0);
      } else if (type === "ids_warenkorb" || type === "ids_suche") {
        setIdsDialog({});
      } else if (type === "floskel") {
        setFloskelTarget("position");
        setFloskelOpen(true);
      } else if (type === "lohn") {
        setLohnOpen(true);
        setLohnTargetJumbo(null);
      } else if (type === "prozent_zuschlag" || type === "prozent_gesamt" || type === "prozent_lohn_mat" || type === "prozent_material" || type === "prozent_lohn") {
        setProzentDialog(true);
      } else if (type === "_alternativ") {
        setzeAlternativ(idx);
      } else if (type === "_bedarf") {
        setzeBedarf(idx);
      } else if (type === "_materialpreise") {
        updateMaterialPrices();
      } else if (type === "trennlinie") {
        setTimeout(() => {
          const ni = emptyItem("freitext", documentId || 0, insertAt);
          ni.title = "———";
          if (isAfterTotals) ni.afterTotals = true;
          const u = [...items];
          u.splice(insertAt, 0, ni);
          u.forEach((it, i) => { it.sortOrder = i; });
          setItems(recalcTitelsummen(u));
          setFocusedRow(insertAt);
          setDirty(true);
        }, 0);
      } else if (type === "fahrtkosten" || type === "frachtkosten") {
        setTimeout(() => {
          const ni = emptyItem("manuell", documentId || 0, insertAt);
          ni.title = type === "fahrtkosten" ? "Fahrtkosten" : "Frachtkosten";
          ni.unit = "pau";
          ni.quantity = "1.000";
          const u = [...items];
          u.splice(insertAt, 0, ni);
          u.forEach((it, i) => { it.sortOrder = i; });
          setItems(recalcTitelsummen(u));
          setFocusedRow(insertAt);
          setDirty(true);
        }, 0);
      } else if (type === "_deselect") {
        setSelectedRows(new Set());
      } else if (type === "_delete_title") {
        const indices = getTitleBlockIndices(idx);
        if (indices.length > 0) {
          setItems(prev => {
            const removeSet = new Set(indices);
            const u = prev.filter((_, i) => !removeSet.has(i));
            u.forEach((it, i) => { it.sortOrder = i; });
            return recalcTitelsummen(u);
          });
          setSelectedRows(new Set());
          setFocusedRow(null);
          setDirty(true);
          toast({ title: `Titel-Block (${indices.length} Pos.) gelöscht` });
        }
      } else if (type === "_copy_title") {
        const indices = getTitleBlockIndices(idx);
        if (indices.length > 0) {
          const copied = indices.map(i => items[i]).filter(Boolean);
          const insertAt = Math.max(...indices) + 1;
          setItems(prev => {
            const u = [...prev];
            const newItems = copied.map((src, ci) => ({
              ...src,
              id: undefined,
              _clientId: genClientId(),
              sortOrder: insertAt + ci,
            }));
            u.splice(insertAt, 0, ...newItems);
            u.forEach((it, i) => { it.sortOrder = i; });
            return recalcTitelsummen(u);
          });
          setFocusedRow(insertAt);
          setDirty(true);
          toast({ title: `Titel-Block (${indices.length} Pos.) kopiert` });
        }
      } else if (type === "_delete_selected") {
        if (selectedRows.size > 0) {
          if (confirmDeleteLines !== false) {
            onRequestDeleteSelected?.();
            setContextMenu(null);
            return;
          }
          setItems(prev => {
            const u = prev.filter((_, i) => !selectedRows.has(i));
            u.forEach((it, i) => { it.sortOrder = i; });
            return recalcTitelsummen(u);
          });
          setSelectedRows(new Set());
          setFocusedRow(null);
          setDirty(true);
        }
      } else if (type === "_delete") {
        removeItem(idx);
      } else if (type === "manuell_material" || type === "manuell_leistung" || type === "manuell_lohn") {
        const label = type === "manuell_material" ? "Material" : type === "manuell_leistung" ? "Leistung" : "Lohn";
        setTimeout(() => {
          const ni = emptyItem("manuell", documentId || 0, insertAt);
          ni.title = label;
          const u = [...items];
          u.splice(insertAt, 0, ni);
          u.forEach((it, i) => { it.sortOrder = i; });
          setItems(recalcTitelsummen(u));
          setFocusedRow(insertAt);
          setDirty(true);
        }, 0);
      } else if (type === "jumbo_material") {
        if (items[idx]) {
          setArtikelDialog({ filter: "Material", parentJumboIndex: idx });
        }
      } else if (type === "jumbo_leistung") {
        setFocusedRow(idx);
        setTimeout(() => addPosition("leistung", idx), 0);
      } else if (type === "jumbo_lohn") {
        setLohnOpen(true);
        setLohnTargetJumbo(idx);
      } else if (type === "jumbo_manuell") {
        setFocusedRow(idx);
        setTimeout(() => addPosition("manuell", idx), 0);
      } else if (type === "_cut") {
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
        } else if (items[idx]) {
          setClipboard([{ ...items[idx] }]);
          removeItem(idx);
        }
      } else if (type === "_copy") {
        if (selectedRows.size > 0) {
          const expanded = expandSelectionWithChildren(selectedRows, items);
          const sorted = [...expanded].sort((a, b) => a - b);
          setClipboard(sorted.map((i) => ({ ...items[i] })));
          toast({ title: `${sorted.length} Position${sorted.length > 1 ? "en" : ""} kopiert` });
        } else if (items[idx]) {
          setClipboard([{ ...items[idx] }]);
          toast({ title: "Position kopiert" });
        }
      } else if (type === "_paste") {
        if (clipboard && clipboard.length > 0) {
          const newItems = remapClipboardItems(clipboard);
          newItems.forEach((it, ci) => { it.sortOrder = insertAt + ci; });
          const updated = [...items];
          updated.splice(insertAt, 0, ...newItems);
          updated.forEach((it, i) => { it.sortOrder = i; });
          setItems(recalcTitelsummen(updated));
          setFocusedRow(insertAt + newItems.length - 1);
          setDirty(true);
        }
      } else if (type === "freitext" || type === "text") {
        setTimeout(() => {
          const ni = emptyItem("freitext", documentId || 0, insertAt);
          if (isAfterTotals) ni.afterTotals = true;
          const u = [...items];
          u.splice(insertAt, 0, ni);
          u.forEach((it, i) => { it.sortOrder = i; });
          setItems(recalcTitelsummen(u));
          setFocusedRow(insertAt);
          setDirty(true);
        }, 0);
      } else {
        setTimeout(() => addPosition(type, undefined, idx), 0);
      }
      setContextMenu(null);
    },
    [
      insertIdx,
      items,
      addPosition,
      clipboard,
      removeItem,
      recalcTitelsummen,
      getTitleBlockIndices,
      toast,
      selectedRows,
      setSelectedRows,
      setFocusedRow,
      setDirty,
      documentId,
      setArtikelDialog,
      setIdsDialog,
      setFloskelOpen,
      setFloskelTarget,
      setLohnOpen,
      setLohnTargetJumbo,
      setEigenschaftenItem,
      setPriceDialogItem,
      setProzentDialog,
      setzeAlternativ,
      setzeBedarf,
      updateMaterialPrices,
      onRequestDeleteSelected,
    ],
  );

  return {
    contextMenu,
    setContextMenu,
    insertIdx,
    setInsertIdx,
    handleContextMenu,
    handleAreaContextMenu,
    handleBeforeTableContextMenu,
    handleAfterTotalsContextMenu,
    handleContextInsert,
    isAfterTotalsInsert: insertIdx === AFTER_TOTALS_SENTINEL,
    isBeforeTableInsert: insertIdx === BEFORE_TABLE_SENTINEL,
  };
}
