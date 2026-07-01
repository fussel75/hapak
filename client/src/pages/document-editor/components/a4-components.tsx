import { useState } from "react";
import type { Customer, FormTemplate, CompanySettings, Project, Document as DocType } from "@shared/schema";
import { X } from "lucide-react";
import { fmtCurrency, fmtPercent, fmtNumber, fmtDocNumber } from "@/lib/format";
import { resolveTemplate } from "@shared/document-engine/template/resolve-template";
import type { ResolvedTemplate } from "@shared/document-engine/types";
import { buildVariableMap } from "@shared/document-engine/template/resolve-variable";
import { formatDocumentNumberWithCustomSuffix } from "@shared/document-engine/document-title";
import { getSafeTemplateImageUrl } from "@shared/document-engine/template/image-url";
import { parseFontSpec, PT_TO_PX, resolveVariable } from "../utils";
import { CustomerSearchOverlay } from "./menus";

const qrCodeUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='white'/%3E%3Cpath d='M6 6h18v18H6zM10 10v10h10V10zm30-4h18v18H40zM44 10v10h10V10zM6 40h18v18H6zM10 44v10h10V44zm30-10h6v6h-6zm8 0h10v6H48zm-14 8h6v16h-6zm8 8h6v8h-6zm8-8h8v6h-8zm0 12h8v4h-8z' fill='%23111111'/%3E%3C/svg%3E";

function splitTrailingGermanAmount(text: string): { label: string; amount: string } {
  const value = String(text || "").trim();
  const match = value.match(/^(.*?)(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/);
  if (!match) return { label: value, amount: "" };
  return { label: match[1].trimEnd(), amount: match[2] };
}

function isLogoField(field: any): boolean {
  const id = String(field.id || "").toLowerCase();
  const content = String(field.inhalt || "").trim().toLowerCase();
  return (
    id === "logo" ||
    id.startsWith("logo_") ||
    id.endsWith("_logo") ||
    content === "[firmenlogo]" ||
    content === "[logo]" ||
    content === "logo"
  );
}

function isQrField(field: any): boolean {
  const id = String(field.id || "").toLowerCase();
  const content = String(field.inhalt || "").trim().toLowerCase();
  return id.includes("qr") || content === "[qr-code]" || content === "qr-code";
}

export function LetterheadSection({
  docForm,
  setDocForm,
  setDirty,
  selectedCustomer,
  typeLabel,
  customers,
  projects,
  formTemplates,
  companySettings,
}: {
  docForm: any;
  setDocForm: (fn: (f: any) => any) => void;
  setDirty: (v: boolean) => void;
  selectedCustomer: Customer | undefined;
  typeLabel: string;
  customers: Customer[] | undefined;
  projects: Project[] | undefined;
  formTemplates: FormTemplate[] | undefined;
  companySettings: CompanySettings | undefined;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const customerProjects =
    projects?.filter((p) => !docForm.customerId || p.customerId === docForm.customerId) || [];

  const field = (
    key: string,
    value: string,
    placeholder: string,
    className = "",
  ) => {
    const isEditing = editing === key;
    if (key === "subject") {
      return (
        <div className={`${className}`} onClick={() => setEditing(key)}>
          {isEditing ? (
            <input
              autoFocus
              className="w-full text-sm font-semibold outline-none border-b-2 border-blue-400 bg-transparent py-0.5"
              value={value}
              onChange={(e) => {
                setDocForm((f: any) => ({ ...f, [key]: e.target.value }));
                setDirty(true);
              }}
              onBlur={() => setEditing(null)}
              placeholder={placeholder}
              data-testid={`input-${key}`}
            />
          ) : (
            <span
              className={`text-sm font-semibold cursor-text border-b border-dashed border-gray-200 hover:border-gray-400 inline-block min-w-[200px] ${value ? "" : "text-gray-300"}`}
            >
              {value || placeholder}
            </span>
          )}
        </div>
      );
    }
    return (
      <span
        className={`cursor-text border-b border-dashed border-gray-200 hover:border-gray-400 ${className} ${value ? "" : "text-gray-300"}`}
        onClick={() => setEditing(key)}
      >
        {isEditing ? (
          <input
            autoFocus
            className="outline-none bg-transparent border-b-2 border-blue-400 text-inherit font-inherit"
            value={value}
            onChange={(e) => {
              setDocForm((f: any) => ({ ...f, [key]: e.target.value }));
              setDirty(true);
            }}
            onBlur={() => setEditing(null)}
            placeholder={placeholder}
            data-testid={`input-${key}`}
          />
        ) : (
          value || placeholder
        )}
      </span>
    );
  };

  return (
    <div className="px-10 pt-8 pb-4 select-none">
      <div className="flex justify-between items-start mb-6">
        <div className="text-xs text-gray-400 space-y-0.5">
          <div className="font-bold text-gray-600 text-sm">
            {companySettings?.companyName || "FriStD-Bau ZuB GmbH & Co.KG"}
          </div>
          <div>
            {companySettings?.street || "Straße"} · {companySettings?.zip}{" "}
            {companySettings?.city}
          </div>
          <div>
            Tel: {companySettings?.phone} · {companySettings?.email}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-0.5">
          <div className="text-base font-bold text-gray-700">{typeLabel}</div>
          <div className="font-mono text-gray-600">
            Nr. {fmtDocNumber(docForm.documentNumber) || "—"}
          </div>
          <div>
            Datum:{" "}
            {docForm.date
              ? new Date(docForm.date).toLocaleDateString("de-DE")
              : "—"}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-start mb-5">
        <div className="border border-gray-200 rounded px-3 py-2 min-w-[250px] text-xs leading-5 relative group">
          <div className="absolute -top-2 left-2 text-[9px] bg-white px-1 text-gray-400">
            Empfänger
          </div>
          {selectedCustomer ? (
            <>
              <div className="font-semibold">{selectedCustomer.name}</div>
              {selectedCustomer.name2 && <div>{selectedCustomer.name2}</div>}
              {selectedCustomer.street && <div>{selectedCustomer.street}</div>}
              <div>
                {selectedCustomer.zip} {selectedCustomer.city}
              </div>
            </>
          ) : (
            <div className="text-gray-300 text-xs mt-2">Kein Kunde gewählt</div>
          )}
          <CustomerSearchOverlay
            customers={customers || []}
            selectedId={docForm.customerId || 0}
            onSelect={(id) => {
              setDocForm((f: any) => ({ ...f, customerId: id }));
              setDirty(true);
            }}
          />
        </div>

        <div className="text-xs space-y-1.5 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="text-gray-400">Projekt:</span>
            <select
              className="text-xs border-0 border-b border-dashed border-gray-300 bg-transparent outline-none text-right"
              value={docForm.projectId || ""}
              onChange={(e) => {
                const projectId = parseInt(e.target.value) || 0;
                const project = projects?.find((p) => p.id === projectId);
                setDocForm((f: any) => ({
                  ...f,
                  projectId,
                  customerId: project?.customerId || f.customerId,
                }));
                setDirty(true);
              }}
              data-testid="select-project"
            >
              <option value="">Kein Projekt</option>
              {customerProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {fmtDocNumber(p.projectNumber)} - {p.name}
                </option>
              ))}
            </select>
          </div>
          {["angebot", "auftragsbestaetigung"].includes(docForm.type) && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-gray-400">Gültig bis:</span>
            <input
              type="date"
              className="text-xs border-0 border-b border-dashed border-gray-300 bg-transparent outline-none"
              value={docForm.validUntil || ""}
              onChange={(e) => {
                setDocForm((f: any) => ({ ...f, validUntil: e.target.value }));
                setDirty(true);
              }}
              data-testid="input-valid-until"
            />
          </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <span className="text-gray-400">MwSt:</span>
            <input
              className="text-xs border-0 border-b border-dashed border-gray-300 bg-transparent outline-none w-12 text-right"
              value={docForm.taxRate}
              onChange={(e) => {
                setDocForm((f: any) => ({ ...f, taxRate: e.target.value }));
                setDirty(true);
              }}
              data-testid="input-tax-rate"
            />
            <span className="text-gray-400">%</span>
          </div>
        </div>
      </div>

      <div className="mb-4">
        {field("subject", docForm.subject, "Betreff eingeben...", "block")}
      </div>

    </div>
  );
}

export function A4TemplateField({
  field,
  variables,
  isFooterField,
  companyLogoUrl,
}: {
  field: any;
  variables: Record<string, string>;
  isFooterField?: boolean;
  companyLogoUrl?: string | null;
}) {
  if (field.id === "arbeitsbereich" || field.id?.startsWith("arbeitsbereich") || field.inhalt === "[Arbeitsbereich]" || field.typ === "Arbeitsbereich") return null;
  if (field.aktiv === false) return null;

  const { fontFamily, fontSize, fontWeight } = parseFontSpec(field.font);
  const style: any = {
    position: "absolute",
    left: `${field.x * PT_TO_PX}px`,
    top: `${field.y * PT_TO_PX}px`,
    width: `${field.w * PT_TO_PX}px`,
    minHeight: field.h ? `${field.h * PT_TO_PX}px` : "auto",
    fontFamily,
    fontSize: `${fontSize * PT_TO_PX}px`,
    fontWeight,
    color: field.farbe || "#000",
    lineHeight: 1.3,
    textAlign: field.ausrichtung === "rechts" ? "right" : field.ausrichtung === "zentriert" ? "center" : "left",
    whiteSpace: "pre-wrap",
    pointerEvents: "none",
  };
  if (isFooterField) {
    style.zIndex = 10;
    style.backgroundColor = "white";
  }

  const shouldRenderImage = field.typ === "Bild" || isLogoField(field) || isQrField(field);
  if (shouldRenderImage) {
    let imgSrc = getSafeTemplateImageUrl(field.imageUrl);
    if (!imgSrc) {
      imgSrc = isQrField(field) ? qrCodeUrl : isLogoField(field) ? getSafeTemplateImageUrl(companyLogoUrl) : "";
    }
    if (!imgSrc) return null;
    return (
      <div style={style} data-testid={`tmpl-field-${field.id}`}>
        <img
          src={imgSrc}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }

  let content = field.inhalt || "";
  if (field.typ === "Variabel" || field.typ === "Variable") {
    content = resolveVariable(content, variables);
  }

  return (
    <div style={style} data-testid={`tmpl-field-${field.id}`}>
      {content}
    </div>
  );
}

export function SummaryAndFooterBlock({
  netTotal, taxAmount, grossTotal, laborTotal,
  docForm, setDocForm, setDirty,
  isAbschlagOrSchluss, abschlagData,
  showKalk, ekTotal, margeTotal,
  endsummeConfig,
  onNettoClick,
  skontoItems,
  onUpdateItem,
  onRemoveItem,
  allItems,
  focusedRow,
  onFocusRow,
  selectedRows,
  onToggleSelect,
  noNettoSingleTax,
  par13bActive,
  par13bText,
  dezimalstellenPreise = 2,
  skontoImDokument = true,
  gpColumnPercent,
}: {
  netTotal: number; taxAmount: number; grossTotal: number; laborTotal: number;
  docForm: any; setDocForm: (fn: (f: any) => any) => void; setDirty: (v: boolean) => void;
  isAbschlagOrSchluss: boolean; abschlagData: any;
  showKalk: boolean; ekTotal: number; margeTotal: number;
  endsummeConfig?: any;
  onNettoClick?: () => void;
  skontoItems?: any[];
  onUpdateItem?: (index: number, field: string, value: string) => void;
  onRemoveItem?: (index: number) => void;
  allItems?: any[];
  focusedRow?: number | null;
  onFocusRow?: (index: number) => void;
  selectedRows?: Set<number>;
  onToggleSelect?: (index: number, e: React.MouseEvent) => void;
  noNettoSingleTax?: boolean;
  par13bActive?: boolean;
  par13bText?: string;
  dezimalstellenPreise?: number;
  skontoImDokument?: boolean;
  gpColumnPercent?: number;
}) {

  const ec = {
    schriftart: "Nimbus Sans 9pt",
    schriftartGesamt: "Nimbus Sans Bold 10pt",
    labelNetto: "Nettosumme",
    labelMwst: "Umsatzsteuer {satz} %",
    labelGesamt: "Gesamtsumme",
    labelLohn: "Enthaltener Lohnanteil gem. §35a EStG: {betrag}",
    linienBreite: 0.5,
    linienBreiteGesamt: 1,
    abstandZeilen: 4,
    ...endsummeConfig,
  };

  const nettoFont = parseFontSpec(ec.schriftart);
  const gesamtFont = parseFontSpec(ec.schriftartGesamt);
  const skontoFont = parseFontSpec(ec.schriftartSkonto || ec.schriftart);
  const fmtP = (v: string | number | null | undefined) => fmtCurrency(v, dezimalstellenPreise);
  const mwstLabel = (ec.labelMwst || "zzgl. {satz} % MwSt.").replace("{satz}", fmtNumber(docForm.taxRate));
  const lohnLabel = (ec.labelLohn || "dav. Lohnanteil (§35a EstG): {betrag}").replace("{betrag}", fmtP(laborTotal));
  const valueColPct = gpColumnPercent ? `${gpColumnPercent}%` : "18%";
  const labelColPct = gpColumnPercent ? `${100 - gpColumnPercent}%` : "82%";
  const summaryCellBase = "py-1.5 text-slate-900";
  const summaryValueBase = "py-1.5 pr-0.5 pl-0 text-right tabular-nums text-slate-900";
  const summaryEditButtonClass = "absolute right-0 top-1/2 -translate-y-1/2 rounded-sm p-0.5 opacity-0 transition-opacity text-slate-300 hover:text-red-500 group-hover:opacity-70";

  const toggleHide = (field: "hideNetto" | "hideMwst" | "hideGesamt" | "showLohnanteil") => {
    setDocForm((f: any) => ({ ...f, [field]: !f[field] }));
    setDirty(true);
  };

  const effectiveHideNetto = docForm.hideNetto === true;
  const anyHidden = effectiveHideNetto || docForm.hideMwst || docForm.hideGesamt;
  const needsTopBorderOnMwst = effectiveHideNetto && !docForm.hideMwst;
  const needsTopBorderOnGesamt = effectiveHideNetto && docForm.hideMwst && !docForm.hideGesamt;

  return (
    <div className="pb-4">
      {anyHidden && (
        <div className="flex items-center gap-2 py-1 text-[8px] text-gray-400 italic flex-wrap" data-testid="hidden-summary-lines">
          <span>Ausgeblendet:</span>
          {effectiveHideNetto && (
            <button
              className="text-blue-400 hover:text-blue-600 underline"
              onClick={() => toggleHide("hideNetto")}
              data-testid="button-restore-netto"
            >Nettosumme</button>
          )}
          {docForm.hideMwst && (
            <button
              className="text-blue-400 hover:text-blue-600 underline"
              onClick={() => toggleHide("hideMwst")}
              data-testid="button-restore-mwst"
            >Umsatzsteuer</button>
          )}
          {docForm.hideGesamt && (
            <button
              className="text-blue-400 hover:text-blue-600 underline"
              onClick={() => toggleHide("hideGesamt")}
              data-testid="button-restore-gesamt"
            >Gesamtsumme</button>
          )}
        </div>
      )}
      <table className="w-full border-collapse table-fixed text-slate-900" style={{ fontFamily: nettoFont.fontFamily, fontSize: `${nettoFont.fontSize}pt` }} data-testid="table-summary">
        <colgroup>
          <col style={{ width: labelColPct }} />
          <col style={{ width: valueColPct }} />
        </colgroup>
        <tbody>
          {!effectiveHideNetto && (
            <tr className="group/netto">
              <td className={`${summaryCellBase} relative pr-4`} style={{ borderTop: `${ec.linienBreite}pt solid #d1d5db`, fontWeight: nettoFont.fontWeight }}>
                {ec.labelNetto}
                <button
                  className={summaryEditButtonClass}
                  onClick={() => toggleHide("hideNetto")}
                  title="Nettosumme ausblenden"
                  data-testid="button-hide-netto"
                ><X className="h-2.5 w-2.5" aria-hidden="true" /></button>
              </td>
              <td
                className={`${summaryValueBase} ${onNettoClick ? "cursor-pointer" : ""}`}
                style={{ borderTop: `${ec.linienBreite}pt solid #d1d5db`, fontWeight: "bold" }}
                data-testid="text-summary-netto"
                onClick={onNettoClick}
              >
                {fmtP(netTotal)}
              </td>
            </tr>
          )}
          {par13bActive ? (
            <tr>
              <td className="text-gray-500 italic text-xs" colSpan={2} style={{ paddingTop: `${ec.abstandZeilen * 0.5}px`, paddingBottom: `${ec.abstandZeilen * 0.5}px`, ...(needsTopBorderOnMwst ? { borderTop: `${ec.linienBreite}pt solid #d1d5db` } : {}) }}>
                {par13bText || "Steuerschuldnerschaft des Leistungsempfängers gem. §13b UStG"}
              </td>
            </tr>
          ) : !docForm.hideMwst && (
            <tr className="group/mwst">
              <td className="relative pr-4 text-slate-600" style={{ paddingTop: `${ec.abstandZeilen * 0.5}px`, paddingBottom: `${ec.abstandZeilen * 0.5}px`, ...(needsTopBorderOnMwst ? { borderTop: `${ec.linienBreite}pt solid #d1d5db` } : {}) }}>
                {mwstLabel}
                <button
                  className={summaryEditButtonClass}
                  onClick={() => toggleHide("hideMwst")}
                  title="Umsatzsteuer ausblenden"
                  data-testid="button-hide-mwst"
                ><X className="h-2.5 w-2.5" aria-hidden="true" /></button>
              </td>
              <td className="pr-0.5 pl-0 text-right tabular-nums text-slate-600" style={{ paddingTop: `${ec.abstandZeilen * 0.5}px`, paddingBottom: `${ec.abstandZeilen * 0.5}px`, ...(needsTopBorderOnMwst ? { borderTop: `${ec.linienBreite}pt solid #d1d5db` } : {}) }} data-testid="text-summary-mwst">
                {fmtP(taxAmount)}
              </td>
            </tr>
          )}
          {!docForm.hideGesamt && (() => {
            const isDoppelt = ec.gesamtUnterstreichung === "doppelt";
            const topBorder = `${needsTopBorderOnGesamt ? ec.linienBreite : ec.linienBreiteGesamt}pt solid ${needsTopBorderOnGesamt ? "#d1d5db" : "#1f2937"}`;
            const bottomBorder = isDoppelt ? `${ec.linienBreiteGesamt || 1}pt solid #1f2937` : undefined;
            return (
              <tr className="group/gesamt">
                <td className="relative pr-4 font-bold text-slate-950" style={{ borderTop: topBorder, borderBottom: bottomBorder, paddingTop: "6px", paddingBottom: "6px", fontFamily: gesamtFont.fontFamily, fontSize: `${gesamtFont.fontSize}pt`, fontWeight: gesamtFont.fontWeight }}>
                  {ec.labelGesamt}
                  <button
                    className={summaryEditButtonClass}
                    onClick={() => toggleHide("hideGesamt")}
                    title="Gesamtsumme ausblenden"
                    data-testid="button-hide-gesamt"
                  ><X className="h-2.5 w-2.5" aria-hidden="true" /></button>
                </td>
                <td className="pr-0.5 pl-0 text-right tabular-nums text-slate-950" style={{ borderTop: topBorder, borderBottom: bottomBorder, paddingTop: "6px", paddingBottom: "6px", fontFamily: gesamtFont.fontFamily, fontSize: `${gesamtFont.fontSize}pt`, fontWeight: gesamtFont.fontWeight }} data-testid="text-summary-brutto">
                  {fmtP(par13bActive ? netTotal : grossTotal)}
                </td>
              </tr>
            );
          })()}
          {laborTotal > 0 && !docForm.hideGesamt && (
            <tr className="group/lohn">
              {docForm.showLohnanteil ? (
                <td className="relative py-0.5 pr-4 text-gray-400" colSpan={2} style={{ fontSize: `${Math.max(nettoFont.fontSize - 1, 8)}pt` }}>
                  {lohnLabel}
                  <button
                    className={summaryEditButtonClass}
                    onClick={() => toggleHide("showLohnanteil")}
                    title="Lohnanteil ausblenden"
                    data-testid="button-hide-lohnanteil"
                  ><X className="h-2.5 w-2.5" aria-hidden="true" /></button>
                </td>
              ) : (
                <td className="py-0.5" colSpan={2}>
                  <button
                    className="opacity-0 group-hover/lohn:opacity-70 text-[8px] text-slate-400 hover:text-slate-700 transition-opacity"
                    onClick={() => toggleHide("showLohnanteil")}
                    data-testid="button-show-lohnanteil"
                  >+ Lohnanteil §35a anzeigen</button>
                </td>
              )}
            </tr>
          )}
          {skontoImDokument && !(docForm.abschlagVerrechnungen?.length > 0) && skontoItems && skontoItems.length > 0 && skontoItems.map((skontoItem: any) => {
            const skontoIdx = allItems ? allItems.indexOf(skontoItem) : -1;
            const skontoAmount = parseFloat(skontoItem.totalPrice || "0");
            const skontoHint = splitTrailingGermanAmount(skontoItem.description || "");
            const isFocused = focusedRow !== undefined && focusedRow === skontoIdx;
            const isSelected = selectedRows?.has(skontoIdx);
            return [
              <tr
                key={skontoItem._clientId || skontoItem.id}
                className={`group/skonto cursor-pointer ${isFocused ? "bg-blue-50" : ""} ${isSelected ? "bg-blue-100" : ""}`}
                onClick={(e) => {
                  if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    onToggleSelect?.(skontoIdx, e);
                  } else {
                    onFocusRow?.(skontoIdx);
                  }
                }}
                data-testid={`skonto-row-${skontoIdx}`}
              >
                <td className="text-slate-800 py-1" style={{ borderTop: `${ec.linienBreite}pt solid #d1d5db`, paddingTop: "6px", paddingBottom: "3px", fontFamily: skontoFont.fontFamily, fontSize: `${skontoFont.fontSize}pt`, lineHeight: "13pt" }}>
                  <input
                    type="text"
                    value={skontoItem.title || ""}
                    onChange={(e) => skontoIdx >= 0 && onUpdateItem?.(skontoIdx, "title", e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-slate-800 leading-snug"
                    placeholder="Skonto..."
                    data-testid={`skonto-title-${skontoIdx}`}
                  />
                </td>
                <td className="relative py-1 pr-0.5 pl-0 text-right tabular-nums text-slate-900" style={{ borderTop: `${ec.linienBreite}pt solid #d1d5db`, paddingTop: "6px", paddingBottom: "3px", fontFamily: skontoFont.fontFamily, fontSize: `${skontoFont.fontSize}pt`, lineHeight: "13pt" }} data-testid={`skonto-amount-${skontoIdx}`}>
                  {fmtP(skontoAmount)}
                  <button
                    className={summaryEditButtonClass}
                    onClick={(e) => { e.stopPropagation(); skontoIdx >= 0 && onRemoveItem?.(skontoIdx); }}
                    title="Skonto entfernen"
                  ><X className="h-2.5 w-2.5" aria-hidden="true" /></button>
                </td>
              </tr>,
              <tr key={`${skontoItem._clientId || skontoItem.id}-hint`}>
                <td className="text-right pt-0 pb-1.5" style={{ fontFamily: skontoFont.fontFamily, fontSize: `${skontoFont.fontSize}pt`, lineHeight: "12pt" }}>
                  <input
                    type="text"
                    value={skontoHint.label}
                    onChange={(e) => skontoIdx >= 0 && onUpdateItem?.(skontoIdx, "description", `${e.target.value}${skontoHint.amount ? ` ${skontoHint.amount}` : ""}`)}
                    className="w-full bg-transparent border-none outline-none text-right text-slate-800 leading-snug"
                    placeholder={`Zahlbetrag bei Skontoabzug ${fmtPercent(parseFloat(docForm.skontoPercent || "0"))}...`}
                    data-testid={`skonto-hint-${skontoIdx}`}
                  />
                </td>
                <td className="pr-0.5 pl-0 text-right tabular-nums text-slate-800 pt-0 pb-1.5" style={{ fontFamily: skontoFont.fontFamily, fontSize: `${skontoFont.fontSize}pt`, lineHeight: "12pt" }} data-testid={`skonto-hint-amount-${skontoIdx}`}>
                  {skontoHint.amount}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>

      {(() => {
        const verrechnungen: any[] = docForm.abschlagVerrechnungen || [];
        const retPct = parseFloat(docForm.retentionPercent || "0");
        const hasVerrechnungen = verrechnungen.length > 0;
        const hasRetention = retPct > 0;
        if (!hasVerrechnungen && !hasRetention) return null;

        const sumAbschlaege = verrechnungen.reduce((s: number, v: any) => s + (parseFloat(v.grossAmount) || 0), 0);
        const restBetrag = grossTotal - sumAbschlaege;
        const einbehaltBetrag = hasRetention ? Math.round(restBetrag * retPct) / 100 : 0;
        const zahlbetrag = restBetrag - einbehaltBetrag;

        return (
          <div className="mt-4" data-testid="abschlag-verrechnung">
            {hasVerrechnungen && (
              <table className="w-full border-collapse table-fixed" style={{ borderTop: "1px solid #000", borderBottom: "1px solid #000", fontFamily: nettoFont.fontFamily, fontSize: `${nettoFont.fontSize}pt` }}>
                <colgroup>
                  <col style={{ width: `${100 - 12 - 12 - 7 - 10 - parseFloat(valueColPct)}%` }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: valueColPct }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-400">
                    <th className="text-left py-1 font-semibold">RECHNUNGEN</th>
                    <th className="text-left py-1 font-normal text-gray-500">VOM</th>
                    <th className="text-right py-1 font-normal text-gray-500">NETTO</th>
                    <th className="text-center py-1 font-normal text-gray-500">SATZ</th>
                    <th className="text-right py-1 font-normal text-gray-500">UST</th>
                    <th className="text-right py-1 font-normal text-gray-500">BRUTTO</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200">
                    <td className="py-1.5 font-medium">{ec.labelGesamtrechnungsbetrag || "Gesamtrechnungsbetrag"}</td>
                    <td className="py-1.5 text-gray-600">
                      {docForm.date ? new Date(docForm.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}
                    </td>
                    <td className="text-right py-1.5 tabular-nums">{fmtCurrency(netTotal)}</td>
                    <td className="text-center py-1.5">{docForm.taxRate || "19"}%</td>
                    <td className="text-right py-1.5 tabular-nums">{fmtCurrency(taxAmount)}</td>
                    <td className="text-right py-1.5 tabular-nums">{fmtCurrency(grossTotal)}</td>
                  </tr>
                  {verrechnungen.map((v: any, vi: number) => {
                    const vNet = parseFloat(v.netAmount) || 0;
                    const vGross = parseFloat(v.grossAmount) || 0;
                    const vTax = vGross - vNet;
                    const vDate = v.date ? new Date(v.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
                    return (
                      <tr key={vi} className="border-b border-gray-200 group/vrow">
                        <td className="py-1.5">
                          {v.label ? v.label.replace(/[A-Z]{2,4}\d{8,}/, (m: string) => fmtDocNumber(m)) : `${vi + 1}. Rechnung ${fmtDocNumber(v.documentNumber)}`}
                          <button
                            className="ml-1 opacity-0 group-hover/vrow:opacity-100 text-red-300 hover:text-red-500 transition-opacity text-[10px]"
                            onClick={() => {
                              setDocForm((f: any) => ({
                                ...f,
                                abschlagVerrechnungen: (f.abschlagVerrechnungen || []).filter((_: any, i: number) => i !== vi),
                              }));
                              setDirty(true);
                            }}
                            title="Verrechnung entfernen"
                          >×</button>
                        </td>
                        <td className="py-1.5 text-gray-600">{vDate}</td>
                        <td className="text-right py-1.5 tabular-nums">{fmtCurrency(vNet)}</td>
                        <td className="text-center py-1.5">{docForm.taxRate || "19"}%</td>
                        <td className="text-right py-1.5 tabular-nums">{fmtCurrency(vTax)}</td>
                        <td className="text-right py-1.5 tabular-nums">{fmtCurrency(vGross)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-b border-gray-400">
                    <td className="py-1.5 font-medium">{ec.labelSummeAbschlaege || "Summe Abschläge/Teilrechnungen"}</td>
                    <td></td>
                    <td className="text-right py-1.5 tabular-nums">
                      {fmtCurrency(verrechnungen.reduce((s: number, v: any) => s + (parseFloat(v.netAmount) || 0), 0))}
                    </td>
                    <td className="text-center py-1.5">{docForm.taxRate || "19"}%</td>
                    <td className="text-right py-1.5 tabular-nums">
                      {fmtCurrency(sumAbschlaege - verrechnungen.reduce((s: number, v: any) => s + (parseFloat(v.netAmount) || 0), 0))}
                    </td>
                    <td className="text-right py-1.5 tabular-nums">{fmtCurrency(sumAbschlaege)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-bold">{ec.labelRestsumme || "Restsumme"}</td>
                    <td></td>
                    <td className="text-right py-1.5 tabular-nums font-bold">
                      {fmtCurrency(netTotal - verrechnungen.reduce((s: number, v: any) => s + (parseFloat(v.netAmount) || 0), 0))}
                    </td>
                    <td className="text-center py-1.5 font-bold">{docForm.taxRate || "19"}%</td>
                    <td className="text-right py-1.5 tabular-nums font-bold">
                      {fmtCurrency(taxAmount - (sumAbschlaege - verrechnungen.reduce((s: number, v: any) => s + (parseFloat(v.netAmount) || 0), 0)))}
                    </td>
                    <td className="text-right py-1.5 tabular-nums font-bold">{fmtCurrency(restBetrag)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {hasRetention && (
              <div className="mt-2 space-y-1" style={{ fontFamily: nettoFont.fontFamily, fontSize: `${nettoFont.fontSize}pt` }}>
                <div className="flex justify-between text-gray-600">
                  <span>./. {fmtNumber(retPct)} % Sicherheitseinbehalt:</span>
                  <span className="tabular-nums">-{fmtCurrency(einbehaltBetrag)} €</span>
                </div>
              </div>
            )}
            {(hasVerrechnungen || hasRetention) && (
              <table className="w-full border-collapse table-fixed mt-1" style={{ fontFamily: gesamtFont.fontFamily, fontSize: `${gesamtFont.fontSize}pt`, fontWeight: gesamtFont.fontWeight }}>
                <colgroup>
                  <col style={{ width: labelColPct }} />
                  <col style={{ width: valueColPct }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="font-bold py-1" style={{ borderTop: "2px solid #1f2937" }}>
                      {ec.labelZahlbetrag || "Zahlbetrag:"}
                    </td>
                    <td className="text-right font-extrabold tabular-nums py-1" style={{ borderTop: "2px solid #1f2937" }} data-testid="text-zahlbetrag">
                      {fmtCurrency(zahlbetrag)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            {skontoImDokument && hasVerrechnungen && skontoItems && skontoItems.length > 0 && parseFloat(docForm.skontoPercent || "0") > 0 && (docForm.skontoDays || 0) > 0 && (() => {
              const skontoOnZahlbetrag = -(Math.abs(zahlbetrag) * parseFloat(docForm.skontoPercent || "0") / 100);
              const zahlbetragNachSkonto = zahlbetrag + skontoOnZahlbetrag;
              return (
                <table className="w-full border-collapse table-fixed mt-1" style={{ fontFamily: skontoFont.fontFamily, fontSize: `${skontoFont.fontSize}pt` }}>
                  <colgroup>
                    <col style={{ width: labelColPct }} />
                    <col style={{ width: valueColPct }} />
                  </colgroup>
                  <tbody>
                    {skontoItems.map((skontoItem: any) => {
                      const skontoIdx = allItems ? allItems.indexOf(skontoItem) : -1;
                      const isFocused = focusedRow !== undefined && focusedRow === skontoIdx;
                      const isSelected = selectedRows?.has(skontoIdx);
                      return [
                        <tr
                          key={skontoItem._clientId || skontoItem.id}
                          className={`group/skonto cursor-pointer ${isFocused ? "bg-blue-50" : ""} ${isSelected ? "bg-blue-100" : ""}`}
                          onClick={(e) => {
                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                              onToggleSelect?.(skontoIdx, e);
                            } else {
                              onFocusRow?.(skontoIdx);
                            }
                          }}
                          data-testid={`skonto-row-${skontoIdx}`}
                        >
                          <td className="text-slate-800 py-1">
                            <input
                              type="text"
                              value={skontoItem.title || ""}
                              onChange={(e) => skontoIdx >= 0 && onUpdateItem?.(skontoIdx, "title", e.target.value)}
                              className="w-full bg-transparent border-none outline-none text-slate-800"
                              placeholder="Skonto..."
                              data-testid={`skonto-title-${skontoIdx}`}
                            />
                          </td>
                          <td className="relative pr-0.5 pl-0 text-right tabular-nums py-1 whitespace-nowrap text-slate-900" data-testid={`skonto-amount-${skontoIdx}`}>
                            {fmtCurrency(skontoOnZahlbetrag)}
                            <button
                              className={summaryEditButtonClass}
                              onClick={(e) => { e.stopPropagation(); skontoIdx >= 0 && onRemoveItem?.(skontoIdx); }}
                              title="Skonto entfernen"
                            ><X className="h-2.5 w-2.5" aria-hidden="true" /></button>
                          </td>
                        </tr>,
                        <tr key={`${skontoItem._clientId || skontoItem.id}-hint`}>
                          <td className="text-right py-0.5 text-slate-800" style={{ fontFamily: skontoFont.fontFamily, fontSize: `${skontoFont.fontSize}pt` }} data-testid={`skonto-hint-${skontoIdx}`}>
                            Zahlbetrag bei Skontoabzug {fmtPercent(parseFloat(docForm.skontoPercent || "0"))}
                          </td>
                          <td className="pr-0.5 pl-0 text-right tabular-nums py-0.5 text-slate-800" style={{ fontFamily: skontoFont.fontFamily, fontSize: `${skontoFont.fontSize}pt` }} data-testid={`skonto-hint-amount-${skontoIdx}`}>
                            {fmtCurrency(zahlbetragNachSkonto)}
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
        );
      })()}

      

      {showKalk && (
        <div className="mt-6 pt-4 border-t border-dashed border-gray-200">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Kalkulation (intern)
          </div>
          <div className="flex gap-6 text-xs">
            <div>
              <div className="text-gray-400">EK gesamt</div>
              <div className="font-mono font-semibold">{fmtCurrency(ekTotal)}</div>
            </div>
            <div>
              <div className="text-gray-400">VK Netto</div>
              <div className="font-mono font-semibold">{fmtCurrency(netTotal)}</div>
            </div>
            <div>
              <div className="text-gray-400">Marge</div>
              <div className={`font-mono font-semibold ${margeTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmtCurrency(margeTotal)}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Aufschlag</div>
              <div className="font-mono font-semibold text-blue-600">
                {ekTotal > 0 ? fmtPercent((netTotal / ekTotal - 1) * 100) : "—"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function A4PageWrapper({
  docForm,
  setDocForm,
  setDirty,
  formTemplates,
  resolvedTemplate,
  selectedCustomer,
  typeLabel,
  projects,
  companySettings,
  customers,
  children,
  pageNumber = 1,
  totalPages = 1,
  onVortextContextMenu,
  carryForwardOut,
}: {
  docForm: any;
  setDocForm: (fn: (f: any) => any) => void;
  setDirty: (v: boolean) => void;
  formTemplates: FormTemplate[] | undefined;
  resolvedTemplate?: ResolvedTemplate;
  selectedCustomer: Customer | undefined;
  typeLabel: string;
  projects: Project[] | undefined;
  companySettings: CompanySettings | undefined;
  customers: Customer[] | undefined;
  children: any;
  pageNumber?: number;
  totalPages?: number;
  onVortextContextMenu?: (e: React.MouseEvent) => void;
  carryForwardOut?: number;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const isPage1 = pageNumber === 1;

  const effectiveTmplId = docForm.formTemplateId || companySettings?.defaultFormTemplateId;
  const activeTemplate = effectiveTmplId ? formTemplates?.find(t => t.id === effectiveTmplId) : undefined;
  const resolved = resolvedTemplate || resolveTemplate(
    activeTemplate ? { id: activeTemplate.id, name: activeTemplate.name, type: activeTemplate.type || undefined, fields: activeTemplate.fields as any, fieldsPage2: activeTemplate.fieldsPage2 as any, workArea: activeTemplate.workArea as any } : undefined,
    companySettings ? { companyName: companySettings.companyName, companyName2: companySettings.companyName2, street: companySettings.street, zip: companySettings.zip, city: companySettings.city, phone: companySettings.phone, fax: companySettings.fax, email: companySettings.email, website: companySettings.website, taxId: companySettings.taxId, vatId: companySettings.vatId, managingDirector: companySettings.managingDirector, bankName: companySettings.bankName, iban: companySettings.iban, bic: companySettings.bic, materialMarkupPercent: companySettings.materialMarkupPercent || undefined, defaultFormTemplateId: companySettings.defaultFormTemplateId } : undefined,
  );
  const tmplFields = isPage1 ? resolved.page1Fields : resolved.page2Fields;
  const waArea = isPage1 ? resolved.workAreaPage1 : resolved.workAreaPage2;
  const footerY = isPage1 ? resolved.footerYPage1 : resolved.footerYPage2;
  const waX = waArea.x;
  const waY = waArea.y;
  const waW = waArea.w;
  const footerLimit = Math.max(0, footerY - waY);
  const usableUntilFooter = Math.max(0, footerLimit - 24);
  const waMaxH = Math.min(Math.max(waArea.h, usableUntilFooter), footerLimit);
  const selectedProject = projects?.find(p => p.id === docForm.projectId);
  const hasBetreffField = isPage1 && tmplFields.some((f: any) => f.id === "betreff" || (f.typ === "Variabel" && f.inhalt?.includes("[Betreff]")));
  const templateVars = buildVariableMap(
    { ...docForm, documentNumber: docForm.documentNumber || "", type: docForm.type || "angebot", customerId: docForm.customerId || 0, date: docForm.date || "", status: docForm.status || "entwurf" },
    selectedCustomer || undefined,
    selectedProject || undefined,
    companySettings ? { companyName: companySettings.companyName, city: companySettings.city } : undefined,
    pageNumber,
    totalPages,
  );
  templateVars["Dokumenttyp"] = typeLabel;
  templateVars["Dok.-Nr."] = formatDocumentNumberWithCustomSuffix(docForm.documentNumber, docForm.customTypeLabel);
  templateVars["Projektnummer"] = fmtDocNumber(selectedProject?.projectNumber);
  templateVars["ProjektNr"] = fmtDocNumber(selectedProject?.projectNumber);

  return (
    <div
      className="a4-page bg-white mx-auto shadow-xl relative"
      style={{ width: "595pt", height: "842pt", overflowX: "visible", overflowY: "hidden", padding: 0, position: "relative" }}
      data-testid={`a4-page-${pageNumber}`}
    >
      {tmplFields.map((field: any) => {
        if (isPage1 && (field.id === "kundenadresse" || field.id === "adresse" || ((field.typ === "Variabel" || field.typ === "Variable") && field.inhalt?.includes("[Kundenadresse]")))) {
          const { fontFamily, fontSize, fontWeight } = parseFontSpec(field.font);
          const style: any = {
            position: "absolute",
            left: `${field.x * PT_TO_PX}px`,
            top: `${field.y * PT_TO_PX}px`,
            width: `${field.w * PT_TO_PX}px`,
            height: field.h ? `${field.h * PT_TO_PX}px` : "auto",
            fontFamily, fontSize: `${fontSize * PT_TO_PX}px`, fontWeight,
            color: field.farbe || "#000",
            lineHeight: 1.3,
            whiteSpace: "pre-wrap",
            zIndex: 5,
          };
          return (
            <div key={field.id} style={style} className="group cursor-pointer" data-testid="tmpl-field-kundenadresse">
              {selectedCustomer ? (
                <div style={{ lineHeight: 1.3 }}>
                  <div>{selectedCustomer.name}</div>
                  {selectedCustomer.name2 && <div>{selectedCustomer.name2}</div>}
                  {selectedCustomer.street && <div>{selectedCustomer.street}</div>}
                  <div>{selectedCustomer.zip} {selectedCustomer.city}</div>
                </div>
              ) : (
                <div className="text-gray-300 italic">Kein Kunde gewählt</div>
              )}
              <CustomerSearchOverlay
                customers={customers || []}
                selectedId={docForm.customerId || 0}
                onSelect={(id) => {
                  setDocForm((f: any) => ({ ...f, customerId: id }));
                  setDirty(true);
                }}
              />
            </div>
          );
        }
        if (isPage1 && (field.id === "datum" || ((field.typ === "Variabel" || field.typ === "Variable") && field.inhalt?.includes("[Datum]") && !field.inhalt?.includes("[Blatt]")))) {
          const { fontFamily, fontSize: fSize, fontWeight: fWeight } = parseFontSpec(field.font);
          const datumStyle: any = {
            position: "absolute",
            left: `${field.x * PT_TO_PX}px`,
            top: `${field.y * PT_TO_PX}px`,
            width: `${field.w * PT_TO_PX}px`,
            minHeight: field.h ? `${field.h * PT_TO_PX}px` : "auto",
            fontFamily, fontSize: `${fSize * PT_TO_PX}px`, fontWeight: fWeight,
            color: field.farbe || "#000",
            lineHeight: 1.3,
            textAlign: field.ausrichtung === "rechts" ? "right" as const : field.ausrichtung === "zentriert" ? "center" as const : "left" as const,
            whiteSpace: "pre-wrap" as const,
            zIndex: 5,
          };
          let datumContent = field.inhalt || "[Datum]";
          datumContent = datumContent.replace(/\[Datum\]/g, "");
          const datumPrefix = datumContent.trim();
          return (
            <div key={field.id} style={datumStyle} className="group cursor-pointer" data-testid="tmpl-field-datum">
              {editingField === "datum" ? (
                <div className="flex items-center gap-1">
                  {datumPrefix && <span>{datumPrefix} </span>}
                  <input
                    type="date"
                    autoFocus
                    className="border border-blue-400 rounded px-1 bg-white outline-none"
                    style={{ fontSize: `${fSize * PT_TO_PX}px` }}
                    value={docForm.date || ""}
                    onChange={(e) => { setDocForm((f: any) => ({ ...f, date: e.target.value })); setDirty(true); }}
                    onBlur={() => setEditingField(null)}
                    data-testid="input-datum-a4"
                  />
                </div>
              ) : (
                <div
                  className="border border-dashed border-transparent hover:border-gray-300 rounded px-0.5"
                  onClick={() => setEditingField("datum")}
                >
                  {datumPrefix ? `${datumPrefix} ` : ""}{docForm.date ? docForm.date.split("-").reverse().join(".") : "Datum wählen..."}
                </div>
              )}
            </div>
          );
        }
        if (isPage1 && (field.id === "betreff" || ((field.typ === "Variabel" || field.typ === "Variable") && field.inhalt === "[Betreff]"))) {
          const { fontFamily, fontSize: fSize, fontWeight: fWeight } = parseFontSpec(field.font);
          const betreffStyle: any = {
            position: "absolute",
            left: `${field.x * PT_TO_PX}px`,
            top: `${field.y * PT_TO_PX}px`,
            width: `${field.w * PT_TO_PX}px`,
            minHeight: field.h ? `${field.h * PT_TO_PX}px` : "auto",
            fontFamily, fontSize: `${fSize * PT_TO_PX}px`, fontWeight: fWeight,
            color: field.farbe || "#000",
            lineHeight: 1.3,
            whiteSpace: "pre-wrap" as const,
            zIndex: 5,
          };
          return (
            <div key={field.id} style={betreffStyle} className="cursor-text" data-testid="tmpl-field-betreff"
              onClick={() => setEditingField("subject-tmpl")}
            >
              {editingField === "subject-tmpl" ? (
                <input
                  autoFocus
                  className="w-full outline-none border-b-2 border-blue-400 bg-transparent"
                  style={{ fontSize: `${fSize * PT_TO_PX}px`, fontWeight: fWeight, fontFamily }}
                  value={docForm.subject || ""}
                  onChange={(e) => { setDocForm((f: any) => ({ ...f, subject: e.target.value })); setDirty(true); }}
                  onBlur={() => setEditingField(null)}
                  placeholder="Betreff eingeben..."
                  data-testid="input-subject-tmpl"
                />
              ) : (
                <span className={`${docForm.subject ? "" : "text-gray-300"} border-b border-dashed border-transparent hover:border-gray-300 inline-block min-w-[200px]`}>
                  {docForm.subject || "Betreff eingeben..."}
                </span>
              )}
            </div>
          );
        }
        const fieldIsFooter = field.y > 750 || field.id?.startsWith("fusszeile") || field.id?.startsWith("footer");
        return (
          <A4TemplateField
            key={field.id}
            field={field}
            variables={templateVars}
            isFooterField={fieldIsFooter}
            companyLogoUrl={companySettings?.logoUrl}
          />
        );
      })}

      {isPage1 && onVortextContextMenu && (
        <div
          style={{
            position: "absolute",
            left: `${waX * PT_TO_PX}px`,
            top: 0,
            width: `${waW * PT_TO_PX}px`,
            height: `${waY * PT_TO_PX}px`,
            zIndex: 2,
          }}
          data-testid="a4-vortext-zone"
          className="print:hidden"
          onContextMenu={onVortextContextMenu}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: 0,
          top: `${waY * PT_TO_PX}px`,
          width: `${waX * PT_TO_PX}px`,
          height: `${waMaxH * PT_TO_PX}px`,
          cursor: "default",
          zIndex: 10,
        }}
        data-marking-zone
        data-testid={`a4-marking-zone${pageNumber > 1 ? `-${pageNumber}` : ""}`}
        className="print:hidden hover:bg-gray-50/40 transition-colors"
      />

      <div
        style={{
          position: "absolute",
          left: `${waX * PT_TO_PX}px`,
          top: `${waY * PT_TO_PX}px`,
          width: `${waW * PT_TO_PX}px`,
          maxHeight: `${waMaxH * PT_TO_PX}px`,
          overflowX: "visible",
          overflowY: "hidden",
        }}
        data-testid={`a4-work-area${pageNumber > 1 ? `-${pageNumber}` : ""}`}
      >
        {isPage1 && !hasBetreffField && (
          <div
            className="mb-1 cursor-text"
            onClick={() => setEditingField("subject")}
            data-testid="a4-subject"
          >
            {editingField === "subject" ? (
              <input
                autoFocus
                className="w-full text-sm font-semibold outline-none border-b-2 border-blue-400 bg-transparent"
                value={docForm.subject || ""}
                onChange={(e) => { setDocForm((f: any) => ({ ...f, subject: e.target.value })); setDirty(true); }}
                onBlur={() => setEditingField(null)}
                placeholder="Betreff eingeben..."
                data-testid="input-subject"
              />
            ) : (
              <span className={`text-sm font-semibold ${docForm.subject ? "" : "text-gray-300"} border-b border-dashed border-transparent hover:border-gray-300 inline-block min-w-[200px]`}>
                {docForm.subject || "Betreff eingeben..."}
              </span>
            )}
          </div>
        )}


        {children}
      </div>

      {carryForwardOut != null && carryForwardOut > 0 && (
        <div
          data-testid={`row-uebertrag-out-${pageNumber}`}
          className="flex justify-end items-center text-xs text-gray-500"
          style={{
            position: "absolute",
            left: `${waX * PT_TO_PX}px`,
            width: `${waW * PT_TO_PX}px`,
            top: `${(footerY - 18) * PT_TO_PX}px`,
            borderTop: "0.5pt solid #d1d5db",
            paddingTop: "3px",
          }}
        >
          <span className="mr-2">Übertrag</span>
          <span className="tabular-nums">{fmtCurrency(carryForwardOut, 2)}</span>
        </div>
      )}
    </div>
  );
}
