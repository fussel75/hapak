import { Copy, Trash2, Clipboard, ClipboardPaste, Scissors, PlusCircle, MinusCircle } from "lucide-react";
import type { EditorItem } from "../types";
import { emptyItem, genClientId, expandSelectionWithChildren, remapClipboardItems } from "../utils";

interface QuickActionBarProps {
  activeRowIdx: number;
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  setFocusedRow: (idx: number | null) => void;
  setDirty: (v: boolean) => void;
  removeItem: (idx: number) => void;
  recalcTitelsummen: (items: EditorItem[]) => EditorItem[];
  documentId: number | null | undefined;
  position: { top: number; right: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  selectedRows: Set<number>;
  setSelectedRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  clipboard: EditorItem[] | null;
  setClipboard: React.Dispatch<React.SetStateAction<EditorItem[] | null>>;
  isJumbo?: boolean;
  jumboExpanded?: boolean;
  onToggleJumbo?: () => void;
  onRequestDeleteSelected?: () => void;
}

export function QuickActionBar({
  activeRowIdx,
  items,
  setItems,
  setFocusedRow,
  setDirty,
  removeItem,
  recalcTitelsummen,
  documentId,
  position,
  onMouseEnter,
  onMouseLeave,
  selectedRows,
  setSelectedRows,
  clipboard,
  setClipboard,
  isJumbo,
  jumboExpanded,
  onToggleJumbo,
  onRequestDeleteSelected,
}: QuickActionBarProps) {
  const multiSelected = selectedRows.size > 1;

  const handleCopy = () => {
    if (multiSelected) {
      const expanded = expandSelectionWithChildren(selectedRows, items);
      const copied = Array.from(expanded).sort((a, b) => a - b).map(i => items[i]).filter(Boolean);
      setClipboard(remapClipboardItems(copied));
    } else {
      const it = items[activeRowIdx];
      if (it) {
        setClipboard(remapClipboardItems([{ ...it }]));
      }
    }
  };

  const handleCut = () => {
    if (multiSelected) {
      const expanded = expandSelectionWithChildren(selectedRows, items);
      const sorted = Array.from(expanded).sort((a, b) => a - b);
      const copied = sorted.map(i => items[i]).filter(Boolean);
      setClipboard(remapClipboardItems(copied));
      setItems(prev => {
        const u = prev.filter((_, i) => !expanded.has(i));
        u.forEach((x, i) => { x.sortOrder = i; });
        return recalcTitelsummen(u);
      });
      setSelectedRows(new Set());
      setFocusedRow(null);
      setDirty(true);
    } else {
      const it = items[activeRowIdx];
      if (it) {
        setClipboard(remapClipboardItems([{ ...it }]));
        removeItem(activeRowIdx);
      }
    }
  };

  const handleDelete = () => {
    if (multiSelected) {
      onRequestDeleteSelected?.();
    } else {
      removeItem(activeRowIdx);
    }
  };

  const handleDuplicate = () => {
    if (multiSelected) {
      const sorted = Array.from(selectedRows).sort((a, b) => a - b);
      const copied = sorted.map(i => items[i]).filter(Boolean);
      const remapped = remapClipboardItems(copied);
      const insertAt = Math.max(...sorted) + 1;
      const u = [...items];
      u.splice(insertAt, 0, ...remapped);
      u.forEach((x, i) => { x.sortOrder = i; });
      setItems(recalcTitelsummen(u));
      const newSelection = new Set<number>();
      for (let i = 0; i < remapped.length; i++) newSelection.add(insertAt + i);
      setSelectedRows(newSelection);
      setFocusedRow(insertAt);
      setDirty(true);
    } else {
      const it = items[activeRowIdx];
      if (it) {
        const newItem = { ...it, id: undefined, _clientId: genClientId(), sortOrder: activeRowIdx + 1 };
        const u = [...items];
        u.splice(activeRowIdx + 1, 0, newItem);
        u.forEach((x, i) => { x.sortOrder = i; });
        setItems(recalcTitelsummen(u));
        setFocusedRow(activeRowIdx + 1);
        setDirty(true);
      }
    }
  };

  const handlePaste = () => {
    if (!clipboard || clipboard.length === 0) return;
    const insertAt = multiSelected ? Math.max(...selectedRows) + 1 : activeRowIdx + 1;
    const remapped = remapClipboardItems(clipboard);
    const u = [...items];
    u.splice(insertAt, 0, ...remapped);
    u.forEach((x, i) => { x.sortOrder = i; });
    setItems(recalcTitelsummen(u));
    setFocusedRow(insertAt);
    setDirty(true);
  };

  return (
    <div
      className="fixed z-50 flex flex-col gap-0.5 bg-white/90 border border-gray-200 rounded shadow-sm p-0.5"
      style={{ top: position.top, right: position.right }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-float-toolbar
    >
      {multiSelected && (
        <div className="text-[9px] text-center text-red-500 font-bold px-1 select-none" data-testid="text-selection-count">
          {selectedRows.size}
        </div>
      )}
      <button
        className="h-6 w-6 flex items-center justify-center text-gray-400 hover:text-foreground rounded hover:bg-gray-100"
        onClick={handleDuplicate}
        title={multiSelected ? `${selectedRows.size} Positionen duplizieren` : "Duplizieren"}
        data-testid="btn-float-copy"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        className="h-6 w-6 flex items-center justify-center text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
        onClick={handleCopy}
        title={multiSelected ? `${selectedRows.size} Positionen kopieren` : "Kopieren"}
        data-testid="btn-float-clipboard-copy"
      >
        <Clipboard className="h-3.5 w-3.5" />
      </button>
      <button
        className="h-6 w-6 flex items-center justify-center text-gray-400 hover:text-orange-600 rounded hover:bg-orange-50"
        onClick={handleCut}
        title={multiSelected ? `${selectedRows.size} Positionen ausschneiden` : "Ausschneiden"}
        data-testid="btn-float-cut"
      >
        <Scissors className="h-3.5 w-3.5" />
      </button>
      {clipboard && clipboard.length > 0 && (
        <button
          className="h-6 w-6 flex items-center justify-center text-gray-400 hover:text-green-600 rounded hover:bg-green-50"
          onClick={handlePaste}
          title={`${clipboard.length} Positionen einfügen`}
          data-testid="btn-float-paste"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        className="h-6 w-6 flex items-center justify-center text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
        onClick={handleDelete}
        title={multiSelected ? `${selectedRows.size} Positionen löschen` : "Löschen"}
        data-testid="btn-float-delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {!multiSelected && (
        <button
          className="h-6 w-6 flex items-center justify-center text-gray-400 hover:text-foreground rounded hover:bg-gray-100"
          onClick={() => {
            const ni = emptyItem("freitext", documentId || 0, activeRowIdx + 1);
            ni.title = "———";
            const u = [...items];
            u.splice(activeRowIdx + 1, 0, ni);
            u.forEach((x, i) => { x.sortOrder = i; });
            setItems(recalcTitelsummen(u));
            setFocusedRow(activeRowIdx + 1);
            setDirty(true);
          }}
          title="Trennlinie einfügen"
          data-testid="btn-float-line"
        >
          <span className="text-[10px] font-bold leading-none">―</span>
        </button>
      )}
      {!multiSelected && isJumbo && onToggleJumbo && (
        <button
          className="h-6 w-6 flex items-center justify-center text-gray-400 hover:text-purple-600 rounded hover:bg-purple-50"
          onClick={onToggleJumbo}
          title={jumboExpanded ? "Jumbo einklappen" : "Jumbo ausklappen"}
          data-testid="btn-float-jumbo-toggle"
        >
          {jumboExpanded ? <MinusCircle className="h-3.5 w-3.5" /> : <PlusCircle className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
