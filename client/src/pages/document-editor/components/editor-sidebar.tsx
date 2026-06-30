import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { fmtDocNumber, fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import { documentTypeLabels } from "@shared/schema";
import type { Customer, Project, FormTemplate } from "@shared/schema";
import {
  Calculator,
  FileText,
  List,
  Calendar,
  FileSignature,
  Tag,
  Layers,
  Percent,
  Shuffle,
} from "lucide-react";
import type { EditorItem } from "../types";

export interface EditorSidebarProps {
  sidebarTab: "kalkulation" | "dokument" | "positionen";
  setSidebarTab: (tab: "kalkulation" | "dokument" | "positionen") => void;
  netTotal: number;
  taxAmount: number;
  grossTotal: number;
  ekTotal: number;
  margeTotal: number;
  items: EditorItem[];
  positionNumbers: Map<string, string>;
  docForm: any;
  setDocForm: React.Dispatch<React.SetStateAction<any>>;
  setDirty: (v: boolean) => void;
  totalPages: number;
  selectedCustomer: Customer | null | undefined;
  projects: Project[] | undefined;
  formTemplates: FormTemplate[] | undefined;
  showFormSelect?: boolean;
  convertTargets: { type: string; label: string }[];
  convertMutation: { mutate: (v: string) => void; isPending: boolean };
  setFocusedRow: (v: number) => void;
  isNew: boolean;
  navigate: (path: string) => void;
}

export function EditorSidebar({
  sidebarTab,
  setSidebarTab,
  netTotal,
  taxAmount,
  grossTotal,
  ekTotal,
  margeTotal,
  items,
  positionNumbers,
  docForm,
  setDocForm,
  setDirty,
  totalPages,
  selectedCustomer,
  projects,
  formTemplates,
  showFormSelect = true,
  convertTargets,
  convertMutation,
  setFocusedRow,
  isNew,
  navigate,
}: EditorSidebarProps) {
  return (
    <div className="w-80 shrink-0 sticky top-5 self-start hidden lg:block print:hidden" data-testid="editor-sidebar">
      <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white/95 shadow-xl ring-1 ring-white/70 backdrop-blur-xl">
        <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,#f8fafc_0%,#eef8fb_100%)] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Inspector</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <div className="min-w-0 truncate text-sm font-semibold text-slate-950">
              {documentTypeLabels[docForm.type] || "Dokument"} {fmtDocNumber(docForm.documentNumber)}
            </div>
            <div className="shrink-0 rounded-md bg-slate-950 px-2 py-1 text-[10px] font-semibold text-white">
              {totalPages} S.
            </div>
          </div>
        </div>
        <div className="flex border-b border-slate-200/80 bg-slate-50/90 px-2 pt-2">
          {([
            { key: "kalkulation" as const, label: "Kalkulation", icon: Calculator },
            { key: "dokument" as const, label: "Dokument", icon: FileText },
            { key: "positionen" as const, label: "Positionen", icon: List },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-t-md py-2.5 text-[11px] font-medium transition-colors ${sidebarTab === key ? "bg-white text-primary shadow-sm ring-1 ring-slate-200/70 ring-b-0" : "text-slate-500 hover:text-slate-800 hover:bg-white/70"}`}
              onClick={() => setSidebarTab(key)}
              data-testid={`sidebar-tab-${key}`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {sidebarTab === "kalkulation" && (
            <div className="space-y-2" data-testid="sidebar-kalkulation">
              <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-3 shadow-xs">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">Dokumentwert</div>
                <div className="mt-1 flex justify-between text-lg font-bold text-slate-950">
                  <span>Netto</span>
                  <span className="tabular-nums font-mono" data-testid="text-net">{fmtCurrency(netTotal)}</span>
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>MwSt {fmtNumber(docForm.taxRate)}%</span>
                <span className="tabular-nums font-mono" data-testid="text-tax">{fmtCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-[12px] font-medium border-t border-slate-200 pt-2">
                <span>Brutto</span>
                <span className="tabular-nums font-mono" data-testid="text-gross">{fmtCurrency(grossTotal)}</span>
              </div>
              <div className="border-t border-slate-200 pt-3 mt-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Aufgliederung</div>
                {(() => {
                  let matSum = 0, lohnSum = 0;
                  items.forEach(it => {
                    if (it._parentClientId || it.positionFlag === "alternativ") return;
                    const tp = parseFloat(it.totalPrice || "0");
                    if (it.type === "material") matSum += tp;
                    else if (["leistung", "lohn", "manuell"].includes(it.type || "")) lohnSum += tp;
                    else if (it.type === "jumbo") matSum += tp;
                  });
                  return (
                    <>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Material</span>
                        <span className="tabular-nums font-mono">{fmtCurrency(matSum)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Lohn/Leistung</span>
                        <span className="tabular-nums font-mono">{fmtCurrency(lohnSum)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              {ekTotal > 0 && (
                <div className="border-t border-slate-200 pt-3 mt-3 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Kalkulation</div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">EK gesamt</span>
                    <span className="tabular-nums font-mono">{fmtCurrency(ekTotal)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Marge</span>
                    <span className={`tabular-nums font-mono font-medium ${margeTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmtCurrency(margeTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Aufschlag</span>
                    <span className="tabular-nums font-mono text-blue-600 font-medium">
                      {ekTotal > 0 ? fmtPercent((netTotal / ekTotal - 1) * 100) : "—"}
                    </span>
                  </div>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground pt-2 border-t border-slate-200 mt-3">
                {items.filter(i => !i._parentClientId && !["titelsumme", "abschluss", "zwischensumme", "freitext", "floskel", "text"].includes(i.type || "")).length} Positionen · {totalPages} {totalPages === 1 ? "Seite" : "Seiten"}
              </div>
            </div>
          )}

          {sidebarTab === "dokument" && (
            <div className="space-y-4" data-testid="sidebar-dokument">
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span className="text-[10px] w-10">Datum</span>
                  <input
                    type="date"
                    className="min-w-0 flex-1 rounded border border-transparent bg-white/70 px-2 py-1 text-xs outline-none focus:border-blue-300 focus:bg-white"
                    value={docForm.date}
                    onChange={(e) => { setDocForm((f: any) => ({ ...f, date: e.target.value })); setDirty(true); }}
                    data-testid="input-date-sidebar"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileSignature className="h-3 w-3 shrink-0" />
                  <span className="text-[10px] w-10">Nr.</span>
                  <span className="min-w-0 flex-1 rounded bg-white/70 px-2 py-1 text-xs font-mono" data-testid="input-doc-number-sidebar">
                    {fmtDocNumber(docForm.documentNumber)}
                  </span>
                </div>
                {["angebot", "auftragsbestaetigung"].includes(docForm.type) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span className="text-[10px] w-10">Gültig</span>
                  <input
                    type="date"
                    className="min-w-0 flex-1 rounded border border-transparent bg-white/70 px-2 py-1 text-xs outline-none focus:border-blue-300 focus:bg-white"
                    value={docForm.validUntil || ""}
                    onChange={(e) => { setDocForm((f: any) => ({ ...f, validUntil: e.target.value })); setDirty(true); }}
                    data-testid="input-valid-until-sidebar"
                  />
                </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Tag className="h-3 w-3 shrink-0" />
                  <span className="text-[10px] w-10">Titel</span>
                  <input
                    type="text"
                    className="min-w-0 flex-1 rounded border border-transparent bg-white/70 px-2 py-1 text-xs outline-none focus:border-blue-300 focus:bg-white"
                    value={docForm.customTypeLabel || ""}
                    placeholder={documentTypeLabels[docForm.type] || docForm.type}
                    onChange={(e) => { setDocForm((f: any) => ({ ...f, customTypeLabel: e.target.value || null })); setDirty(true); }}
                    data-testid="input-custom-type-label"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Layers className="h-3 w-3 shrink-0" />
                  <select
                    className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-300"
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
                    data-testid="select-project-sidebar"
                  >
                    <option value="">Kein Projekt</option>
                    {(projects?.filter(p => !docForm.customerId || p.customerId === docForm.customerId) || []).map((p) => (
                      <option key={p.id} value={p.id}>{fmtDocNumber(p.projectNumber)} - {p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Percent className="h-3 w-3 shrink-0" />
                  <span className="text-[10px]">MwSt</span>
                  <input
                    className="w-12 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-blue-300"
                    value={docForm.taxRate}
                    onChange={(e) => { setDocForm((f: any) => ({ ...f, taxRate: e.target.value })); setDirty(true); }}
                    data-testid="input-tax-rate-sidebar"
                  />
                  <span className="text-[10px]">%</span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-2">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Zahlung</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-[10px]">Zahlungsziel</span>
                  <input
                    className="w-12 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-blue-300"
                    value={docForm.paymentTermDays}
                    onChange={(e) => { setDocForm((f: any) => ({ ...f, paymentTermDays: parseInt(e.target.value) || 14 })); setDirty(true); }}
                    data-testid="input-payment-days"
                  />
                  <span className="text-[10px]">Tage</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-[10px]">Skonto</span>
                  <input
                    className="w-12 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-blue-300"
                    value={docForm.skontoPercent}
                    onChange={(e) => { setDocForm((f: any) => ({ ...f, skontoPercent: e.target.value })); setDirty(true); }}
                    data-testid="input-skonto-percent"
                  />
                  <span className="text-[10px]">% in</span>
                  <input
                    className="w-12 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-blue-300"
                    value={docForm.skontoDays}
                    onChange={(e) => { setDocForm((f: any) => ({ ...f, skontoDays: parseInt(e.target.value) || 0 })); setDirty(true); }}
                    data-testid="input-skonto-days"
                  />
                  <span className="text-[10px]">Tagen</span>
                </div>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
                    checked={docForm.skontoImDokument !== false}
                    onChange={(e) => {
                      setDocForm((f: any) => ({ ...f, skontoImDokument: e.target.checked }));
                      setDirty(true);
                    }}
                    data-testid="input-skonto-visible-sidebar"
                  />
                  <span className="text-[10px]">Skonto im Dokument ausweisen</span>
                </label>
                {(docForm.type === "abschlagsrechnung" || docForm.type === "rechnung") && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-[10px]">Einbehalt</span>
                    <input
                      className="w-12 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-blue-300"
                      value={docForm.retentionPercent || "0"}
                      onChange={(e) => { setDocForm((f: any) => ({ ...f, retentionPercent: e.target.value })); setDirty(true); }}
                      data-testid="input-retention-percent"
                    />
                    <span className="text-[10px]">%</span>
                  </div>
                )}
              </div>

              {showFormSelect && (
                <div className="border-t border-slate-200 pt-3">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Formular</div>
                  <Select
                    value={String(docForm.formTemplateId || "")}
                    onValueChange={(v) => { setDocForm((f: any) => ({ ...f, formTemplateId: v && v !== "0" ? parseInt(v) : null })); setDirty(true); }}
                  >
                    <SelectTrigger className="h-8 rounded-md text-xs" data-testid="select-form-template">
                      <SelectValue placeholder="Standard" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Standard</SelectItem>
                      {formTemplates?.filter((t) => t.status === "aktiv").map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedCustomer && (
                <div className="border-t border-slate-200 pt-3">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Kunde</div>
                  <div className="text-xs leading-relaxed">
                    <a
                      href={`/adressen?selected=${selectedCustomer.id}`}
                      className="font-medium hover:text-primary hover:underline transition-colors cursor-pointer"
                      data-testid="link-sidebar-customer"
                    >{selectedCustomer.name}</a>
                    {selectedCustomer.street && <p className="text-muted-foreground">{selectedCustomer.street}</p>}
                    <p className="text-muted-foreground">{selectedCustomer.zip} {selectedCustomer.city}</p>
                  </div>
                </div>
              )}

              {!isNew && convertTargets.length > 0 && (
                <div className="border-t border-slate-200 pt-3">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Umwandeln</div>
                  <div className="space-y-1">
                    {convertTargets.map((t) => (
                      <Button key={t.type} variant="outline" size="sm" className="h-8 w-full justify-start rounded-md text-[11px]"
                        onClick={() => convertMutation.mutate(t.type)} disabled={convertMutation.isPending}
                        data-testid={`button-convert-${t.type}`}
                      >
                        <Shuffle className="h-3 w-3 mr-1" />→ {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {sidebarTab === "positionen" && (
            <div className="space-y-2" data-testid="sidebar-positionen">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Titel-Navigation</div>
              {items.filter(i => (i.type === "titel" || i.type === "gruppe") && !i._parentClientId).length === 0 ? (
                <div className="text-xs text-muted-foreground italic">Keine Titel vorhanden</div>
              ) : (
                <div className="space-y-0.5">
                  {items.filter(i => (i.type === "titel" || i.type === "gruppe") && !i._parentClientId).map((it) => {
                    const posNum = positionNumbers.get(it._clientId) || "";
                    return (
                      <button
                        key={it._clientId}
                        className="w-full text-left text-xs hover:bg-blue-50 rounded-md px-2 py-1.5 flex items-center gap-1.5 transition-colors"
                        onClick={() => {
                          const idx = items.findIndex(i => i._clientId === it._clientId);
                          if (idx >= 0) {
                            setFocusedRow(idx);
                            const el = document.querySelector(`[data-testid="pos-row-${idx}"]`);
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }
                        }}
                        data-testid={`nav-titel-${it._clientId}`}
                      >
                        <span className="text-[10px] font-mono text-muted-foreground w-6 shrink-0">{posNum}</span>
                        <span className="truncate font-medium">{it.title || "(Ohne Titel)"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="border-t border-slate-200 pt-3 space-y-1.5 text-[11px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>Positionen</span>
                  <span className="font-mono">{items.filter(i => !i._parentClientId && !["titelsumme", "abschluss", "zwischensumme", "freitext", "floskel", "text"].includes(i.type || "")).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Titel/Gruppen</span>
                  <span className="font-mono">{items.filter(i => (i.type === "titel" || i.type === "gruppe") && !i._parentClientId).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Seiten</span>
                  <span className="font-mono">{totalPages}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
