import { useState, useEffect, useRef } from "react";
import type { Customer } from "@shared/schema";

export function SubMenu({
  label,
  icon,
  children,
  openLeft,
}: {
  label: string;
  icon?: string;
  children: React.ReactNode;
  openLeft?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [subOffset, setSubOffset] = useState(0);

  useEffect(() => {
    if (open && subRef.current && ref.current) {
      const subRect = subRef.current.getBoundingClientRect();
      const overflow = subRect.bottom - window.innerHeight + 8;
      if (overflow > 0) {
        setSubOffset(overflow);
      } else {
        setSubOffset(0);
      }
    }
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="w-full flex items-center justify-between gap-2 px-3 py-[5px] text-xs hover:bg-blue-50 hover:text-blue-900 text-left group">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="flex-1">{label}</span>
        <span className="text-gray-400 text-[10px] group-hover:text-blue-400">
          ▶
        </span>
      </button>
      {open && (
        <div
          ref={subRef}
          className={`absolute top-0 bg-white border border-gray-200 rounded shadow-2xl py-1 min-w-[220px] z-20`}
          style={{
            [openLeft ? "right" : "left"]: "100%",
            marginTop: `-${subOffset}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function CustomerSearchOverlay({
  customers,
  selectedId,
  onSelect,
}: {
  customers: Customer[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = search.trim()
    ? customers.filter((c) => {
        const q = search.toLowerCase();
        return (
          (c.name || "").toLowerCase().includes(q) ||
          (c.name2 || "").toLowerCase().includes(q) ||
          (c.customerNumber || "").toLowerCase().includes(q) ||
          (c.city || "").toLowerCase().includes(q)
        );
      })
    : customers;

  return (
    <>
      <div
        className="absolute inset-0 bg-white/80 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
        onClick={() => setOpen(true)}
        data-testid="button-change-customer"
      >
        <span className="text-xs text-blue-600 font-medium hover:underline">Kunde ändern</span>
      </div>
      {open && (
        <div ref={ref} className="absolute top-0 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-2xl w-[280px]" style={{ maxHeight: "360px" }}>
          <div className="p-2 border-b border-gray-100 sticky top-0 bg-white rounded-t-lg">
            <input
              ref={inputRef}
              type="text"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
              placeholder="Kunde suchen (Name, Nr, Ort)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-customer-search"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "300px" }}>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-gray-400"
              onClick={() => { onSelect(0); setOpen(false); }}
            >
              — Kein Kunde —
            </button>
            {filtered.slice(0, 50).map((c) => (
              <button
                key={c.id}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between ${
                  c.id === selectedId ? "bg-blue-100 text-blue-800 font-semibold" : ""
                }`}
                onClick={() => { onSelect(c.id); setOpen(false); }}
                data-testid={`customer-option-${c.id}`}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] text-gray-400 ml-1 shrink-0">({c.customerNumber})</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">Kein Kunde gefunden</div>
            )}
            {filtered.length > 50 && (
              <div className="px-3 py-1.5 text-[10px] text-gray-400 text-center">
                {filtered.length - 50} weitere — bitte Suche verfeinern
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function InsertMenu({
  x,
  y,
  onSelect,
  onClose,
  hasClipboard,
  onCut,
  onCopy,
  onPaste,
  onSelectTitleBlock,
  onSelectAll,
  isTitelRow,
  selectedCount,
  isAfterTotals,
  isBeforeTable,
  onBeforeTableInsert,
  onAbschlagInsert,
  hasProject,
  isJumboRow,
}: {
  x: number;
  y: number;
  onSelect: (type: string) => void;
  onClose: () => void;
  hasClipboard?: boolean;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onSelectTitleBlock?: () => void;
  onSelectAll?: () => void;
  isTitelRow?: boolean;
  selectedCount?: number;
  isAfterTotals?: boolean;
  isBeforeTable?: boolean;
  onBeforeTableInsert?: (type: string) => void;
  onAbschlagInsert?: () => void;
  hasProject?: boolean;
  isJumboRow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [adjustedTop, setAdjustedTop] = useState(y);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const overflow = rect.bottom - window.innerHeight + 8;
      if (overflow > 0) {
        setAdjustedTop(y - overflow);
      } else {
        setAdjustedTop(y);
      }
    }
  }, [y]);

  const menuW = 230;
  const top = adjustedTop;
  const openLeft = x + menuW + 240 > window.innerWidth;
  const left = openLeft
    ? Math.max(8, x - menuW)
    : Math.min(x, window.innerWidth - menuW - 8);

  const act = (id: string, handler?: () => void) => () => {
    handler ? handler() : onSelect(id);
    onClose();
  };

  const item = (
    id: string,
    label: string,
    shortcut?: string,
    handler?: () => void,
    disabled?: boolean,
  ) => (
    <button
      key={id}
      disabled={disabled}
      className={`w-full flex items-center justify-between px-3 py-[4px] text-xs text-left
        ${disabled ? "text-gray-300 cursor-default" : "hover:bg-blue-600 hover:text-white"}`}
      onClick={disabled ? undefined : act(id, handler)}
    >
      <span>{label}</span>
      {shortcut && (
        <span className="text-[10px] opacity-60 ml-4 shrink-0 font-mono">
          {shortcut}
        </span>
      )}
    </button>
  );

  const sep = () => <div className="border-t border-gray-200 my-0.5 mx-2" />;

  const Sub3 = ({
    label,
    children,
    openLeft: ol,
  }: {
    label: string;
    children: React.ReactNode;
    openLeft?: boolean;
  }) => {
    const [open, setOpen] = useState(false);
    const ref3 = useRef<HTMLDivElement>(null);
    const sub3Ref = useRef<HTMLDivElement>(null);
    const [sub3Offset, setSub3Offset] = useState(0);

    useEffect(() => {
      if (open && sub3Ref.current) {
        const rect = sub3Ref.current.getBoundingClientRect();
        const overflow = rect.bottom - window.innerHeight + 8;
        if (overflow > 0) {
          setSub3Offset(overflow);
        } else {
          setSub3Offset(0);
        }
      }
    }, [open]);

    return (
      <div
        ref={ref3}
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button className="w-full flex items-center justify-between px-3 py-[4px] text-xs hover:bg-blue-600 hover:text-white text-left">
          <span>{label}</span>
          <span className="text-[10px] opacity-50">▶</span>
        </button>
        {open && (
          <div
            ref={sub3Ref}
            className={`absolute top-0 bg-white border border-gray-200 rounded shadow-xl py-1 min-w-[160px] z-30`}
            style={{
              [ol ? "right" : "left"]: "100%",
              marginTop: `-${sub3Offset}px`,
            }}
          >
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[300]" onClick={onClose}>
      <div
        ref={ref}
        className="fixed bg-white border border-gray-300 rounded shadow-2xl py-1 w-[230px] text-gray-800"
        style={{ top, left, fontSize: "12px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {isAfterTotals ? (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Nach Endsumme einfügen
            </div>
            {item("freitext", "Freier Text")}
            {item("floskel", "Floskel")}
            {item("trennlinie", "Trennlinie")}
            {hasProject && (
              <>
                {sep()}
                {item("_abschlagrechnung", "Abschlagrechnung", undefined, () => onAbschlagInsert?.())}
              </>
            )}
          </>
        ) : isBeforeTable ? (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Vor Positionstabelle einfügen
            </div>
            {item("vt_freitext", "Freier Text", undefined, () => { onBeforeTableInsert?.("freitext"); })}
            {item("vt_floskel", "Floskel", undefined, () => { onBeforeTableInsert?.("floskel"); })}
            {item("vt_trennlinie", "Trennlinie", undefined, () => { onBeforeTableInsert?.("trennlinie"); })}
          </>
        ) : (
          <>
        <SubMenu label="Einfügen" openLeft={openLeft}>
          {item("titel", "Titel (Blocküberschrift)")}
          {item("untertitel", "Untertitel")}
          {sep()}
          {item("leistung", "Leistungs-Position", "F3")}
          {item("material", "Material-Position", "F2")}
          {item("lohn", "Lohn-Position", "Strg+D")}
          {item("jumbo", "JUMBO-Position", "F4")}
          <Sub3 label="Manuelle Position (frei)" openLeft={openLeft}>
            {item("manuell_material", "Material")}
            {item("manuell_leistung", "Leistung")}
            {item("manuell_lohn", "Lohn")}
            {item("jumbo_blank", "JUMBO")}
          </Sub3>
          {sep()}
          {item("titelsumme", "Titelsumme (Blocksumme)")}
          <Sub3 label="Prozentualer Zu- oder Abschlag" openLeft={openLeft}>
            {item("prozent_gesamt", "auf den Gesamtpreis")}
            {item("prozent_lohn_mat", "auf Lohn und Material")}
            {item("prozent_material", "nur auf Material")}
            {item("prozent_lohn", "nur auf Lohn")}
          </Sub3>
          {sep()}
          {item("abschluss", "Abschluß (Netto, USt, Brutto)")}
          {sep()}
          {item("freitext", "Freier Text")}
          {item("floskel", "Floskel")}
          <Sub3 label="Weitere Zeilen" openLeft={openLeft}>
            {item(
              "_paste",
              "Inhalt der Zwischenablage",
              "Strg+V",
              () => onPaste?.(),
              !hasClipboard,
            )}
            {sep()}
            {item("zwischensumme", "Zwischensumme")}
            {item("titelsumme", "Titel-Zwischensumme")}
            {sep()}
            {item("zuschlag", "Fester Zuschlag (+)")}
            {item("skonto", "Skonto / Abzug (−)")}
            {sep()}
            {item("fahrtkosten", "Fahrtkosten")}
            {item("frachtkosten", "Frachtkosten")}
            {sep()}
            {item("trennlinie", "Trennlinie (einfach)")}
          </Sub3>
        </SubMenu>

        <SubMenu label="Eigenschaften" openLeft={openLeft}>
          {item("_eigenschaften", "Zeilenoptionen...", "F6")}
          {item("_kalkulation", "Kalkulation / Preisermittlung")}
          {sep()}
          {item("_alternativ", "Setze Alternativ-Position")}
          {item("_bedarf", "Setze Bedarfsposition")}
          {sep()}
          {item("_seitenwechsel", "Seitenwechsel anfügen")}
        </SubMenu>

        {sep()}

        {item("ids_warenkorb", "Warenkorb aus GC/IDS Connect...")}
        {item("_materialpreise", "Materialpreise aktualisieren")}

        {isJumboRow ? (
          <SubMenu label="An JUMBO anhängen" openLeft={openLeft}>
            {item("jumbo_material", "Material")}
            {item("ids_warenkorb", "IDS Warenkorb...")}
            {item("jumbo_leistung", "Leistung")}
            {item("jumbo_lohn", "Lohn")}
            {item("jumbo_manuell", "Manuelle Position")}
          </SubMenu>
        ) : (
          item("jumbo_append_disabled", "An JUMBO anhängen", undefined, undefined, true)
        )}

        {sep()}

        {item("_cut", "Ausschneiden", "Strg+X", () => onCut?.())}
        {item("_copy", "Kopieren", "Strg+C", () => onCopy?.())}

        {sep()}

        <SubMenu label="Markierung" openLeft={openLeft}>
          {isTitelRow && item("_select_title", "Titel-Block markieren", undefined, () => { onSelectTitleBlock?.(); onClose(); })}
          {isTitelRow && item("_delete_title", "Titel-Block löschen")}
          {isTitelRow && item("_copy_title", "Titel-Block kopieren")}
          {isTitelRow && sep()}
          {item("_select_all", "Alle Positionen markieren", "Strg+A", () => { onSelectAll?.(); onClose(); })}
          {(selectedCount || 0) > 0 && item("_deselect", "Auswahl aufheben", undefined, () => { onSelect("_deselect"); })}
        </SubMenu>

        {sep()}

        {item("_delete", "Löschen", "Entf")}
        {(selectedCount || 0) > 1 && item("_delete_selected", `${selectedCount} markierte löschen`)}
          </>
        )}
      </div>
    </div>
  );
}
