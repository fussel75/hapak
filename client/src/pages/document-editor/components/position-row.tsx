import { useEffect, useState, memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
import { RichTextCell } from "@/components/rich-text-editor";
import { fmtCurrency, fmtQty, fmtPercent } from "@/lib/format";
import { rowStyle, splitTitleDesc } from "../utils";
import type { EditorItem } from "../types";
import { formatEditableGermanDecimal, parseGermanDecimal } from "@shared/document-engine/number-input";
import { getPositionTypeRule } from "@shared/document-engine/position-types";

function effectivePositionType(item: EditorItem): string | null | undefined {
  return item.positionFlag === "jumbo_lohn" ? "lohn" : item.type;
}

function positionTypeLabel(item: EditorItem, isJumbo: boolean): string {
  if (isJumbo) return getPositionTypeRule("jumbo").label;
  const rule = getPositionTypeRule(effectivePositionType(item));
  if (rule.id !== "unknown") return rule.label;
  return item.type ? `Positionsart: ${item.type}` : "Position";
}

function positionTypeAccent(_item: EditorItem, _isJumbo: boolean): string {
  return "border-l-transparent";
}

function positionTypeCode(item: EditorItem, isJumbo: boolean): string {
  const rule = getPositionTypeRule(isJumbo ? "jumbo" : effectivePositionType(item));
  return rule.id === "unknown" ? "" : rule.code;
}

function positionTypeChipClass(item: EditorItem, isJumbo: boolean): string {
  const rule = getPositionTypeRule(isJumbo ? "jumbo" : effectivePositionType(item));
  if (rule.role === "jumbo") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (rule.id === "material") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (rule.id === "lohn") return "border-sky-200 bg-sky-50 text-sky-700";
  if (rule.id === "leistung" || rule.id === "position") return "border-blue-200 bg-blue-50 text-blue-700";
  if (rule.id === "manuell") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-slate-200 bg-white text-slate-500";
}

function rowStateClasses(options: {
  selected: boolean;
  focused: boolean;
  isJumbo?: boolean;
  isSubItem?: boolean;
  isText?: boolean;
  isTitle?: boolean;
  isSum?: boolean;
  isZuschlag?: boolean;
  markerColor?: string;
}) {
  const base = "transition-colors group relative border-l";
  const selected = options.selected ? "bg-sky-50/65 ring-1 ring-inset ring-sky-200/80 border-l-sky-400" : "";
  const focused = options.focused && !options.selected ? "bg-slate-50/70 ring-1 ring-inset ring-slate-200/80 border-l-slate-300" : "";
  const hover = options.selected || options.focused ? "" : "hover:bg-slate-50/40 hover:border-l-slate-300";
  const typeTint = options.isJumbo
    ? ""
    : options.isSubItem
      ? ""
      : options.isText
        ? "bg-white"
        : options.isTitle
          ? "bg-slate-50/35"
          : options.isSum
            ? "bg-white"
            : options.isZuschlag
              ? "bg-amber-50/25"
              : "";
  return `${base} ${typeTint} ${hover} ${focused} ${selected} ${options.markerColor || ""}`;
}

const structureTitleInputClass =
  "w-full bg-transparent border-0 outline-none rounded px-1 -mx-1 focus:bg-cyan-50/55 text-gray-950 font-bold leading-[1.35]";
const structureSubtitleInputClass =
  "w-full bg-transparent border-0 outline-none rounded px-1 -mx-1 focus:bg-cyan-50/55 text-gray-900 font-semibold leading-[1.35]";
const structurePositionClass = "font-semibold text-gray-800 leading-[1.35]";
const titleSumLabelClass = "font-semibold text-gray-900 cursor-pointer hover:text-gray-950";
const normalSumLabelClass = "font-semibold text-gray-900";

export const PositionRow = memo(function PositionRow({
  item,
  index,
  focused,
  selected,
  onFocus,
  onRowClick,
  onToggleSelect,
  onUpdate,
  onRemove,
  onCopy,
  onMove,
  onInsertLine,
  onInsertNewPosition,
  unitCodes,
  isSubItem,
  isJumbo,
  jumboExpanded,
  jumboChildCount,
  onToggleJumbo,
  onAddJumboChild,
  onOpenLohnDialog,
  onOpenPriceDialog,
  jumboMenuOpen,
  onJumboMenuToggle,
  showKalk,
  onContextMenu,
  displayPos,
  dragId,
  sectionSum,
  onMouseEnter,
  onMouseLeave,
  onOpenArtikelDialog,
  onNavigateToRow,
  showOriginalQuantities,
  maxClipHeight,
  splitOffsetHeight,
  isSplitContinuation,
  textOverride,
  hidePrices,
  dezimalstellenMengen = 2,
  dezimalstellenPreise = 2,
  mengeneinheitenAenderbar = true,
  altPosGesamtpreis = "kursiv",
  statusmarkierungenPositionen = false,
  warnungAufschlagUnter = 10,
  alarmAufschlagUnter = 0,
  onOpenFloskelDialog,
  onOpenTitelsummeDetail,
  showFormatBar = true,
  posNrEditable = false,
  jumboEinzelpreise = true,
  jumboMengen = true,
  showDecimals = true,
  jumboKleinerSchrift = false,
  showMouseInfo = true,
  tabInTexts = true,
  showUnitList = true,
  colWidths,
}: {
  item: EditorItem;
  index: number;
  focused: boolean;
  selected: boolean;
  onFocus: () => void;
  onRowClick: (e: React.MouseEvent) => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onUpdate: (i: number, f: string, v: string) => void;
  onRemove: () => void;
  onCopy: () => void;
  onMove: (d: -1 | 1) => void;
  onInsertLine: () => void;
  onInsertNewPosition?: () => void;
  unitCodes: string[];
  isSubItem: boolean;
  isJumbo: boolean;
  jumboExpanded: boolean;
  jumboChildCount: number;
  onToggleJumbo: () => void;
  onAddJumboChild: (type: string) => void;
  onOpenLohnDialog: () => void;
  onOpenPriceDialog: () => void;
  jumboMenuOpen: boolean;
  onJumboMenuToggle: () => void;
  showKalk: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  displayPos: string;
  positionNumber?: string;
  dragId: string;
  sectionSum?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onOpenArtikelDialog?: (filter: string) => void;
  onNavigateToRow?: (direction: 1 | -1, field?: string) => void;
  showOriginalQuantities?: boolean;
  maxClipHeight?: number;
  splitOffsetHeight?: number;
  isSplitContinuation?: boolean;
  textOverride?: string;
  hidePrices?: boolean;
  dezimalstellenMengen?: number;
  dezimalstellenPreise?: number;
  mengeneinheitenAenderbar?: boolean;
  altPosGesamtpreis?: string;
  statusmarkierungenPositionen?: boolean;
  warnungAufschlagUnter?: number;
  alarmAufschlagUnter?: number;
  onOpenFloskelDialog?: () => void;
  onOpenTitelsummeDetail?: () => void;
  showFormatBar?: boolean;
  posNrEditable?: boolean;
  jumboEinzelpreise?: boolean;
  jumboMengen?: boolean;
  showDecimals?: boolean;
  jumboKleinerSchrift?: boolean;
  showMouseInfo?: boolean;
  tabInTexts?: boolean;
  showUnitList?: boolean;
  colWidths?: { posW: number | string; qtyW: number | string; unitW: number | string; descW?: number | string; epW: number | string; gpW: number | string };
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dragId });
  const dndStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
    ...(item.fontBold ? { fontWeight: "bold" } : {}),
    ...(item.fontItalic ? { fontStyle: "italic" as const } : {}),
    ...((item as any).fontUnderline ? { textDecoration: "underline" } : {}),
    ...((item as any).fontSize ? { fontSize: `${(item as any).fontSize}pt` } : {}),
    ...(item.fontColor ? { color: item.fontColor } : {}),
  };

  const cw = colWidths;
  const cwPos = cw ? `${cw.posW}%` : "36px";
  const cwQty = cw ? `${cw.qtyW}%` : "52px";
  const cwUnit = cw ? `${cw.unitW}%` : "30px";
  const cwEP = cw ? `${cw.epW}%` : "65px";
  const cwGP = cw ? `${cw.gpW}%` : "70px";

  const gp = parseFloat(item.totalPrice || "0");
  const isSum_ = item.type === "titelsumme" || item.type === "zwischensumme" || item.type === "abschluss";
  const showEP = !hidePrices || isSum_;
  const showGP = !hidePrices || isSum_;

  const margePercent = gp !== 0 && parseFloat(item.materialPrice || "0") !== 0
    ? ((gp - parseFloat(item.materialPrice || "0") * parseFloat(item.quantity || "1")) / gp) * 100
    : null;
  const markerColor = statusmarkierungenPositionen && margePercent !== null
    ? (margePercent < alarmAufschlagUnter ? "bg-red-200 border-l-4 border-l-red-500"
      : margePercent < warnungAufschlagUnter ? "bg-yellow-50 border-l-4 border-l-yellow-400"
      : "")
    : "";

  const isAlt = item.positionFlag === "alternativ";
  const isBedarf = item.positionFlag === "bedarf";
  const altStyle: React.CSSProperties = (isAlt || isBedarf)
    ? altPosGesamtpreis === "fett"
      ? { fontWeight: "bold" }
      : { fontStyle: "italic" }
    : {};

  const unitEditable = mengeneinheitenAenderbar;
  const [quantityEditing, setQuantityEditing] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState(() => formatEditableGermanDecimal(item.quantity));
  const isTitel = item.type === "titel";
  const isGruppe = item.type === "gruppe";
  const isTitelS = item.type === "titelsumme";
  const isAbschl = item.type === "abschluss";
  const isZwischen = item.type === "zwischensumme";
  const isZuschlag = item.type === "zuschlag";
  const isSkonto = item.type === "skonto";
  const isText =
    item.type === "freitext" || item.type === "floskel" || item.type === "text";
  const isSum = isTitelS || isAbschl || isZwischen;
  const typeAccent = positionTypeAccent(item, isJumbo);
  const typeLabel = positionTypeLabel(item, isJumbo);
  const typeCode = positionTypeCode(item, isJumbo);
  const typeChipClass = positionTypeChipClass(item, isJumbo);
  const rowMetaProps = {
    title: showMouseInfo ? typeLabel : undefined,
    "data-position-type": item.type || "",
    "data-position-label": typeLabel,
  };
  const selectColContent = (children: React.ReactNode) => (
    <td
      className="relative py-1.5 pl-0.5 pr-0 align-top text-slate-500"
      style={{ width: cwPos }}
      data-select-col
    >
      <div
        className={`absolute top-0 bottom-0 cursor-pointer select-none transition-colors ${selected ? "bg-cyan-200/45" : "hover:bg-slate-200/45"}`}
        style={{ left: "-80px", width: "80px" }}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
        data-select-bar
      >
        {selected && (
          <div className="absolute top-0 bottom-0 right-0 w-[4px] bg-cyan-500 rounded-l-sm" />
        )}
      </div>
      {typeCode && (
        <span
          className={`absolute top-1.5 -left-[42px] min-w-[30px] rounded border px-1 py-[1px] text-center text-[8px] font-semibold leading-none tracking-wide shadow-sm ${focused || selected ? "inline-block" : "hidden group-hover:inline-block"} ${typeChipClass}`}
          aria-hidden="true"
        >
          {typeCode}
        </span>
      )}
      {children}
    </td>
  );

  const allUnitCodes = item.unit && !unitCodes.includes(item.unit)
    ? [...unitCodes, item.unit]
    : unitCodes;
  const renderUnitEditor = (className: string, testId?: string) => {
    if (showUnitList) {
      return (
        <select
          className={className}
          style={{ height: "auto" }}
          value={item.unit || ""}
          onChange={(e) => onUpdate(index, "unit", e.target.value)}
          onKeyDown={(e) => handleTabNav(e, "unit")}
          data-field="unit"
          data-testid={testId}
        >
          <option value="">-</option>
          {allUnitCodes.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      );
    }
    return (
      <input
        className={className.replace("appearance-none", "")}
        style={{ height: "auto" }}
        value={item.unit || ""}
        onChange={(e) => onUpdate(index, "unit", e.target.value)}
        onKeyDown={(e) => handleTabNav(e, "unit")}
        data-field="unit"
        data-testid={testId?.replace("select", "input")}
      />
    );
  };

  const fieldOrder = ["quantity", "unit", "title", "unitPrice"];

  const focusField = (rowEl: Element | null, fieldName: string) => {
    if (!rowEl) return false;
    const el = rowEl.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
    if (el) { el.focus(); return true; }
    return false;
  };

  const focusAdjacentRow = (direction: 1 | -1, fieldName: string) => {
    const row = document.querySelector(`[data-row="${index}"]`);
    if (!row) return;
    let sibling = direction === 1 ? row.nextElementSibling : row.previousElementSibling;
    while (sibling) {
      if (sibling.hasAttribute("data-row")) {
        if (focusField(sibling, fieldName)) {
          const rowIdx = parseInt(sibling.getAttribute("data-row") || "-1", 10);
          if (rowIdx >= 0) onNavigateToRow?.(direction, fieldName);
          return;
        }
        const fallback = fieldOrder.find(f => sibling!.querySelector(`[data-field="${f}"]`));
        if (fallback) {
          focusField(sibling, fallback);
          const rowIdx = parseInt(sibling.getAttribute("data-row") || "-1", 10);
          if (rowIdx >= 0) onNavigateToRow?.(direction, fallback);
          return;
        }
      }
      sibling = direction === 1 ? sibling.nextElementSibling : sibling.previousElementSibling;
    }
  };

  const handleTabNav = (e: React.KeyboardEvent, field: string) => {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onMove(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (e.key === "Tab") {
      if (isText && field === "title" && tabInTexts !== false) {
        e.preventDefault();
        document.execCommand("insertText", false, "\t");
        (e.currentTarget as HTMLElement).dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: "\t",
        }));
        return;
      }
      e.preventDefault();
      const idx = fieldOrder.indexOf(field);
      const step = e.shiftKey ? -1 : 1;
      const nextIdx = idx + step;
      if (nextIdx >= 0 && nextIdx < fieldOrder.length) {
        const row = (e.target as HTMLElement).closest("tr");
        const remaining = e.shiftKey
          ? fieldOrder.slice(0, idx).reverse()
          : fieldOrder.slice(idx + 1);
        let found = false;
        for (const f of remaining) {
          if (focusField(row, f)) { found = true; break; }
        }
        if (!found) {
          focusAdjacentRow(step as 1 | -1, e.shiftKey ? fieldOrder[fieldOrder.length - 1] : fieldOrder[0]);
        }
      } else {
        focusAdjacentRow(step as 1 | -1, e.shiftKey ? fieldOrder[fieldOrder.length - 1] : fieldOrder[0]);
      }
      return;
    }
    if (e.key === "Enter" && e.shiftKey) {
      if (field === "title") {
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      if (isText && field === "title") {
        return;
      }
      e.preventDefault();
      if (!isSum && !isTitel && !isGruppe && onInsertNewPosition) {
        onInsertNewPosition();
      } else {
        focusAdjacentRow(1, field);
      }
      return;
    }
  };

  const handleQtyBlur = (val: string) => {
    setQuantityEditing(false);
    const num = parseGermanDecimal(val);
    onUpdate(index, "quantity", num.toFixed(dezimalstellenMengen));
    setQuantityDraft(formatEditableGermanDecimal(num.toFixed(dezimalstellenMengen)));
  };

  useEffect(() => {
    if (!quantityEditing) {
      setQuantityDraft(formatEditableGermanDecimal(item.quantity));
    }
  }, [item.quantity, quantityEditing]);

  const handleQtyFocus = () => {
    setQuantityEditing(true);
    setQuantityDraft(formatEditableGermanDecimal(item.quantity));
    onFocus();
  };

  const handleQtyChange = (value: string) => {
    setQuantityDraft(value);
  };

  const formatQtyForDisplay = (value: string | number | null | undefined) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    const normalized = Number.isFinite(num as number) ? (num as number) : 0;
    const visibleDecimals = Math.min(Math.max(dezimalstellenMengen, 0), 2);
    return normalized.toLocaleString("de-DE", {
      minimumFractionDigits: showDecimals ? visibleDecimals : 0,
      maximumFractionDigits: visibleDecimals,
    });
  };

  const qtyDisplay = quantityEditing
    ? quantityDraft
    : (showDecimals ? fmtQty(item.quantity, dezimalstellenMengen) : formatQtyForDisplay(item.quantity));

  const origQtyHint = showOriginalQuantities && item.originalQuantity && parseFloat(item.originalQuantity) !== 0
    ? `(${fmtQty(item.originalQuantity, dezimalstellenMengen)})`
    : null;

  const gpFlagColor =
    item.positionFlag === "alternativ" ? "text-amber-500"
    : item.positionFlag === "bedarf" ? "text-blue-500"
    : item.positionFlag === "festpreis" ? "text-green-600"
    : "text-gray-900";

  const dragHandle = (
    <span
      className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0 select-none opacity-0 group-hover:opacity-100 transition-opacity"
      style={{ left: "-14px" }}
      data-dnd-handle="true"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3 w-3" />
    </span>
  );

  const quickActions = null;

  const fmtP = (v: string | number | null | undefined) => fmtCurrency(v, dezimalstellenPreise);
  const renderSplitTextOverride = () => (
    <div
      className="w-full text-gray-600 bg-transparent px-0 py-0.5 cursor-default whitespace-pre-wrap"
      data-field="title"
      data-testid={`split-text-${index}`}
    >
      {String(textOverride ?? "").split("\n").map((line, lineIndex) => (
        <div key={lineIndex} className="min-h-[1.2em] leading-[1.4]">
          {line || " "}
        </div>
      ))}
    </div>
  );

  const kalkCells = showKalk ? (
    <>
      <td className="text-right py-0.5 px-1 text-xs tabular-nums font-mono text-muted-foreground border-l border-gray-100">
        {parseFloat(item.materialPrice || "0") !== 0
          ? fmtP(
              parseFloat(item.materialPrice || "0") *
                parseFloat(item.quantity || "1"),
            )
          : ""}
      </td>
      <td className="text-right py-0.5 px-1 text-xs tabular-nums font-mono text-muted-foreground">
        {parseFloat(item.laborCost || "0") !== 0
          ? fmtP(
              parseFloat(item.laborCost || "0") *
                (parseFloat(item.laborTime || "0") / 60) *
                parseFloat(item.quantity || "1"),
            )
          : ""}
      </td>
      <td className="text-right py-0.5 px-1 text-xs tabular-nums font-mono text-blue-600 font-medium">
        {gp !== 0 && parseFloat(item.materialPrice || "0") !== 0
          ? fmtPercent(
              ((gp -
                parseFloat(item.materialPrice || "0") *
                  parseFloat(item.quantity || "1")) /
                gp) *
                100,
            )
          : ""}
      </td>
    </>
  ) : null;

  if (isAbschl) return null;

  if (isSkonto) {
    return (
      <tr
        ref={setNodeRef}
        className={`border-b border-slate-100 ${typeAccent} ${rowStateClasses({ selected, focused, isSum: true })}`}
        style={dndStyle}
        onClickCapture={onRowClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...rowMetaProps}
        data-row={index}
        data-testid={`pos-row-${index}`}
      >
        {selectColContent(
          <div className="flex items-center gap-0.5">
            {dragHandle}
          </div>
        )}
        <td className="py-1 align-top" style={{ width: cwQty }}></td>
        <td className="py-1 align-top" style={{ width: cwUnit }}></td>
        <td className="py-2 px-1 align-top" onClick={(e) => e.stopPropagation()}>
          <div className="rounded-sm bg-sky-50/65 px-2 py-1.5 text-slate-800">
            <div className="font-medium leading-snug">{item.title || "Skonto"}</div>
            {item.description && (
              <div className="mt-0.5 text-right text-slate-700 leading-snug">{item.description}</div>
            )}
          </div>
        </td>
        <td className="py-2 align-top" style={{ width: cwEP }}></td>
        <td className="py-2 pr-0.5 pl-0 align-top text-right tabular-nums font-medium text-slate-800" style={{ width: cwGP }}>
          {showGP && gp !== 0 ? fmtP(item.totalPrice) : ""}
          {quickActions}
        </td>
        {showKalk && <td colSpan={3} className="border-l border-gray-100"></td>}
      </tr>
    );
  }

  if (isSum) {
    const sumLabelClass = isTitelS ? titleSumLabelClass : normalSumLabelClass;
    return (
      <tr
        ref={setNodeRef}
        className={`border-b border-slate-200 ${typeAccent} ${rowStateClasses({ selected, focused, isSum: true })}`}
        style={{ ...dndStyle, ...rowStyle(item.type || "", false) }}
        onClickCapture={onRowClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...rowMetaProps}
        data-row={index}
        data-testid={`pos-row-${index}`}
      >
        {selectColContent(
          <div className="flex items-center gap-0.5">
            {dragHandle}
          </div>
        )}
        <td className="py-1 align-middle" style={{ width: cwQty }}></td>
        <td className="py-1 align-middle" style={{ width: cwUnit }}></td>
        <td className="py-1 px-1 align-middle">
          <span
            className={sumLabelClass}
            onClick={isTitelS && onOpenTitelsummeDetail ? (e) => { e.stopPropagation(); onOpenTitelsummeDetail(); } : undefined}
            data-testid={isTitelS ? `btn-titelsumme-detail-${index}` : undefined}
          >
            {item.title || (isTitelS ? "Titelsumme" : isZwischen ? "Zwischensumme" : "Nettosumme")}
          </span>
        </td>
        <td className="py-1 align-middle" style={{ width: cwEP }}></td>
        <td className={`text-right py-1 pr-0.5 pl-0 align-top tabular-nums ${isAbschl ? "font-bold border-t-2 border-gray-800" : "font-semibold border-t border-gray-300"}`} style={{ width: cwGP }}>
          {showGP && gp !== 0 ? fmtP(item.totalPrice) : ""}
          {quickActions}
        </td>
        {showKalk && <td colSpan={3} className="border-l border-gray-100"></td>}
      </tr>
    );
  }

  if (isText) {
    const plainTitle = (item.title || "").replace(/<[^>]*>/g, "").trim();
    const isLine = plainTitle.replace(/[-–—═_\s]/g, "").length === 0 && plainTitle.length > 0;
    const fullColSpan = showKalk ? 9 : 6;
    const isEditableTextSource = textOverride === undefined;
    const textClipHeight = isEditableTextSource || focused ? undefined : maxClipHeight;
    const textSplitOffset = isEditableTextSource || focused ? undefined : splitOffsetHeight;
    return (
      <tr
        ref={setNodeRef}
        className={`border-b border-slate-100 ${typeAccent} ${jumboKleinerSchrift ? "text-[7pt]" : ""} ${rowStateClasses({ selected, focused, isText: true })}`}
        style={dndStyle}
        onClickCapture={onRowClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...rowMetaProps}
        data-row={index}
        data-testid={`pos-row-${index}`}
      >
        <td colSpan={fullColSpan} className="relative py-1 pl-0.5 pr-1 align-top" data-select-col>
          <div
            className={`absolute top-0 bottom-0 cursor-pointer select-none transition-colors ${selected ? "bg-cyan-200/45" : "hover:bg-slate-200/45"}`}
            style={{ left: "-80px", width: "80px" }}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
            data-select-bar
          >
            {selected && (
              <div className="absolute top-0 bottom-0 right-0 w-[4px] bg-cyan-500 rounded-l-sm" />
            )}
          </div>
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0">
              {isLine ? (
                <div className="border-t border-gray-300 my-2" />
              ) : (
                <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                  <div style={textClipHeight ? { maxHeight: `${textClipHeight}px`, overflow: "hidden" } : undefined}>
                    <div style={textSplitOffset ? { marginTop: `-${textSplitOffset}px` } : undefined}>
                      {textOverride !== undefined ? renderSplitTextOverride() : (
                        <RichTextCell
                          value={item.title || ""}
                          onChange={(html) => onUpdate(index, "title", html)}
                          className="w-full text-gray-600 bg-transparent outline-none px-0 py-0.5 cursor-text"
                          placeholder="Text eingeben..."
                          onFocus={onFocus}
                          onKeyDown={(e) => handleTabNav(e, "title")}
                          testId={`input-title-${index}`}
                          dataField="title"
                          hideToolbar={!showFormatBar}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {quickActions}
        </td>
      </tr>
    );
  }

  if (isTitel || isGruppe) {
    const structurePadding = isGruppe ? "py-1.5" : "py-2";
    return (
      <tr
        ref={setNodeRef}
        className={`border-b border-slate-200 ${typeAccent} ${rowStateClasses({ selected, focused, isTitle: true })}`}
        style={{ ...dndStyle, ...rowStyle(item.type || "", false) }}
        onClickCapture={onRowClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...rowMetaProps}
        data-row={index}
        data-testid={`pos-row-${index}`}
      >
        {selectColContent(
          <div className="flex items-center gap-0.5">
            {dragHandle}
            <span className={structurePositionClass}>{displayPos}</span>
          </div>
        )}
        <td className={`${structurePadding} align-top`} style={{ width: cwQty }}></td>
        <td className={`${structurePadding} align-top`} style={{ width: cwUnit }}></td>
        <td className={`${structurePadding} px-1 align-top`}>
          <input
            className={isGruppe ? structureSubtitleInputClass : structureTitleInputClass}
            value={item.title || ""}
            onChange={(e) => onUpdate(index, "title", e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => handleTabNav(e, "title")}
            placeholder={isGruppe ? "Untertitel eingeben..." : "Titel eingeben..."}
            data-field="title"
            data-testid={`input-title-${index}`}
          />
        </td>
        <td className={`${structurePadding} align-top`} style={{ width: cwEP }}></td>
        <td className={`text-right ${structurePadding} pr-0.5 pl-0 align-top tabular-nums font-bold text-gray-800`} style={{ width: cwGP }}>
          {quickActions}
        </td>
        {showKalk && <td colSpan={3} className="border-l border-gray-100"></td>}
      </tr>
    );
  }

  if (isSubItem) {
    return (
      <tr
        ref={setNodeRef}
        className={`border-b border-slate-100 ${typeAccent} ${rowStateClasses({ selected, focused, isSubItem: true })}`}
        style={dndStyle}
        onClickCapture={onRowClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...rowMetaProps}
        data-row={index}
        data-testid={`pos-row-${index}`}
      >
        {selectColContent(
          <div className="flex items-center gap-0.5">{dragHandle}</div>
        )}
        <td className="text-right py-1 px-0.5 align-top" style={{ width: cwQty }} onClick={(e) => e.stopPropagation()}>
          {jumboMengen && (
            <>
              <input
                className="w-full text-right text-gray-600 bg-transparent border-0 outline-none focus:bg-cyan-50/60 rounded px-1 -mx-1 tabular-nums leading-[1.4]"
                style={{ height: "auto" }}
                value={qtyDisplay}
                onChange={(e) => handleQtyChange(e.target.value)}
                onBlur={(e) => handleQtyBlur(e.target.value)}
                onFocus={handleQtyFocus}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                onKeyDown={(e) => handleTabNav(e, "quantity")}
                data-field="quantity"
                data-testid={`input-qty-${index}`}
              />
              {origQtyHint && <div className="text-[9px] text-gray-400 text-right leading-tight mt-0.5" data-testid={`orig-qty-${index}`}>{origQtyHint}</div>}
            </>
          )}
        </td>
        <td className="text-left py-1 pl-0.5 pr-0 align-top" style={{ width: cwUnit }} onClick={(e) => e.stopPropagation()}>
          {jumboMengen && unitEditable ? (
            renderUnitEditor("w-full border-0 bg-transparent outline-none rounded cursor-pointer appearance-none text-gray-600 p-0 m-0 leading-[1.4]", `select-unit-${index}`)
          ) : jumboMengen ? (
            <span className="text-gray-500 text-xs leading-[1.4]" data-field="unit">{item.unit || ""}</span>
          ) : null}
        </td>
        <td className="py-1 px-1 align-top" onClick={(e) => e.stopPropagation()}>
          <RichTextCell
            value={
              item.description
                ? ((item.title || "").trim() ? (item.title || "") + "\n" + (item.description || "") : (item.description || ""))
                : item.title || ""
            }
            onChange={(html) => {
              const { title, description } = splitTitleDesc(html);
              onUpdate(index, "title", title);
              onUpdate(index, "description", description);
            }}
            className="w-full text-gray-600 bg-transparent border-0 outline-none leading-[1.4] px-0"
            placeholder="Bezeichnung"
            onKeyDown={(e) => handleTabNav(e, "title")}
            testId={`input-title-${index}`}
            dataField="title"
            hideToolbar={!showFormatBar}
          />
        </td>
        <td className="text-right py-1 pr-1 pl-0 align-top" style={{ width: cwEP }}>
          {showEP && jumboEinzelpreise && (
            <button
              className="w-full text-right text-gray-600 bg-transparent border-0 outline-none hover:bg-cyan-50/60 focus:bg-cyan-50/60 rounded px-1 -mx-1 tabular-nums cursor-pointer leading-[1.4]"
              onClick={(e) => { e.stopPropagation(); onOpenPriceDialog(); }}
              data-field="unitPrice"
              data-testid={`button-price-${index}`}
            >
              {parseFloat(item.unitPrice || "0") !== 0 ? fmtP(item.unitPrice) : fmtP(0)}
            </button>
          )}
        </td>
        <td className="text-right py-1 pr-0.5 pl-0 align-top tabular-nums text-gray-600 leading-[1.4]" style={{ width: cwGP }}>
          {showGP && gp !== 0 ? fmtP(item.totalPrice) : ""}
          {quickActions}
        </td>
        {kalkCells}
      </tr>
    );
  }

  if (isJumbo) {
    return (
      <tr
        ref={setNodeRef}
        className={`border-b border-slate-200 ${typeAccent} ${rowStateClasses({ selected, focused, isJumbo: true })}`}
        style={dndStyle}
        onClickCapture={onRowClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...rowMetaProps}
        data-row={index}
        data-testid={`pos-row-${index}`}
      >
        {selectColContent(
          <div className="flex items-center gap-0.5">
            {dragHandle}
            <span className="leading-[1.4]">{displayPos}</span>
          </div>
        )}
        <td className="text-right py-1.5 px-0.5 align-top" style={{ width: cwQty }} onClick={(e) => e.stopPropagation()}>
          <input
            className="w-full text-right text-gray-800 bg-transparent border-0 outline-none focus:bg-cyan-50/60 rounded px-1 -mx-1 tabular-nums leading-[1.4]"
            style={{ height: "auto" }}
            value={qtyDisplay}
            onChange={(e) => handleQtyChange(e.target.value)}
            onBlur={(e) => handleQtyBlur(e.target.value)}
            onFocus={handleQtyFocus}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            onKeyDown={(e) => handleTabNav(e, "quantity")}
            data-field="quantity"
            data-testid={`input-qty-${index}`}
          />
          {origQtyHint && <div className="text-[9px] text-gray-400 text-right leading-tight mt-0.5">{origQtyHint}</div>}
        </td>
        <td className="text-left py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwUnit }} onClick={(e) => e.stopPropagation()}>
          {unitEditable ? (
            renderUnitEditor("w-full border-0 bg-transparent outline-none rounded cursor-pointer appearance-none text-gray-800 p-0 m-0 leading-[1.4]")
          ) : (
            <span className="text-gray-500 text-xs leading-[1.4]" data-field="unit">{item.unit || ""}</span>
          )}
        </td>
        <td className="relative py-1.5 px-1 align-top" onClick={(e) => e.stopPropagation()}>
          <div style={maxClipHeight ? { maxHeight: `${maxClipHeight}px`, overflow: "hidden" } : undefined}>
            <div style={splitOffsetHeight ? { marginTop: `-${splitOffsetHeight}px` } : undefined}>
            <RichTextCell
              value={
                item.description
                  ? ((item.title || "").trim() ? (item.title || "") + "\n" + (item.description || "") : (item.description || ""))
                  : item.title || ""
              }
              onChange={(html) => {
                const { title, description } = splitTitleDesc(html);
                onUpdate(index, "title", title);
                onUpdate(index, "description", description);
              }}
              className="w-full text-gray-900 bg-transparent border-0 outline-none leading-[1.4] px-0"
              placeholder="Bezeichnung..."
              onKeyDown={(e) => handleTabNav(e, "title")}
              testId={`input-title-${index}`}
              dataField="title"
              hideToolbar={!showFormatBar}
            />
            </div>
          </div>
          {(focused || selected || jumboMenuOpen) && (
          <div className="absolute right-1 top-1 flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-sm hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 focus:border-cyan-300 focus:bg-cyan-50 focus:text-cyan-700 focus:outline-none"
              onClick={(e) => {
                e.stopPropagation();
                onJumboMenuToggle();
              }}
              aria-label="Jumbo-Unterposition anlegen"
              title="Jumbo-Unterposition anlegen"
              data-testid={`button-jumbo-add-${index}`}
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          )}
          {jumboMenuOpen && (
            <div
              className="absolute right-1 top-full z-50 mt-1 w-36 rounded-md border border-slate-200 bg-white py-1 text-xs shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => onAddJumboChild("material")}>
                Material
              </button>
              <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => onAddJumboChild("leistung")}>
                Leistung
              </button>
              <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => onAddJumboChild("lohn")}>
                Lohn
              </button>
              <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => onAddJumboChild("manuell")} data-testid="jumbo-menu-manuell">
                Manuell
              </button>
            </div>
          )}
        </td>
        <td className="text-right py-1.5 pr-1 pl-0 align-top" style={{ width: cwEP }}>
          {showEP && (
            <button
              className="w-full text-right text-gray-800 bg-transparent border-0 outline-none hover:bg-cyan-50/60 focus:bg-cyan-50/60 rounded px-1 -mx-1 tabular-nums cursor-pointer leading-[1.4]"
              onClick={(e) => { e.stopPropagation(); onOpenPriceDialog(); }}
              data-field="unitPrice"
              data-testid={`button-price-${index}`}
            >
              {parseFloat(item.unitPrice || "0") !== 0 ? fmtP(item.unitPrice) : ""}
            </button>
          )}
        </td>
        <td className={`text-right py-1.5 pr-0.5 pl-0 align-top tabular-nums font-medium leading-[1.4] ${gpFlagColor}`} style={{ width: cwGP }}
          title={item.positionFlag === "alternativ" ? "Alternativposition" : item.positionFlag === "bedarf" ? "Bedarfsposition" : item.positionFlag === "festpreis" ? "Festpreisposition" : undefined}
        >
          {showGP && gp !== 0 ? fmtP(item.totalPrice) : ""}
        </td>
        {kalkCells}
      </tr>
    );
  }

  if (isSplitContinuation) {
    return (
      <tr
        ref={setNodeRef}
        className={`border-b border-slate-200 ${typeAccent} ${rowStateClasses({ selected, focused })}`}
        style={dndStyle}
        onClickCapture={onRowClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...rowMetaProps}
        data-row={index}
        data-testid={`pos-row-cont-${index}`}
      >
        {selectColContent(
          <span className="text-[7pt] text-gray-400 italic">{displayPos}</span>
        )}
        <td style={{ width: cwQty }}></td>
        <td style={{ width: cwUnit }}></td>
        <td className="py-1.5 px-1 align-top" onClick={(e) => e.stopPropagation()}>
          <div style={maxClipHeight ? { maxHeight: `${maxClipHeight}px`, overflow: "hidden" } : undefined}>
            <div style={splitOffsetHeight ? { marginTop: `-${splitOffsetHeight}px` } : undefined}>
            <RichTextCell
              value={
                item.description
                  ? ((item.title || "").trim() ? (item.title || "") + "\n" + (item.description || "") : (item.description || ""))
                  : item.title || ""
              }
              onChange={(html) => {
                const { title, description } = splitTitleDesc(html);
                onUpdate(index, "title", title);
                onUpdate(index, "description", description);
              }}
              className="w-full text-gray-900 bg-transparent border-0 outline-none leading-relaxed px-0"
              placeholder="Bezeichnung"
              onKeyDown={(e) => handleTabNav(e, "title")}
              testId={`input-title-cont-${index}`}
              dataField="title"
              hideToolbar={!showFormatBar}
            />
            </div>
          </div>
        </td>
        <td style={{ width: cwEP }}></td>
        <td style={{ width: cwGP }}></td>
        {showKalk && <td colSpan={3} className="border-l border-gray-100"></td>}
      </tr>
    );
  }

  return (
    <tr
      ref={setNodeRef}
      className={`border-b border-slate-200 ${typeAccent} ${rowStateClasses({ selected, focused, isZuschlag, markerColor })}`}
      style={{ ...dndStyle, ...altStyle }}
      onClickCapture={onRowClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...rowMetaProps}
      data-row={index}
      data-testid={`pos-row-${index}`}
    >
      {selectColContent(
        <div className="flex items-center gap-0.5 mt-0.5">
          {dragHandle}
          {posNrEditable ? (
            <input
              className="w-[32px] text-center bg-transparent border-0 outline-none focus:bg-cyan-50/60 rounded text-xs tabular-nums"
              value={(item as any).manualPosNr ?? displayPos}
              onChange={(e) => onUpdate(index, "manualPosNr", e.target.value)}
              onClick={(e) => e.stopPropagation()}
              data-testid={`input-posnr-${index}`}
            />
          ) : (
            <span>{displayPos}</span>
          )}
        </div>
      )}
      <td className="text-right py-1.5 px-1 align-top" style={{ width: cwQty }} onClick={(e) => e.stopPropagation()}>
        <input
          className="w-full text-right text-gray-800 bg-transparent border-0 outline-none focus:bg-cyan-50/60 rounded px-1 -mx-1 tabular-nums"
          value={qtyDisplay}
          onChange={(e) => handleQtyChange(e.target.value)}
          onBlur={(e) => handleQtyBlur(e.target.value)}
          onFocus={handleQtyFocus}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          onKeyDown={(e) => handleTabNav(e, "quantity")}
          data-field="quantity"
          data-testid={`input-qty-${index}`}
        />
        {origQtyHint && <div className="text-[9px] text-gray-400 text-right leading-tight mt-0.5">{origQtyHint}</div>}
      </td>
      <td className="text-left py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwUnit }} onClick={(e) => e.stopPropagation()}>
        {unitEditable ? (
          renderUnitEditor("w-full border-0 bg-transparent outline-none rounded cursor-pointer appearance-none text-gray-800", `select-unit-${index}`)
        ) : (
          <span className="text-gray-500 text-xs" data-field="unit">{item.unit || ""}</span>
        )}
      </td>
      <td className="py-1.5 px-1 align-top" onClick={(e) => e.stopPropagation()}>
        <div style={maxClipHeight ? { maxHeight: `${maxClipHeight}px`, overflow: "hidden" } : undefined}>
          <div style={splitOffsetHeight ? { marginTop: `-${splitOffsetHeight}px` } : undefined}>
          <RichTextCell
            value={
              item.description
                ? ((item.title || "").trim() ? (item.title || "") + "\n" + (item.description || "") : (item.description || ""))
                : item.title || ""
            }
            onChange={(html) => {
              const { title, description } = splitTitleDesc(html);
              onUpdate(index, "title", title);
              onUpdate(index, "description", description);
            }}
            className="w-full text-gray-900 bg-transparent border-0 outline-none leading-relaxed px-0"
            placeholder="Bezeichnung"
            onKeyDown={(e) => handleTabNav(e, "title")}
            testId={`input-title-${index}`}
            dataField="title"
            hideToolbar={!showFormatBar}
          />
          </div>
        </div>
      </td>
      <td className="text-right py-1.5 pr-1 pl-0 align-top" style={{ width: cwEP }}>
        {showEP && (
          <button
            className="w-full text-right text-gray-800 bg-transparent border-0 outline-none hover:bg-cyan-50/60 focus:bg-cyan-50/60 rounded px-1 -mx-1 tabular-nums cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onOpenPriceDialog(); }}
            data-field="unitPrice"
            data-testid={`input-ep-${index}`}
          >
            {parseFloat(item.unitPrice || "0") !== 0 ? fmtP(item.unitPrice) : fmtP(0)}
          </button>
        )}
      </td>
      <td className={`text-right py-1.5 pr-0.5 pl-0 align-top tabular-nums ${gpFlagColor}`} style={{ width: cwGP }}
        title={item.positionFlag === "alternativ" ? "Alternativposition" : item.positionFlag === "bedarf" ? "Bedarfsposition" : item.positionFlag === "festpreis" ? "Festpreisposition" : undefined}
      >
        {showGP && gp !== 0 ? fmtP(item.totalPrice) : ""}
        {quickActions}
      </td>
      {kalkCells}
    </tr>
  );
});
