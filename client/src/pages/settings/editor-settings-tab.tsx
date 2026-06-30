import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Save } from "lucide-react";
import { documentTypeLabels, type EditorSettings, type FormTemplate } from "@shared/schema";
import { documentTypeSettingTypes } from "@shared/document-engine/document-types";

function CBox({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId: string }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} data-testid={testId} />
      {label}
    </label>
  );
}

function toDeStr(v: string | number): string {
  return String(v).replace(".", ",");
}
function fromDeStr(v: string): string {
  return v.replace(",", ".");
}

function NumField({ label, value, onChange, unit, testId, width = "w-16", decimal = false }: { label: string; value: string | number; onChange: (v: string) => void; unit?: string; testId: string; width?: string; decimal?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground min-w-[140px] shrink-0">{label}</span>
      {decimal ? (
        <Input type="text" className={`h-8 text-sm font-medium text-right ${width}`} value={toDeStr(value)} onChange={(e) => onChange(fromDeStr(e.target.value))} data-testid={testId} />
      ) : (
        <Input type="text" className={`h-8 text-sm font-medium text-right ${width}`} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
      )}
      {unit && <span className="text-muted-foreground text-sm">{unit}</span>}
    </div>
  );
}

const defaultStandardtexte: Record<string, string> = {
  bezugsdokument: "Bezug auf",
  betreffZeile: "Betrifft:",
  alternativZeilen: "Alternativ zu vorstehender Position",
  bedarfsZeilen: "Falls erforderlich",
  standardBetreff: "",
  jumboPositionslisten: "darin enthalten je {ME}",
  umsatzsteuerText: "Umsatzsteuer",
  umsatzsteuerBrutto: "enthaltene Umsatzsteuer",
  steuerklassenText: "Steuerklasse",
  nettoKennzeichnung: "netto",
  rabattText: "Rabatt",
  skontoText: "Skonto",
  titelText: "Titel",
  untertitelText: "Untertitel",
  titelsummenText: "Summe {Titel}",
  zwischensummenText: "Zwischensumme",
  nettosummenText: "Nettosumme",
};

const documentTypeSettings = documentTypeSettingTypes.map((key) => ({
  key,
  label: documentTypeLabels[key] || key,
}));

export function EditorSettingsTab() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<EditorSettings>({ queryKey: ["/api/editor-settings"] });
  const { data: formTemplates } = useQuery<FormTemplate[]>({ queryKey: ["/api/form-templates"] });
  const { data: companySettings } = useQuery<any>({ queryKey: ["/api/company-settings"] });

  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
    }
  }, [settings]);

  const update = (field: string, value: any) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const updateStandardtext = (key: string, value: string) => {
    setForm((f) => ({
      ...f,
      standardtexte: { ...(f.standardtexte || {}), [key]: value },
    }));
  };

  const updateFormularfeld = (key: string, value: string) => {
    setForm((f) => ({
      ...f,
      formularfelderDefaults: { ...(f.formularfelderDefaults || {}), [key]: value },
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { id, ...body } = form;
      await apiRequest("POST", "/api/editor-settings", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/editor-settings"] });
      toast({ title: "Gespeichert", description: "Einstellungen für die Dokumentenbearbeitung wurden gespeichert." });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Laden...</div>;

  const st = { ...defaultStandardtexte, ...(form.standardtexte || {}) };
  const ff = form.formularfelderDefaults || {};

  return (
    <div className="space-y-4">
      <Tabs defaultValue="anzeige">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="anzeige" data-testid="edset-tab-anzeige">Anzeige</TabsTrigger>
          <TabsTrigger value="betriebsdaten" data-testid="edset-tab-betrieb">Betriebsdaten</TabsTrigger>
          <TabsTrigger value="voreinstellungen" data-testid="edset-tab-voreinstellungen">Voreinstellungen</TabsTrigger>
          <TabsTrigger value="standardtexte" data-testid="edset-tab-standardtexte">Standardtexte</TabsTrigger>
          <TabsTrigger value="formularfelder" data-testid="edset-tab-formularfelder">freie Formular-Felder</TabsTrigger>
          <TabsTrigger value="markierungen" data-testid="edset-tab-markierungen">Markierungen | §13b</TabsTrigger>
          <TabsTrigger value="dokumenttypen" data-testid="edset-tab-dokumenttypen">Dokumenttypen</TabsTrigger>
        </TabsList>

        {/* ── ANZEIGE ── */}
        <TabsContent value="anzeige">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold mb-3">Darstellung der Dokumente</h3>
                  <div className="space-y-2">
                    <CBox checked={form.showToolbar !== false} onChange={(v) => update("showToolbar", v)} label="Werkzeugleiste zeigen" testId="edset-show-toolbar" />
                    <CBox checked={form.showStatusLine !== false} onChange={(v) => update("showStatusLine", v)} label="Statuszeile zeigen" testId="edset-show-status" />
                    <CBox checked={form.showFormatBar !== false} onChange={(v) => update("showFormatBar", v)} label="Formatierungsleiste zeigen" testId="edset-show-format" />
                    <CBox checked={form.showTabRuler || false} onChange={(v) => update("showTabRuler", v)} label="Tabulatorlineal zeigen" testId="edset-show-tab-ruler" />
                    <CBox checked={form.showFormSelect !== false} onChange={(v) => update("showFormSelect", v)} label="Formularauswahl anzeigen" testId="edset-show-form" />
                    <CBox checked={form.showHelpers || false} onChange={(v) => update("showHelpers", v)} label="Soforthilfen zeigen" testId="edset-show-helpers" />
                    <CBox checked={form.showTipBox || false} onChange={(v) => update("showTipBox", v)} label="Tip-Box beim Start anzeigen" testId="edset-show-tip-box" />
                    <CBox checked={form.showMouseInfo !== false} onChange={(v) => update("showMouseInfo", v)} label="Maus-Info zeigen" testId="edset-show-mouse" />
                    <CBox checked={form.tabInTexts !== false} onChange={(v) => update("tabInTexts", v)} label="Tabulatoren in Texten einfügen" testId="edset-tab-texts" />
                    <CBox checked={form.confirmDeleteLines !== false} onChange={(v) => update("confirmDeleteLines", v)} label="Löschen von Zeilen bestätigen" testId="edset-confirm-delete" />
                    <CBox checked={form.noNettoSingleTax !== false} onChange={(v) => update("noNettoSingleTax", v)} label="kein Nettobetrag bei nur einem Steuersatz" testId="edset-no-netto" />
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3">Standard-Darstellungsgröße</h3>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="zoomMode" checked={form.zoomMode === "fensterbreite"} onChange={() => update("zoomMode", "fensterbreite")} />
                        entsprechend der Fensterbreite
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="zoomMode" checked={form.zoomMode === "fest"} onChange={() => update("zoomMode", "fest")} />
                        feste Vergrößerung (Zoom)
                        <Input type="number" className="h-8 w-16 text-sm font-medium text-center" value={form.zoomPercent || 100} onChange={(e) => update("zoomPercent", parseInt(e.target.value) || 100)} data-testid="edset-zoom-pct" />
                        <span className="text-xs text-muted-foreground">%</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm font-semibold mb-3">Mengen-Darstellung</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Dezimalstellen bei Mengen</span>
                      <Input type="number" className="h-8 w-14 text-sm font-medium text-center" min={0} max={6} value={form.dezimalstellenMengen ?? 2} onChange={(e) => update("dezimalstellenMengen", parseInt(e.target.value) || 0)} data-testid="edset-dez-mengen" />
                    </div>
                    <CBox checked={form.showDecimals !== false} onChange={(v) => update("showDecimals", v)} label="zeige Dezimalstellen in Mengenfeldern" testId="edset-show-decimals" />
                    <CBox checked={form.mengeneinheitenAenderbar !== false} onChange={(v) => update("mengeneinheitenAenderbar", v)} label="Mengeneinheiten sind immer änderbar" testId="edset-me-aenderbar" />
                    <CBox checked={form.showMengeneinheitenListe !== false} onChange={(v) => update("showMengeneinheitenListe", v)} label="Auswahlliste Mengeneinheiten zeigen" testId="edset-me-liste" />
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3">Feld Bezugs-Dokument</h3>
                    <CBox checked={form.showBezugsDokTyp !== false} onChange={(v) => update("showBezugsDokTyp", v)} label="auch Typ des Bezugsdokumentes zeigen" testId="edset-show-bezugstyp" />
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3">Drag & Drop</h3>
                    <CBox checked={form.dndExplorerStyle !== false} onChange={(v) => update("dndExplorerStyle", v)} label="Drag&Drop wie im Windows-Explorer" testId="edset-dnd-explorer" />
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3">Alternativ- und Bedarfs-Positionen</h3>
                    <p className="text-xs text-muted-foreground mb-2">Gesamtpreis darstellen als</p>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="altPos" checked={form.altPosGesamtpreis === "kursiv"} onChange={() => update("altPosGesamtpreis", "kursiv")} />
                        korrekter Wert in kursiver Schrift
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="altPos" checked={form.altPosGesamtpreis === "fett"} onChange={() => update("altPosGesamtpreis", "fett")} />
                        fester Text
                      </label>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3">Automatische Hintergrund-Sicherung</h3>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="autoSave" checked={!form.autoSaveEnabled} onChange={() => update("autoSaveEnabled", false)} />
                        keine Sicherung
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="autoSave" checked={form.autoSaveEnabled || false} onChange={() => update("autoSaveEnabled", true)} />
                        Sicherung nach
                        <Input type="number" className="h-8 w-14 text-sm font-medium text-center" value={form.autoSaveMinutes || 2} onChange={(e) => update("autoSaveMinutes", parseInt(e.target.value) || 2)} data-testid="edset-autosave-min" />
                        <span className="text-xs">min</span>
                      </label>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3">Aufmaße</h3>
                    <CBox checked={form.aufmasseAnzeigen !== false} onChange={(v) => update("aufmasseAnzeigen", v)} label="Aufmaße in Positionen anzeigen" testId="edset-aufmasse" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BETRIEBSDATEN ── */}
        <TabsContent value="betriebsdaten">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="min-w-0">
                  <fieldset className="border border-gray-200 rounded p-4 space-y-3">
                    <legend className="text-sm font-semibold px-1">Benutzerdaten</legend>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-28">Firmenname</span>
                        <span className="font-medium">{companySettings?.companyName || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-28">Firmenanschrift</span>
                        <span className="font-medium text-xs">{companySettings?.companyName} · {companySettings?.street} · {companySettings?.zip} {companySettings?.city}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-28">Erstellungsort</span>
                        <span className="font-medium">{companySettings?.city || "Hamburg"}</span>
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-4 space-y-3 mt-4">
                    <legend className="text-sm font-semibold px-1">Kupferkalkulation</legend>
                    <CBox checked={form.kupferBeruecksichtigen || false} onChange={(v) => update("kupferBeruecksichtigen", v)} label="Kupferpreis bei der Kalkulation berücksichtigen" testId="edset-kupfer" />
                    <NumField label="aktuelle Kupfer-Notation" value={form.kupferNotation || "200"} onChange={(v) => update("kupferNotation", v)} testId="edset-kupfer-notation" decimal />
                    <CBox checked={form.kupferMaterialAufschlag || false} onChange={(v) => update("kupferMaterialAufschlag", v)} label="Material-Aufschlag auch auf Kupfer anwenden" testId="edset-kupfer-mat" />
                  </fieldset>
                </div>

                <div className="min-w-0">
                  <fieldset className="border border-gray-200 rounded p-4 space-y-3">
                    <legend className="text-sm font-semibold px-1">Standard-Mengeneinheiten</legend>
                    <NumField label="Materialpositionen" value={form.stdMeMaterial || "m²"} onChange={(v) => update("stdMeMaterial", v)} testId="edset-me-material" width="w-16" />
                    <NumField label="Leistungs-Positionen" value={form.stdMeLeistung || "m²"} onChange={(v) => update("stdMeLeistung", v)} testId="edset-me-leistung" width="w-16" />
                    <NumField label="Jumbo-Positionen" value={form.stdMeJumbo || "Stk"} onChange={(v) => update("stdMeJumbo", v)} testId="edset-me-jumbo" width="w-16" />
                  </fieldset>
                </div>
              </div>

              <fieldset className="border border-gray-200 rounded p-4 space-y-3 mt-4">
                <legend className="text-sm font-semibold px-1">Standard-Vorgaben für neu angelegte Stammdaten und manuelle Positionen</legend>
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto_1fr] gap-x-4 gap-y-2 items-center text-sm">
                  <span></span>
                  <span className="text-center text-xs text-muted-foreground">Aufschlag auf Material</span>
                  <span className="text-center text-xs text-muted-foreground">kalkulierter Lohnsatz</span>
                  <span></span>
                  <span className="text-xs text-muted-foreground">Selbstkosten-Lohnsatz</span>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-20 text-sm font-medium text-right" value={toDeStr(form.selbstkostenLohnsatz || "29,00")} onChange={(e) => update("selbstkostenLohnsatz", fromDeStr(e.target.value))} data-testid="edset-sk-lohn" />
                    <span className="text-xs">€</span>
                  </div>

                  <span className="text-sm font-medium">Preis 1</span>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-16 text-sm font-medium text-right" value={toDeStr(form.aufschlagMaterial1 || "30,00")} onChange={(e) => update("aufschlagMaterial1", fromDeStr(e.target.value))} data-testid="edset-mat1" />
                    <span className="text-xs">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-20 text-sm font-medium text-right" value={toDeStr(form.kalkulierterLohnsatz1 || "66,30")} onChange={(e) => update("kalkulierterLohnsatz1", fromDeStr(e.target.value))} data-testid="edset-lohn1" />
                    <span className="text-xs">€</span>
                  </div>
                  <span></span>
                  <span className="text-xs text-muted-foreground">Aufschlag auf Gerätekosten</span>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-16 text-sm font-medium text-right" value={toDeStr(form.aufschlagGeraete || "30,00")} onChange={(e) => update("aufschlagGeraete", fromDeStr(e.target.value))} data-testid="edset-geraete" />
                    <span className="text-xs">%</span>
                  </div>

                  <span className="text-sm font-medium">Preis 2</span>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-16 text-sm font-medium text-right" value={toDeStr(form.aufschlagMaterial2 || "25,00")} onChange={(e) => update("aufschlagMaterial2", fromDeStr(e.target.value))} data-testid="edset-mat2" />
                    <span className="text-xs">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-20 text-sm font-medium text-right" value={toDeStr(form.kalkulierterLohnsatz2 || "62,50")} onChange={(e) => update("kalkulierterLohnsatz2", fromDeStr(e.target.value))} data-testid="edset-lohn2" />
                    <span className="text-xs">€</span>
                  </div>
                  <span></span>
                  <span className="text-xs text-muted-foreground">Aufschlag auf Fremdleistungen</span>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-16 text-sm font-medium text-right" value={toDeStr(form.aufschlagFremdleistung || "30,00")} onChange={(e) => update("aufschlagFremdleistung", fromDeStr(e.target.value))} data-testid="edset-fremd" />
                    <span className="text-xs">%</span>
                  </div>

                  <span className="text-sm font-medium">Preis 3</span>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-16 text-sm font-medium text-right" value={toDeStr(form.aufschlagMaterial3 || "21,00")} onChange={(e) => update("aufschlagMaterial3", fromDeStr(e.target.value))} data-testid="edset-mat3" />
                    <span className="text-xs">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input type="text" className="h-8 w-20 text-sm font-medium text-right" value={toDeStr(form.kalkulierterLohnsatz3 || "58,50")} onChange={(e) => update("kalkulierterLohnsatz3", fromDeStr(e.target.value))} data-testid="edset-lohn3" />
                    <span className="text-xs">€</span>
                  </div>
                  <span></span><span></span><span></span>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-semibold mb-2">Preisbildung für neue Dokumente</h4>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="preisbildung" checked={form.preisbildungModus === "standard"} onChange={() => update("preisbildungModus", "standard")} />
                      entsprechend Standard-Vorgaben
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="preisbildung" checked={form.preisbildungModus === "schema"} onChange={() => update("preisbildungModus", "schema")} />
                      entsprechend Kalkulationsschema
                      <Input type="text" className="h-8 w-32 text-sm font-medium" value={form.preisbildungSchema || "Beispiel"} onChange={(e) => update("preisbildungSchema", e.target.value)} data-testid="edset-preisbildung-schema" />
                    </label>
                  </div>
                </div>
              </fieldset>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── VOREINSTELLUNGEN ── */}
        <TabsContent value="voreinstellungen">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="min-w-0">
                  <fieldset className="border border-gray-200 rounded p-4 space-y-2">
                    <legend className="text-sm font-semibold px-1">Stammdaten-Übernahme</legend>
                    <CBox checked={form.materialMehrfach !== false} onChange={(v) => update("materialMehrfach", v)} label="Material-Mehrfachübernahme" testId="edset-mat-mehrfach" />
                    <CBox checked={form.leistungsMehrfach !== false} onChange={(v) => update("leistungsMehrfach", v)} label="Leistungs-Mehrfachübernahme" testId="edset-leist-mehrfach" />
                    <CBox checked={form.jumboMehrfach !== false} onChange={(v) => update("jumboMehrfach", v)} label="JUMBO-Mehrfachübernahme" testId="edset-jumbo-mehrfach" />
                    <CBox checked={form.floskelMehrfach || false} onChange={(v) => update("floskelMehrfach", v)} label="Floskel-Mehrfachübernahme" testId="edset-floskel-mehrfach" />
                    <CBox checked={form.kalkUebersichtZeigen || false} onChange={(v) => update("kalkUebersichtZeigen", v)} label="Kalkulationsübersicht zeigen" testId="edset-kalk-uebersicht" />
                    <CBox checked={form.mehrfachauswahlDokumente || false} onChange={(v) => update("mehrfachauswahlDokumente", v)} label="Mehrfachauswahl bei Dokumenten" testId="edset-mehrfach-dok" />
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-4 space-y-2 mt-4">
                    <legend className="text-sm font-semibold px-1">Zahlungsbedingungen</legend>
                    <NumField label="Rabatt" value={form.defaultRabatt || "0,00"} onChange={(v) => update("defaultRabatt", v)} unit="%" testId="edset-def-rabatt" decimal />
                    <NumField label="Skonto" value={form.defaultSkonto || "2,00"} onChange={(v) => update("defaultSkonto", v)} unit="%" testId="edset-def-skonto" decimal />
                    <NumField label="Skonto innerhalb von" value={form.defaultSkontoTage || 7} onChange={(v) => update("defaultSkontoTage", parseInt(v) || 0)} unit="Tagen" testId="edset-def-skonto-tage" />
                    <NumField label="Rechnungen fällig nach" value={form.defaultZahlungsziel || 14} onChange={(v) => update("defaultZahlungsziel", parseInt(v) || 0)} unit="Tagen" testId="edset-def-zahlungsziel" />
                    <NumField label="Zahlungserinnerung nach" value={form.defaultZahlungserinnerung || 14} onChange={(v) => update("defaultZahlungserinnerung", parseInt(v) || 0)} unit="Tagen" testId="edset-def-erinnerung" />
                    <NumField label="nächste Mahnung nach" value={form.defaultMahnung || 14} onChange={(v) => update("defaultMahnung", parseInt(v) || 0)} unit="Tagen" testId="edset-def-mahnung" />
                    <CBox checked={form.skontoNurMaterial || false} onChange={(v) => update("skontoNurMaterial", v)} label="Skonto nur auf Materialanteil gewähren" testId="edset-skonto-material" />
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-3 space-y-2 mt-4 max-w-xs">
                    <legend className="text-sm font-semibold px-1">Positionsnummerierung</legend>
                    <CBox checked={form.autoPositionNumbers !== false} onChange={(v) => update("autoPositionNumbers", v)} label="Automatische Positionsnummerierung" testId="edset-auto-pos" />
                    <div className="flex items-center gap-3 pl-6">
                      <span className="text-sm text-muted-foreground">Schrittweite</span>
                      <Input type="text" className="h-8 w-14 text-sm font-medium text-center" value={form.positionNumberStep || 1} onChange={(e) => update("positionNumberStep", parseInt(e.target.value) || 1)} data-testid="edset-pos-step" />
                      <span className="text-sm text-muted-foreground">Beginn mit</span>
                      <Input type="text" className="h-8 w-14 text-sm font-medium text-center" value={form.positionNumberStart || 1} onChange={(e) => update("positionNumberStart", parseInt(e.target.value) || 1)} data-testid="edset-pos-start" />
                    </div>
                  </fieldset>
                </div>

                <div className="min-w-0">
                  <fieldset className="border border-gray-200 rounded p-4 space-y-2">
                    <legend className="text-sm font-semibold px-1">Voreinstellung für neue Dokumente</legend>
                    <CBox checked={form.preiseInklUst || false} onChange={(v) => update("preiseInklUst", v)} label="Preise inklusive Umsatzsteuer" testId="edset-inkl-ust" />
                    <CBox checked={form.eigenschaftenNeuanlage || false} onChange={(v) => update("eigenschaftenNeuanlage", v)} label="Eigenschaften bei Neuanlage übernehmen" testId="edset-eigensch-neuanlage" />
                    <CBox checked={form.langtexteFormatiert !== false} onChange={(v) => update("langtexteFormatiert", v)} label="Langtexte formatiert übernehmen" testId="edset-langtexte" />
                    <CBox checked={form.kurztexteVerwenden || false} onChange={(v) => update("kurztexteVerwenden", v)} label="Kurztexte in Positionen verwenden" testId="edset-kurztexte" />
                    <CBox checked={form.jumboListenAnzeigen !== false} onChange={(v) => update("jumboListenAnzeigen", v)} label="Jumbo-Positionslisten anzeigen" testId="edset-jumbo-listen" />
                    <CBox checked={form.jumboKleinerSchrift || false} onChange={(v) => update("jumboKleinerSchrift", v)} label="Jumbo-Positionslisten in kleinerer Schrift" testId="edset-jumbo-klein" />
                    <CBox checked={form.mengenInJumbo !== false} onChange={(v) => update("mengenInJumbo", v)} label="Mengen in Jumbo-Positionslisten anzeigen" testId="edset-mengen-jumbo" />
                    <CBox checked={form.ePreiseInJumbo !== false} onChange={(v) => update("ePreiseInJumbo", v)} label="E-Preise in Jumbo-Positionslisten anzeigen" testId="edset-ep-jumbo" />
                    <CBox checked={form.titelsummenAutoEinfuegen || false} onChange={(v) => update("titelsummenAutoEinfuegen", v)} label="Titelsummen automatisch einfügen" testId="edset-titelsummen" />
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-4 space-y-2 mt-4">
                    <legend className="text-sm font-semibold px-1">Anzahl der Einzelpreis-Nachkommastellen</legend>
                    <NumField label="in Materialpositionen" value={form.dezMaterialPreise ?? 2} onChange={(v) => update("dezMaterialPreise", parseInt(v) || 0)} testId="edset-dez-mat" width="w-12" />
                    <NumField label="in Leistungspositionen" value={form.dezLeistungsPreise ?? 2} onChange={(v) => update("dezLeistungsPreise", parseInt(v) || 0)} testId="edset-dez-leist" width="w-12" />
                    <NumField label="in Jumbopositionen" value={form.dezJumboPreise ?? 2} onChange={(v) => update("dezJumboPreise", parseInt(v) || 0)} testId="edset-dez-jumbo" width="w-12" />
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-4 space-y-2 mt-4">
                    <legend className="text-sm font-semibold px-1">Kalkulation</legend>
                    <CBox checked={form.vkPreisNachEk !== false} onChange={(v) => update("vkPreisNachEk", v)} label="Verkaufspreis folgt dem Einkaufspreis" testId="edset-vk-ek" />
                    <CBox checked={form.gleichartigeAktualisieren !== false} onChange={(v) => update("gleichartigeAktualisieren", v)} label="gleichartige Positionen aktualisieren" testId="edset-gleichartige" />
                  </fieldset>

                  <fieldset className="border border-gray-200 rounded p-4 space-y-2 mt-4">
                    <legend className="text-sm font-semibold px-1">Kalkulationsvorlagen</legend>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground w-20">Dokument</span>
                      <Select value={form.dokKalkSchema || "STANDARD90"} onValueChange={(v) => update("dokKalkSchema", v)}>
                        <SelectTrigger className="h-8 text-sm font-medium w-40" data-testid="edset-dok-kalk"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STANDARD90">STANDARD90</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground w-20">Position</span>
                      <Select value={form.posKalkSchema || "STANDARD90"} onValueChange={(v) => update("posKalkSchema", v)}>
                        <SelectTrigger className="h-8 text-sm font-medium w-40" data-testid="edset-pos-kalk"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STANDARD90">STANDARD90</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </fieldset>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── STANDARDTEXTE ── */}
        <TabsContent value="standardtexte">
          <Card>
            <CardHeader><CardTitle>Textvoreinstellungen</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(defaultStandardtexte).map(([key, defaultVal]) => {
                  const labels: Record<string, string> = {
                    bezugsdokument: "Text vor Bezugsdokument-Feld",
                    betreffZeile: "Text vor der Betreff-Zeile",
                    alternativZeilen: "Text vor Alternativ-Zeilen",
                    bedarfsZeilen: "Text vor Bedarfs-Zeilen",
                    standardBetreff: "Standard-Betreff",
                    jumboPositionslisten: "Text vor JUMBO-Positionslisten",
                    umsatzsteuerText: "Umsatzsteuer-Text",
                    umsatzsteuerBrutto: "Umsatzsteuer-Text (brutto)",
                    steuerklassenText: "Steuerklassen-Text",
                    nettoKennzeichnung: "netto Kennzeichnung",
                    rabattText: "Zu- oder Abschlag-Text",
                    skontoText: "Skonto-Text",
                    titelText: "Titel-Text",
                    untertitelText: "Untertitel-Text",
                    titelsummenText: "Titelsummen-Text",
                    zwischensummenText: "Zwischensummen-Text",
                    nettosummenText: "Nettosummen-Text",
                  };
                  return (
                    <div key={key} className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground text-right min-w-[220px]">{labels[key] || key}</span>
                      <Input
                        className="h-8 text-sm font-medium flex-1"
                        value={st[key] || ""}
                        onChange={(e) => updateStandardtext(key, e.target.value)}
                        data-testid={`edset-text-${key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FREIE FORMULAR-FELDER ── */}
        <TabsContent value="formularfelder">
          <Card>
            <CardHeader>
              <CardTitle>freie Formular-Felder</CardTitle>
              <p className="text-sm text-muted-foreground">
                Mit dem Formular-Designer können auf Formularen bis zu 10 Felder zur freien Verwendung angeordnet werden.
                Die hier voreingestellten Feldinhalte sind im Dokument frei änderbar.
              </p>
              <p className="text-xs text-muted-foreground">
                Mögliche Anwendungen sind 'Ihr Zeichen', 'Unsere Zeichen' oder der Name des Sachbearbeiters.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Label className="text-muted-foreground w-16 text-right shrink-0">Feld {i + 1}</Label>
                    <Input
                      className="h-8 text-sm font-medium flex-1"
                      value={ff[`feld${i + 1}`] || ""}
                      onChange={(e) => updateFormularfeld(`feld${i + 1}`, e.target.value)}
                      data-testid={`edset-feld-${i + 1}`}
                    />
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-3 mt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Diese im Formular anzeigbaren Felder stehen zusätzlich auch in der Dokumentenliste zur Verfügung.
                </p>
                <div className="space-y-1.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Label className="text-muted-foreground w-16 text-right shrink-0">ZusFeld {i + 1}</Label>
                      <Input
                        className="h-8 text-sm font-medium flex-1"
                        value={ff[`zusfeld${i + 1}`] || ""}
                        onChange={(e) => updateFormularfeld(`zusfeld${i + 1}`, e.target.value)}
                        data-testid={`edset-zusfeld-${i + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── MARKIERUNGEN | §13b ── */}
        <TabsContent value="markierungen">
          <Card>
            <CardContent className="pt-6">
              <fieldset className="border border-gray-200 rounded p-4 space-y-2">
                <legend className="text-sm font-semibold px-1">Statusmarkierungen</legend>
                <CBox checked={form.statusmarkierungenPositionen || false} onChange={(v) => update("statusmarkierungenPositionen", v)} label="Statusmarkierungen für Positionen zeigen" testId="edset-status-marker" />
                <CBox checked={form.druckMarkerPruefen !== false} onChange={(v) => update("druckMarkerPruefen", v)} label="Dokumente vor dem Drucken oder der Ausgabe als ✗Rechnung auf Marker prüfen" testId="edset-druck-marker" />
                <CBox checked={form.schliessenMarkerPruefen !== false} onChange={(v) => update("schliessenMarkerPruefen", v)} label="Dokumente vor dem Schließen auf Marker prüfen" testId="edset-schliessen-marker" />
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <NumField label="⚠ Warnung bei Aufschlag unter" value={form.warnungAufschlagUnter || "10,00"} onChange={(v) => update("warnungAufschlagUnter", v)} unit="%" testId="edset-warnung" decimal />
                  <NumField label="🚨 Alarm bei Aufschlag unter" value={form.alarmAufschlagUnter || "0,00"} onChange={(v) => update("alarmAufschlagUnter", v)} unit="%" testId="edset-alarm" decimal />
                </div>
              </fieldset>

              <fieldset className="border border-gray-200 rounded p-4 space-y-3 mt-4">
                <legend className="text-sm font-semibold px-1">Steuerschuldumkehr gemäß § 13b UStG</legend>
                <p className="text-sm text-muted-foreground">
                  Die Umkehrung der Steuerschuldnerschaft ist in § 13b UStG geregelt. Demnach geht bei bestimmten Leistungen die
                  Steuerschuldnerschaft auf den Leistungsempfänger über, sofern dieser ein Unternehmer im Sinne des Umsatzsteuergesetzes ist
                  (Umkehrung der Steuerschuldnerschaft).
                </p>
                <p className="text-sm text-muted-foreground">
                  Sofern für ein Dokument das hierfür vorgesehene Standarderlöskonto
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Konten</span>
                  <Input className="h-8 w-20 text-sm font-medium" value={form.par13bKonto || "4337"} onChange={(e) => update("par13bKonto", e.target.value)} data-testid="edset-13b-konto" />
                  <Input className="h-8 flex-1 text-sm font-medium" value={form.par13bText || ""} onChange={(e) => update("par13bText", e.target.value)} data-testid="edset-13b-text" />
                </div>
                <p className="text-sm text-muted-foreground">
                  eingestellt ist, kann automatisch mit der Gesamtsumme zusätzlich eine auszuwählende Floskel eingefügt werden,
                  die auf die Umkehrung der Steuerschuldnerschaft hinweist.
                </p>
              </fieldset>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DOKUMENTTYPEN ── */}
        <TabsContent value="dokumenttypen">
          <Card>
            <CardHeader>
              <CardTitle>Voreinstellungen für neu zu erstellende Dokumente</CardTitle>
              <p className="text-sm text-muted-foreground">
                Der Titel eines Dokumentes ergibt sich aus der nachfolgend für den jeweiligen Dokumenttyp festgelegten Bezeichnung
                und der Dokument-Nummer (z.B. Angebot 12345/98).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {documentTypeSettings.map(({ key, label }) => {
                const dt = (form.dokumenttypen || {})[key] || {};
                const updateDt = (field: string, value: any) => {
                  const current = form.dokumenttypen || {};
                  update("dokumenttypen", {
                    ...current,
                    [key]: { ...(current[key] || {}), [field]: value },
                  });
                };
                return (
                  <fieldset key={key} className="border border-gray-200 rounded p-3 space-y-2">
                    <legend className="text-xs font-semibold px-1">{label}</legend>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-24">Bezeichnung</span>
                        <Input className="h-8 text-sm font-medium flex-1" value={dt.bezeichnung || label} onChange={(e) => updateDt("bezeichnung", e.target.value)} data-testid={`edset-dt-${key}-bez`} />
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-24">Formular</span>
                        <Select value={dt.formTemplateId ? String(dt.formTemplateId) : "__standard__"} onValueChange={(v) => updateDt("formTemplateId", v === "__standard__" ? "" : v)}>
                          <SelectTrigger className="h-8 text-sm font-medium flex-1" data-testid={`edset-dt-${key}-form`}><SelectValue placeholder="Standard" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__standard__">Standard</SelectItem>
                            {formTemplates?.filter(t => t.status === "aktiv").map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </fieldset>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button className="w-full" size="lg" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-editor-settings">
        <Save className="h-4 w-4 mr-2" />{saveMutation.isPending ? "Wird gespeichert..." : "Einstellungen speichern"}
      </Button>
    </div>
  );
}
