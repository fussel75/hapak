import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtCurrency, fmtNumber, fmtDocNumber } from "@/lib/format";
import { documentTypeLabels } from "@shared/schema";
import type { FormTemplate, Customer, Document } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface DocPropertiesDialogProps {
  open: boolean;
  onClose: () => void;
  docForm: any;
  setDocForm: (fn: (f: any) => any) => void;
  setDirty: (v: boolean) => void;
  formTemplates?: FormTemplate[];
  selectedCustomer?: Customer | null;
  parentDoc?: Document | null;
  projects?: { id: number; name: string; projectNumber: string }[];
  netTotal: number;
  grossTotal: number;
  taxAmount: number;
  currentUser?: { fullName: string; username: string } | null;
  formularfelderDefaults?: Record<string, string>;
}

export function DocPropertiesDialog({
  open,
  onClose,
  docForm,
  setDocForm,
  setDirty,
  formTemplates,
  selectedCustomer,
  parentDoc,
  projects,
  grossTotal,
  taxAmount,
  currentUser,
  formularfelderDefaults,
}: DocPropertiesDialogProps) {
  const { data: erloesKonten } = useQuery<{ kontoNr: number; bezeichnung: string; strId: string; prozent: number; steuerMatch: string }[]>({
    queryKey: ["/api/fibu/erloeskonten"],
    enabled: open,
  });

  const { data: steuerSaetze } = useQuery<{ strId: string; match: string; bezeichnung: string; prozent: number }[]>({
    queryKey: ["/api/fibu/steuersaetze"],
    enabled: open,
  });

  const ustSaetze = steuerSaetze?.filter(s => s.match?.startsWith("USt")) || [];

  const currentKonto = erloesKonten?.find(k => String(k.kontoNr) === String(docForm.erloeskonto));
  const currentSteuer = ustSaetze?.find(s => String(s.strId) === String(docForm.steuerklasse));

  const update = (field: string, value: any) => {
    setDocForm((f: any) => ({ ...f, [field]: value }));
    setDirty(true);
  };

  const updateFormularfeld = (key: string, value: string) => {
    setDocForm((f: any) => ({
      ...f,
      formularfelder: { ...(f.formularfelder || {}), [key]: value },
    }));
    setDirty(true);
  };

  const typeLabel = (docForm.customTypeLabel || "").replace(/^([A-Za-zÄÖÜäöüß]+)\s+\d{2}-\d{5}/, "$1").trim() || documentTypeLabels[docForm.type as keyof typeof documentTypeLabels] || docForm.type;
  const docDate = docForm.date ? new Date(docForm.date + "T00:00:00") : new Date();
  const faelligDatum = new Date(docDate);
  faelligDatum.setDate(faelligDatum.getDate() + (docForm.paymentTermDays || 14));
  const skontoDatum = new Date(docDate);
  skontoDatum.setDate(skontoDatum.getDate() + (docForm.skontoDays || 0));
  const einbehaltDatum = new Date(docDate);
  einbehaltDatum.setDate(einbehaltDatum.getDate() + (docForm.retentionDays || 0));

  const skontoBetrag = grossTotal * parseFloat(docForm.skontoPercent || "0") / 100;
  const einbehaltBetrag = grossTotal * parseFloat(docForm.retentionPercent || "0") / 100;

  const project = projects?.find(p => p.id === docForm.projectId);
  const ff = docForm.formularfelder || {};

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[780px] max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-doc-properties">
        <DialogHeader className="pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">Eigenschaften des Dokumentes</DialogTitle>
            <span className="text-xs text-gray-400">
              {currentUser?.fullName || ""} / FB ZuB
            </span>
          </div>
        </DialogHeader>

        <Tabs defaultValue="eigenschaften" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full justify-start h-auto flex-wrap gap-0 bg-transparent border-b border-gray-200 rounded-none px-0">
            {[
              { value: "eigenschaften", label: "Eigenschaften" },
              { value: "darstellung", label: "Darstellung" },
              { value: "zahlung", label: "Zahlungsbedingungen" },
              { value: "stammdaten", label: "Stammdaten-Übernahme" },
              { value: "formularfelder", label: "Formularfelder" },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-1.5"
                data-testid={`tab-${tab.value}`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-3 pb-1">
            {/* ────── TAB: EIGENSCHAFTEN ────── */}
            <TabsContent value="eigenschaften" className="mt-0 space-y-3">
              <div className="flex items-center gap-3 text-xs text-gray-500 bg-gray-50 rounded p-2">
                <span>Datum des Dokumentes: <b>{docDate.toLocaleDateString("de-DE")}</b></span>
                <span>Gesamtsumme: <b>{fmtCurrency(grossTotal)} €</b></span>
              </div>

              <div className="grid grid-cols-[100px_1fr_100px_1fr] gap-x-3 gap-y-2 items-center text-xs">
                <Label className="text-gray-500 text-right">Titel</Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Input
                    className="h-7 text-xs flex-1"
                    value={docForm.customTypeLabel || ""}
                    placeholder={documentTypeLabels[docForm.type as keyof typeof documentTypeLabels] || docForm.type}
                    onChange={(e) => update("customTypeLabel", e.target.value || null)}
                    data-testid="prop-custom-type-label"
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDocNumber(docForm.documentNumber)}</span>
                </div>

                <Label className="text-gray-500 text-right">Betreff</Label>
                <Input
                  className="col-span-3 h-7 text-xs"
                  value={docForm.subject || ""}
                  onChange={(e) => update("subject", e.target.value)}
                  data-testid="prop-subject"
                />

                <Label className="text-gray-500 text-right">Dokumentdatum</Label>
                <Input
                  type="date"
                  className="h-7 text-xs"
                  value={docForm.date || ""}
                  onChange={(e) => update("date", e.target.value)}
                  data-testid="prop-date"
                />
                <Label className="text-gray-500 text-right">Erstellungsort</Label>
                <Input
                  className="h-7 text-xs"
                  value={docForm.erstellungsort || "Hamburg"}
                  onChange={(e) => update("erstellungsort", e.target.value)}
                  data-testid="prop-erstellungsort"
                />

                <Label className="text-gray-500 text-right">Leistungsdatum (von)</Label>
                <Input
                  type="date"
                  className="h-7 text-xs"
                  value={docForm.leistungsDatumVon || ""}
                  onChange={(e) => update("leistungsDatumVon", e.target.value)}
                  data-testid="prop-leistung-von"
                />
                <Label className="text-gray-500 text-right">Status</Label>
                <Select value={docForm.status} onValueChange={(v) => update("status", v)}>
                  <SelectTrigger className="h-7 text-xs" data-testid="prop-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entwurf">Entwurf</SelectItem>
                    <SelectItem value="gesendet">Gesendet</SelectItem>
                    <SelectItem value="gedruckt">Gedruckt</SelectItem>
                    <SelectItem value="beauftragt">Beauftragt</SelectItem>
                    <SelectItem value="bezahlt">Bezahlt</SelectItem>
                    <SelectItem value="storniert">Storniert</SelectItem>
                    <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                  </SelectContent>
                </Select>

                <Label className="text-gray-500 text-right">Leistungsdatum bis</Label>
                <Input
                  type="date"
                  className="h-7 text-xs"
                  value={docForm.leistungsDatumBis || ""}
                  onChange={(e) => update("leistungsDatumBis", e.target.value)}
                  data-testid="prop-leistung-bis"
                />
                <Label className="text-gray-500 text-right">Bezugtext</Label>
                <span className="text-xs text-gray-600">
                  {parentDoc ? `Dokument ${fmtDocNumber(parentDoc.documentNumber)}` : "—"}
                </span>

                <Label className="text-gray-500 text-right">Postausgang am</Label>
                <Input
                  type="date"
                  className="h-7 text-xs"
                  value={docForm.postausgangAm || ""}
                  onChange={(e) => update("postausgangAm", e.target.value)}
                  data-testid="prop-postausgang"
                />
                <Label className="text-gray-500 text-right">Formular</Label>
                <Select
                  value={String(docForm.formTemplateId || "__standard__")}
                  onValueChange={(v) => update("formTemplateId", v === "__standard__" ? null : parseInt(v))}
                >
                  <SelectTrigger className="h-7 text-xs" data-testid="prop-formular">
                    <SelectValue placeholder="Standard" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__standard__">Standard</SelectItem>
                    {formTemplates?.map(ft => (
                      <SelectItem key={ft.id} value={String(ft.id)}>{ft.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Label className="text-gray-500 text-right">Wiedervorlage am</Label>
                <Input
                  type="date"
                  className="h-7 text-xs"
                  value={docForm.wiedervorlageAm || ""}
                  onChange={(e) => update("wiedervorlageAm", e.target.value)}
                  data-testid="prop-wiedervorlage"
                />
                {["angebot", "auftragsbestaetigung"].includes(docForm.type) && (
                <>
                <Label className="text-gray-500 text-right">Gültig bis</Label>
                <Input
                  type="date"
                  className="h-7 text-xs"
                  value={docForm.validUntil || ""}
                  onChange={(e) => update("validUntil", e.target.value)}
                  data-testid="prop-valid-until"
                />
                </>
                )}

                <Label className="text-gray-500 text-right">ProjektNummer</Label>
                <span className="text-xs font-medium">{project?.projectNumber || "—"}</span>
                <Label className="text-gray-500 text-right">Projekt</Label>
                <span className="text-xs">{project?.name || "—"}</span>

                <Label className="text-gray-500 text-right">abgeleitet aus</Label>
                <span className="text-xs text-gray-600 col-span-3">
                  {parentDoc ? `${documentTypeLabels[parentDoc.type as keyof typeof documentTypeLabels] || parentDoc.type} ${fmtDocNumber(parentDoc.documentNumber)}` : "—"}
                </span>
              </div>

              <div className="border-t border-gray-100 pt-2 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Leitweg-ID</Label>
                  <Input
                    className="h-7 text-xs"
                    value={docForm.leitwegId || ""}
                    onChange={(e) => update("leitwegId", e.target.value)}
                    data-testid="prop-leitweg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Kunden Referenz</Label>
                  <Input
                    className="h-7 text-xs"
                    value={docForm.kundenReferenz || ""}
                    onChange={(e) => update("kundenReferenz", e.target.value)}
                    data-testid="prop-kunden-referenz"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-2 grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Benutzerdefinierte Bezeichnung</Label>
                  <Input
                    className="h-7 text-xs"
                    placeholder="z.B. 'Schlussrechnung'"
                    value={docForm.customTypeLabel || ""}
                    onChange={(e) => update("customTypeLabel", e.target.value || null)}
                    data-testid="prop-custom-label"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Bearbeiter</Label>
                  <span className="text-xs block pt-1.5">{currentUser?.fullName || "—"}</span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-2">
                <Label className="text-xs text-gray-500 mb-1 block">Bemerkungen zum Dokument</Label>
                <Textarea
                  className="text-xs min-h-[60px] resize-y"
                  value={docForm.bemerkungen || ""}
                  onChange={(e) => update("bemerkungen", e.target.value)}
                  data-testid="prop-bemerkungen"
                />
              </div>
            </TabsContent>

            {/* ────── TAB: DARSTELLUNG ────── */}
            <TabsContent value="darstellung" className="mt-0">
              <div className="grid grid-cols-2 gap-4">
                {/* ── LINKE SPALTE ── */}
                <div className="space-y-3">
                  <fieldset className="border border-gray-200 rounded p-3 space-y-2">
                    <legend className="text-xs font-semibold text-gray-600 px-1">Positionsnummerierung</legend>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={docForm.autoPositionNumbers !== false}
                        onCheckedChange={(v) => update("autoPositionNumbers", !!v)}
                        data-testid="prop-auto-pos-numbers"
                      />
                      Automatische Positionsnummerierung
                    </label>
                    <div className="flex items-center gap-2 pl-6 text-xs">
                      <span className="text-gray-500">Schrittweite</span>
                      <Input
                        type="number"
                        className="h-8 w-14 text-sm font-medium text-center"
                        value={docForm.positionNumberStep || 1}
                        onChange={(e) => update("positionNumberStep", parseInt(e.target.value) || 1)}
                        data-testid="prop-pos-step"
                      />
                      <span className="text-gray-500">Beginn mit</span>
                      <Input
                        type="number"
                        className="h-8 w-14 text-sm font-medium text-center"
                        value={docForm.positionNumberStart || 1}
                        onChange={(e) => update("positionNumberStart", parseInt(e.target.value) || 1)}
                        data-testid="prop-pos-start"
                      />
                    </div>
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-3 space-y-1.5">
                    <legend className="text-xs font-semibold text-gray-600 px-1">Anzeige-Optionen</legend>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={docForm.positionenEnthaltenUst || false}
                        onCheckedChange={(v) => update("positionenEnthaltenUst", !!v)}
                        data-testid="prop-pos-ust"
                      />
                      Positionen enthalten Umsatzsteuer
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={docForm.einzelpreiseInJumbo !== false}
                        onCheckedChange={(v) => update("einzelpreiseInJumbo", !!v)}
                        data-testid="prop-ep-jumbo"
                      />
                      Einzelpreise in Jumbo-Positionslisten zeigen
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={docForm.mengenInJumbo !== false}
                        onCheckedChange={(v) => update("mengenInJumbo", !!v)}
                        data-testid="prop-mengen-jumbo"
                      />
                      Mengen in Jumbo-Positionslisten zeigen
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={docForm.internpositionenVerbergen !== false}
                        onCheckedChange={(v) => update("internpositionenVerbergen", !!v)}
                        data-testid="prop-intern-hide"
                      />
                      Internpositionen im Dokument verbergen
                    </label>
                  </fieldset>
                </div>

                {/* ── RECHTE SPALTE ── */}
                <div className="space-y-3">
                  <fieldset className="border border-gray-200 rounded p-3 space-y-2">
                    <legend className="text-xs font-semibold text-gray-600 px-1">Anzahl der Einzelpreis-Nachkommastellen</legend>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">in Materialpositionen</span>
                        <Input
                          type="number"
                          className="h-8 w-14 text-sm font-medium text-center"
                          min={0}
                          max={6}
                          value={docForm.dezimalstellenPreise ?? 2}
                          onChange={(e) => update("dezimalstellenPreise", parseInt(e.target.value) || 0)}
                          data-testid="prop-dez-preise"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">in Leistungspositionen</span>
                        <Input
                          type="number"
                          className="h-8 w-14 text-sm font-medium text-center"
                          min={0}
                          max={6}
                          value={docForm.dezimalstellenLeistung ?? 2}
                          onChange={(e) => update("dezimalstellenLeistung", parseInt(e.target.value) || 0)}
                          data-testid="prop-dez-leistung"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">in Jumbopositionen</span>
                        <Input
                          type="number"
                          className="h-8 w-14 text-sm font-medium text-center"
                          min={0}
                          max={6}
                          value={docForm.dezimalstellenJumbo ?? 2}
                          onChange={(e) => update("dezimalstellenJumbo", parseInt(e.target.value) || 0)}
                          data-testid="prop-dez-jumbo"
                        />
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-3 space-y-1.5">
                    <legend className="text-xs font-semibold text-gray-600 px-1">Kalkulation</legend>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={docForm.vkFolgtEk !== false}
                        onCheckedChange={(v) => update("vkFolgtEk", !!v)}
                        data-testid="prop-vk-folgt-ek"
                      />
                      Verkaufspreis folgt dem Einkaufspreis
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={docForm.gleichartigeAktualisieren || false}
                        onCheckedChange={(v) => update("gleichartigeAktualisieren", !!v)}
                        data-testid="prop-gleichartige"
                      />
                      gleichartige Positionen aktualisieren
                    </label>
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-3 space-y-2">
                    <legend className="text-xs font-semibold text-gray-600 px-1">Kalkulationsvorlagen</legend>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Dokument</span>
                        <Select
                          value={docForm.kalkVorlageDokument || "STANDARD90"}
                          onValueChange={(v) => update("kalkVorlageDokument", v)}
                        >
                          <SelectTrigger className="h-6 w-36 text-xs" data-testid="prop-kalk-vorl-dok">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STANDARD90">STANDARD90</SelectItem>
                            <SelectItem value="standard">Standard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Position</span>
                        <Select
                          value={docForm.kalkVorlagePosition || "STANDARD90"}
                          onValueChange={(v) => update("kalkVorlagePosition", v)}
                        >
                          <SelectTrigger className="h-6 w-36 text-xs" data-testid="prop-kalk-vorl-pos">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STANDARD90">STANDARD90</SelectItem>
                            <SelectItem value="standard">Standard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-3 space-y-2">
                    <legend className="text-xs font-semibold text-gray-600 px-1">Dezimalstellen Mengen</legend>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Nachkommastellen bei Mengen</span>
                      <Input
                        type="number"
                        className="h-8 w-14 text-sm font-medium text-center"
                        min={0}
                        max={6}
                        value={docForm.dezimalstellenMengen ?? 2}
                        onChange={(e) => update("dezimalstellenMengen", parseInt(e.target.value) || 0)}
                        data-testid="prop-dez-mengen"
                      />
                    </div>
                  </fieldset>
                </div>
              </div>
            </TabsContent>

            {/* ────── TAB: ZAHLUNGSBEDINGUNGEN ────── */}
            <TabsContent value="zahlung" className="mt-0 space-y-4">
              <div className="flex items-center gap-3 text-xs text-gray-500 bg-gray-50 rounded p-2">
                <span>Datum des Dokumentes: <b>{docDate.toLocaleDateString("de-DE")}</b></span>
                <span>Gesamtsumme: <b>{fmtCurrency(grossTotal)} €</b></span>
              </div>

              <fieldset className="border border-gray-200 rounded p-3 space-y-2">
                <legend className="text-xs font-semibold text-gray-600 px-1">Fälligkeit</legend>
                <div className="flex items-center gap-2 text-xs">
                  <Input
                    type="number"
                    className="h-7 w-16 text-xs text-center"
                    value={docForm.paymentTermDays ?? 14}
                    onChange={(e) => update("paymentTermDays", parseInt(e.target.value) || 0)}
                    data-testid="prop-payment-days"
                  />
                  <span className="text-gray-500">Tage nach Datum des Dokuments, damit fällig zum</span>
                  <span className="font-medium bg-blue-50 px-2 py-0.5 rounded">{faelligDatum.toLocaleDateString("de-DE")}</span>
                </div>
              </fieldset>

              <fieldset className="border border-gray-200 rounded p-3 space-y-2">
                <legend className="text-xs font-semibold text-gray-600 px-1">Skonto</legend>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <Input
                    type="text"
                    className="h-7 w-14 text-xs text-center"
                    value={docForm.skontoPercent || "0.00"}
                    onChange={(e) => update("skontoPercent", e.target.value)}
                    data-testid="prop-skonto-percent"
                  />
                  <span className="text-gray-500">%</span>
                  <span className="text-gray-500">der Brutto-Gesamtsumme</span>
                  <span className="text-gray-500">=</span>
                  <span className="font-medium font-mono">{fmtCurrency(skontoBetrag)} €</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">bis</span>
                  <Input
                    type="number"
                    className="h-7 w-14 text-xs text-center"
                    value={docForm.skontoDays || 0}
                    onChange={(e) => update("skontoDays", parseInt(e.target.value) || 0)}
                    data-testid="prop-skonto-days"
                  />
                  <span className="text-gray-500">Tage nach Datum des Dokuments, damit bis zum</span>
                  <span className="font-medium bg-blue-50 px-2 py-0.5 rounded">{skontoDatum.toLocaleDateString("de-DE")}</span>
                </div>
                <div className="space-y-1 pt-1">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={docForm.skontoImDokument !== false}
                      onCheckedChange={(v) => update("skontoImDokument", !!v)}
                      data-testid="prop-skonto-im-dok"
                    />
                    Skonto im Dokument unter der Summe ausweisen
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={docForm.skontoNurMaterial || false}
                      onCheckedChange={(v) => update("skontoNurMaterial", !!v)}
                      data-testid="prop-skonto-nur-mat"
                    />
                    Skonto wird nur auf den Materialanteil der Rechnung gewährt
                  </label>
                </div>
              </fieldset>

              <fieldset className="border border-gray-200 rounded p-3 space-y-2">
                <legend className="text-xs font-semibold text-gray-600 px-1">Einbehalt</legend>
                <div className="flex items-center gap-2 text-xs">
                  <Input
                    type="text"
                    className="h-7 w-14 text-xs text-center"
                    value={docForm.retentionPercent || "0.00"}
                    onChange={(e) => update("retentionPercent", e.target.value)}
                    data-testid="prop-retention-percent"
                  />
                  <span className="text-gray-500">% der Gesamtsumme</span>
                  <span className="text-gray-500">=</span>
                  <span className="font-medium font-mono">{fmtCurrency(einbehaltBetrag)} €</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">bis</span>
                  <Input
                    type="number"
                    className="h-7 w-14 text-xs text-center"
                    value={docForm.retentionDays || 0}
                    onChange={(e) => update("retentionDays", parseInt(e.target.value) || 0)}
                    data-testid="prop-retention-days"
                  />
                  <span className="text-gray-500">Tage nach Datum des Dokuments, damit bis zum</span>
                  <span className="font-medium bg-blue-50 px-2 py-0.5 rounded">{einbehaltDatum.toLocaleDateString("de-DE")}</span>
                </div>
              </fieldset>

              <fieldset className="border border-gray-200 rounded p-3 space-y-3">
                <legend className="text-xs font-semibold text-gray-600 px-1">Standarderlöskonto</legend>
                <p className="text-[10px] text-gray-400">
                  Alle Positionen für die kein spezielles Erlöskonto vorgesehen ist, benutzen das
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 w-20 shrink-0">Erlöskonto</span>
                  <Select
                    value={String(docForm.erloeskonto || "4400")}
                    onValueChange={(v) => {
                      update("erloeskonto", v);
                      const konto = erloesKonten?.find(k => String(k.kontoNr) === v);
                      if (konto?.strId) {
                        const matchingSteuer = ustSaetze.find(s => String(s.strId) === String(konto.strId));
                        if (matchingSteuer) {
                          update("steuerklasse", String(matchingSteuer.strId));
                          update("taxRate", parseFloat(String(matchingSteuer.prozent ?? 0)).toFixed(2));
                        } else {
                          update("steuerklasse", String(konto.strId));
                          update("taxRate", parseFloat(String(konto.prozent ?? 0)).toFixed(2));
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-[280px] text-xs font-medium" data-testid="prop-erloeskonto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {erloesKonten?.map(k => (
                        <SelectItem key={k.kontoNr} value={String(k.kontoNr)}>
                          {k.kontoNr} – {k.bezeichnung}
                        </SelectItem>
                      ))}
                      {!erloesKonten?.length && (
                        <SelectItem value={String(docForm.erloeskonto || "4400")}>{docForm.erloeskonto || "4400"}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 w-20 shrink-0">Steuerklasse</span>
                  <Select
                    value={String(docForm.steuerklasse || "50")}
                    onValueChange={(v) => {
                      const st = ustSaetze.find(s => String(s.strId) === v);
                      update("steuerklasse", v);
                      if (st) {
                        update("taxRate", parseFloat(String(st.prozent ?? 0)).toFixed(2));
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-24 text-xs font-medium" data-testid="prop-steuerklasse">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {ustSaetze.map(s => (
                        <SelectItem key={s.strId} value={String(s.strId)}>
                          {s.match}
                        </SelectItem>
                      ))}
                      {!ustSaetze.length && (
                        <SelectItem value={String(docForm.steuerklasse || "50")}>{docForm.steuerklasse || "50"}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <span className="text-gray-500">{currentSteuer?.bezeichnung || `USt ${fmtNumber(docForm.taxRate || "19")}%`}</span>
                  <span className="text-gray-500 ml-auto">mit</span>
                  <span className="font-medium bg-blue-50 px-2 py-0.5 rounded">{fmtNumber(docForm.taxRate || "19")} %</span>
                  <span className="text-gray-500">Umsatzsteuer</span>
                </div>
              </fieldset>
            </TabsContent>

            {/* ────── TAB: STAMMDATEN-ÜBERNAHME ────── */}
            <TabsContent value="stammdaten" className="mt-0 space-y-4">
              <p className="text-xs text-gray-500">
                Preisbildung bei Übernahme von Positionen aus den Stammdaten
              </p>

              <fieldset className="border border-gray-200 rounded p-3 space-y-3">
                <legend className="text-xs font-semibold text-gray-600 px-1">Preisstufe & Kalkulationsschema</legend>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 w-32">Preisstufe:</span>
                  <Select value={String(docForm.priceLevel || 1)} onValueChange={(v) => update("priceLevel", parseInt(v))}>
                    <SelectTrigger className="h-7 text-xs w-32" data-testid="prop-price-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">VK1 (Standard)</SelectItem>
                      <SelectItem value="2">VK2</SelectItem>
                      <SelectItem value="3">VK3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Select value={docForm.kalkulationsschema || "spezielle Einstellung"} onValueChange={(v) => update("kalkulationsschema", v)}>
                  <SelectTrigger className="h-7 text-xs w-56" data-testid="prop-kalk-schema">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spezielle Einstellung">spezielle Einstellung</SelectItem>
                    <SelectItem value="STANDARD90">STANDARD90</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-44">Selbstkosten-Lohnsatz:</span>
                    <Input
                      type="text"
                      className="h-7 w-20 text-xs text-right"
                      value={docForm.selbstkostenLohnsatz || "32.00"}
                      onChange={(e) => update("selbstkostenLohnsatz", e.target.value)}
                      data-testid="prop-sk-lohn"
                    />
                    <span className="text-gray-400">€</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-36">Aufschlag Material:</span>
                    <Input
                      type="text"
                      className="h-7 w-16 text-xs text-right"
                      value={docForm.aufschlagMaterial || "30.00"}
                      onChange={(e) => update("aufschlagMaterial", e.target.value)}
                      data-testid="prop-aufschlag-mat"
                    />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-44">kalkulierter Lohnsatz:</span>
                    <Input
                      type="text"
                      className="h-7 w-20 text-xs text-right"
                      value={docForm.kalkulierterLohnsatz || "69.30"}
                      onChange={(e) => update("kalkulierterLohnsatz", e.target.value)}
                      data-testid="prop-kalk-lohn"
                    />
                    <span className="text-gray-400">€</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-36">Aufschlag Geräte:</span>
                    <Input
                      type="text"
                      className="h-7 w-16 text-xs text-right"
                      value={docForm.aufschlagGeraete || "30.00"}
                      onChange={(e) => update("aufschlagGeraete", e.target.value)}
                      data-testid="prop-aufschlag-ger"
                    />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div />
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-36">Aufschlag Fremdleistung:</span>
                    <Input
                      type="text"
                      className="h-7 w-16 text-xs text-right"
                      value={docForm.aufschlagFremdleistung || "30.00"}
                      onChange={(e) => update("aufschlagFremdleistung", e.target.value)}
                      data-testid="prop-aufschlag-fremd"
                    />
                    <span className="text-gray-400">%</span>
                  </div>
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-4">
                <fieldset className="border border-gray-200 rounded p-3 space-y-1.5">
                  <legend className="text-xs font-semibold text-gray-600 px-1">Übernahme von Texten</legend>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={docForm.langtexteFormatiert !== false}
                      onCheckedChange={(v) => update("langtexteFormatiert", !!v)}
                      data-testid="prop-langtexte"
                    />
                    Langtexte formatiert übernehmen
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={docForm.kurztexteAnzeigen || false}
                      onCheckedChange={(v) => update("kurztexteAnzeigen", !!v)}
                      data-testid="prop-kurztexte"
                    />
                    Kurztexte anzeigen
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={docForm.jumboListenAnzeigen !== false}
                      onCheckedChange={(v) => update("jumboListenAnzeigen", !!v)}
                      data-testid="prop-jumbo-listen"
                    />
                    Jumbo-Positionslisten anzeigen
                  </label>
                </fieldset>

                <fieldset className="border border-gray-200 rounded p-3 space-y-1.5">
                  <legend className="text-xs font-semibold text-gray-600 px-1">Kupferkalkulation</legend>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={docForm.kupferpreisBeruecksichtigen || false}
                      onCheckedChange={(v) => update("kupferpreisBeruecksichtigen", !!v)}
                      data-testid="prop-kupfer"
                    />
                    Kupferpreis bei Kalkulation berücksichtigen
                  </label>
                  <div className="flex items-center gap-2 text-xs pl-6">
                    <span className="text-gray-500">aktuelle Kupfer-Notation im Dokument:</span>
                    <Input
                      type="text"
                      className="h-6 w-16 text-xs text-right"
                      value={docForm.kupferNotation || "200.00"}
                      onChange={(e) => update("kupferNotation", e.target.value)}
                      data-testid="prop-kupfer-notation"
                    />
                  </div>
                </fieldset>
              </div>
            </TabsContent>

            {/* ────── TAB: FORMULARFELDER ────── */}
            <TabsContent value="formularfelder" className="mt-0 space-y-4">
              <p className="text-xs text-gray-500">
                Hier können Sie den Inhalt der variablen Formularfelder festlegen, auch wenn diese im aktuell
                benutzten Formular nicht angezeigt werden.
              </p>

              <div className="space-y-1.5">
                {Array.from({ length: 10 }, (_, i) => {
                  const defaultLabel = formularfelderDefaults?.[`feld${i + 1}_label`];
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Label className="text-gray-500 w-14 text-right shrink-0" title={defaultLabel || `Feld ${i + 1}`}>
                        {defaultLabel || `Feld ${i + 1}`}
                      </Label>
                      <Input
                        className="h-7 text-xs flex-1"
                        value={ff[`feld${i + 1}`] || formularfelderDefaults?.[`feld${i + 1}`] || ""}
                        onChange={(e) => updateFormularfeld(`feld${i + 1}`, e.target.value)}
                        placeholder={formularfelderDefaults?.[`feld${i + 1}`] || ""}
                        data-testid={`prop-feld-${i + 1}`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 mb-2">
                  Diese im Formular anzeigbaren Zusatz-Felder stehen auch in der Dokumentenliste zur Verfügung.
                </p>
                <div className="space-y-1.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Label className="text-gray-500 w-14 text-right shrink-0">Zusatz {i + 1}</Label>
                      <Input
                        className="h-7 text-xs flex-1"
                        value={ff[`zusatz${i + 1}`] || ""}
                        onChange={(e) => updateFormularfeld(`zusatz${i + 1}`, e.target.value)}
                        data-testid={`prop-zusatz-${i + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
