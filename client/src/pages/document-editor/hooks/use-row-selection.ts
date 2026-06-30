import { useState, useCallback, useEffect, useRef } from "react";
import type { EditorItem } from "../types";

interface UseRowSelectionArgs {
  items: EditorItem[];
  focusedRow: number | null;
  setFocusedRow: (idx: number | null) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  getTitleBlockIndices: (idx: number) => number[];
}

export function useRowSelection({
  items,
  focusedRow,
  setFocusedRow,
  scrollContainerRef,
  getTitleBlockIndices,
}: UseRowSelectionArgs) {
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [dragSelect, setDragSelect] = useState<{ active: boolean; startIdx: number; moved?: boolean; fromSelectBar?: boolean; fromMarkingZone?: boolean } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [quickActionPos, setQuickActionPos] = useState<{ top: number; right: number } | null>(null);

  const handleToggleSelect = useCallback((index: number, e: React.MouseEvent) => {
    if (e.shiftKey && focusedRow !== null) {
      e.preventDefault();
      setSelectedRows(prev => {
        const next = new Set(prev);
        const start = Math.min(focusedRow, index);
        const end = Math.max(focusedRow, index);
        for (let i = start; i <= end; i++) next.add(i);
        return next;
      });
      return;
    }
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
    setFocusedRow(index);
  }, [focusedRow, setFocusedRow]);

  const handleRowClick = useCallback((index: number, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-select-bar]")) return;
    if ((e.target as HTMLElement).closest("[data-select-col]")) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedRows(prev => {
        const next = new Set(prev);
        next.has(index) ? next.delete(index) : next.add(index);
        return next;
      });
      setFocusedRow(index);
      return;
    }
    if (e.shiftKey && focusedRow !== null) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedRows(prev => {
        const next = new Set(prev);
        const start = Math.min(focusedRow, index);
        const end = Math.max(focusedRow, index);
        for (let i = start; i <= end; i++) next.add(i);
        return next;
      });
      return;
    }
    setSelectedRows(prev => {
      if (prev.size > 1) return new Set([index]);
      if (prev.size === 1 && !prev.has(index)) return new Set([index]);
      return prev;
    });
    setFocusedRow(index);
  }, [focusedRow, setFocusedRow]);

  const selectTitleBlock = useCallback((titleIndex: number) => {
    const indices = getTitleBlockIndices(titleIndex);
    setSelectedRows(new Set(indices));
    setFocusedRow(titleIndex);
  }, [getTitleBlockIndices, setFocusedRow]);

  const selectAll = useCallback(() => {
    const all = new Set<number>();
    for (let i = 0; i < items.length; i++) all.add(i);
    setSelectedRows(all);
  }, [items]);

  const handleDragSelectDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-dnd-handle]") || target.closest("input") || target.closest("textarea") || target.closest("[contenteditable]") || target.closest("button") || target.closest("select") || target.closest("[data-toolbox-action]")) return;
    const onSelectBar = !!target.closest("[data-select-bar]");
    const onMarkingZone = !!target.closest("[data-marking-zone]");
    const row = target.closest("[data-row]");
    if (row) {
      if (!onSelectBar && !onMarkingZone) {
        const td = target.closest("td");
        const isPosTd = td && td.cellIndex === 0;
        const rect = row.getBoundingClientRect();
        if (!isPosTd && e.clientX - rect.left > 60) return;
      }
      const idx = parseInt(row.getAttribute("data-row") || "-1", 10);
      if (idx < 0) return;
      if (!onSelectBar && !onMarkingZone) e.preventDefault();
      setDragSelect({ active: true, startIdx: idx, moved: false, fromSelectBar: onSelectBar || onMarkingZone, fromMarkingZone: onMarkingZone });
      if (!onSelectBar && !onMarkingZone) {
        setSelectedRows(new Set([idx]));
        setFocusedRow(idx);
      }
      return;
    }
    if (onMarkingZone) {
      const a4Page = target.closest(".a4-page");
      if (a4Page) {
        const rows = a4Page.querySelectorAll("[data-row]");
        let closestIdx = -1;
        let closestDist = Infinity;
        rows.forEach((r) => {
          const rect = r.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          const dist = Math.abs(e.clientY - mid);
          if (dist < closestDist) {
            closestDist = dist;
            const idx = parseInt(r.getAttribute("data-row") || "-1", 10);
            if (idx >= 0) closestIdx = idx;
          }
        });
        if (closestIdx >= 0) {
          e.preventDefault();
          setDragSelect({ active: true, startIdx: closestIdx, moved: false, fromSelectBar: true, fromMarkingZone: true });
          return;
        }
      }
    }
    if (selectedRows.size > 0 && !target.closest("[data-float-toolbar]")) {
      setSelectedRows(new Set());
    }
  }, [selectedRows.size, setFocusedRow]);

  const handleDragSelectMove = useCallback((e: React.MouseEvent) => {
    if (!dragSelect?.active) return;
    const rows = document.querySelectorAll("[data-row]");
    let closestIdx = dragSelect.startIdx;
    let closestDist = Infinity;
    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const dist = Math.abs(e.clientY - mid);
      if (dist < closestDist) {
        closestDist = dist;
        const idx = parseInt(row.getAttribute("data-row") || "-1", 10);
        if (idx >= 0) closestIdx = idx;
      }
    });
    const start = Math.min(dragSelect.startIdx, closestIdx);
    const end = Math.max(dragSelect.startIdx, closestIdx);
    const next = new Set<number>();
    for (let i = start; i <= end; i++) next.add(i);
    setSelectedRows(next);
  }, [dragSelect]);

  useEffect(() => {
    if (!dragSelect?.active) return;
    let hasMoved = false;
    const onUp = (e: MouseEvent) => {
      if (!hasMoved && dragSelect.fromSelectBar) {
        if (dragSelect.fromMarkingZone) {
          setSelectedRows(prev => {
            const next = new Set(prev);
            if (next.has(dragSelect.startIdx)) {
              next.delete(dragSelect.startIdx);
            } else {
              next.add(dragSelect.startIdx);
            }
            return next;
          });
          setFocusedRow(dragSelect.startIdx);
        }
        setDragSelect(null);
        return;
      }
      const rows = document.querySelectorAll("[data-row]");
      let closestIdx = dragSelect.startIdx;
      let closestDist = Infinity;
      rows.forEach((row) => {
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const dist = Math.abs(e.clientY - mid);
        if (dist < closestDist) {
          closestDist = dist;
          const idx = parseInt(row.getAttribute("data-row") || "-1", 10);
          if (idx >= 0) closestIdx = idx;
        }
      });
      if (closestIdx === dragSelect.startIdx) {
        setSelectedRows(new Set([dragSelect.startIdx]));
        setFocusedRow(dragSelect.startIdx);
      }
      setDragSelect(null);
    };
    const onMove = (e: MouseEvent) => {
      const rows = document.querySelectorAll("[data-row]");
      let closestIdx = dragSelect.startIdx;
      let closestDist = Infinity;
      rows.forEach((row) => {
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const dist = Math.abs(e.clientY - mid);
        if (dist < closestDist) {
          closestDist = dist;
          const idx = parseInt(row.getAttribute("data-row") || "-1", 10);
          if (idx >= 0) closestIdx = idx;
        }
      });
      if (closestIdx !== dragSelect.startIdx) {
        hasMoved = true;
        if (dragSelect.fromSelectBar && !dragSelect.moved) {
          setDragSelect(prev => prev ? { ...prev, moved: true } : null);
        }
      }
      const start = Math.min(dragSelect.startIdx, closestIdx);
      const end = Math.max(dragSelect.startIdx, closestIdx);
      const next = new Set<number>();
      for (let i = start; i <= end; i++) next.add(i);
      setSelectedRows(next);
    };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
    };
  }, [dragSelect, setFocusedRow]);

  const activeRowIdx = hoveredRow ?? focusedRow;
  useEffect(() => {
    if (activeRowIdx === null) { setQuickActionPos(null); return; }
    const updatePos = () => {
      const row = document.querySelector(`[data-row="${activeRowIdx}"]`);
      if (!row) { setQuickActionPos(null); return; }
      const rowRect = row.getBoundingClientRect();
      const a4Page = row.closest(".a4-page");
      if (!a4Page) { setQuickActionPos(null); return; }
      const a4Rect = a4Page.getBoundingClientRect();
      setQuickActionPos({ top: rowRect.top, right: window.innerWidth - a4Rect.right - 4 });
    };
    updatePos();
    const sc = scrollContainerRef.current;
    if (sc) sc.addEventListener("scroll", updatePos, { passive: true });
    return () => { if (sc) sc.removeEventListener("scroll", updatePos); };
  }, [activeRowIdx, scrollContainerRef]);

  const handleRowMouseEnter = useCallback((index: number) => {
    setHoveredRow(index);
  }, []);
  const handleRowMouseLeave = useCallback(() => {
    setHoveredRow(null);
  }, []);

  return {
    selectedRows,
    setSelectedRows,
    hoveredRow,
    setHoveredRow,
    activeRowIdx,
    quickActionPos,
    handleToggleSelect,
    handleRowClick,
    selectTitleBlock,
    selectAll,
    dragSelect,
    handleDragSelectDown,
    handleDragSelectMove,
    handleRowMouseEnter,
    handleRowMouseLeave,
  };
}
