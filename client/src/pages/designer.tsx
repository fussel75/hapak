import { useState, useEffect, useRef, useCallback, useMemo as useMemoReact } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Loader2, FileText, List, Copy, Save,
  Image, Type, Variable, LayoutGrid, GripVertical,
  Filter, ArrowUpDown, ZoomIn, ChevronUp, ChevronDown, X, Upload, Download,
  Ruler, Magnet
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  formTemplateTypeOptions,
  getFormTemplateTypeLabel,
  normalizeFormTemplateType,
} from "@shared/document-engine/document-types";

interface FormField {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  typ: string;
  inhalt: string;
  aktiv: boolean;
  drucken: boolean;
  font?: string;
  farbe?: string;
  imageUrl?: string;
  ausrichtung?: string;
}

function parseFontSpec(fontStr?: string): { fontFamily: string; fontSize: number; fontWeight: string } {
  if (!fontStr) return { fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: "normal" };
  const bold = /bold/i.test(fontStr);
  const sizeMatch = fontStr.match(/(\d+(?:\.\d+)?)pt/);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : 10;
  const family = fontStr.replace(/bold/i, "").replace(/[\d.]+pt/i, "").trim() || "Arial";
  return { fontFamily: `${family}, sans-serif`, fontSize: size, fontWeight: bold ? "bold" : "normal" };
}

interface EndsummeConfig {
  schriftart?: string;
  schriftartGesamt?: string;
  labelNetto?: string;
  labelMwst?: string;
  labelGesamt?: string;
  labelLohn?: string;
  labelZahlbetrag?: string;
  labelRestsumme?: string;
  labelSummeAbschlaege?: string;
  labelGesamtrechnungsbetrag?: string;
  schriftartSkonto?: string;
  linienBreite?: number;
  linienBreiteGesamt?: number;
  gesamtUnterstreichung?: "einfach" | "doppelt";
  abstandZeilen?: number;
  defaultHideNetto?: boolean;
  defaultHideMwst?: boolean;
  defaultHideGesamt?: boolean;
}

interface WorkAreaConfig {
  schriftart: string;
  schriftartTitel?: string;
  zeilenAbstand: number;
  linienBreite: number;
  spalten: { name: string; breite: number; ausrichtung: string }[];
  tabellenkopf: { hintergrund: string; schriftart: string; rahmen: boolean; linienBreite?: number };
  endsumme?: EndsummeConfig;
}

interface FormTemplateData {
  id: number;
  name: string;
  type: string;
  description: string | null;
  status: string;
  printer: string | null;
  fields: FormField[];
  fieldsPage2: FormField[];
  workArea: WorkAreaConfig | null;
  createdAt: string;
}

interface ListColumn {
  name: string;
  feld: string;
  breite: number;
  sichtbar: boolean;
}

interface ListTemplateData {
  id: number;
  name: string;
  baseTable: string;
  description: string | null;
  columns: ListColumn[];
  filters: any[];
  sorting: any;
  status: string;
  createdAt: string;
}

const DEFAULT_FIELDS: FormField[] = [
  { id: "logo", x: 60, y: 25, w: 200, h: 55, typ: "Bild", inhalt: "[Firmenlogo]", aktiv: true, drucken: true },
  { id: "firma_adresse", x: 400, y: 25, w: 160, h: 65, typ: "Text", inhalt: "Haldesdorfer Str. 44\n22179 Hamburg\nTel: 040 - 38 67 45 65\nFax: 040 - 38 67 45 66\npost@fristd-bau.com\nSt.-Nr.: 50/620/01754", aktiv: true, drucken: true, font: "Arial 8pt", farbe: "#333333", ausrichtung: "rechts" },
  { id: "trennlinie", x: 60, y: 88, w: 475, h: 1, typ: "Text", inhalt: "———————————————————————————————————————————————————", aktiv: true, drucken: true, font: "Arial 6pt", farbe: "#999999" },
  { id: "absender", x: 60, y: 95, w: 280, h: 8, typ: "Text", inhalt: "FriStD-Bau ZuB GmbH & Co.KG \u00b7 Haldesdorfer Str. 44 \u00b7 22179 Hamburg", aktiv: true, drucken: true, font: "Arial 7pt", farbe: "#718096" },
  { id: "kundenadresse", x: 60, y: 110, w: 260, h: 60, typ: "Variabel", inhalt: "[Kundenadresse]", aktiv: true, drucken: true },
  { id: "projekt_nr", x: 395, y: 110, w: 165, h: 12, typ: "Variabel", inhalt: "Projekt-Nr.: [Projektnummer]", aktiv: true, drucken: true },
  { id: "kunden_nr", x: 395, y: 124, w: 165, h: 12, typ: "Variabel", inhalt: "Kunden-Nr.: [Kundennummer]", aktiv: true, drucken: true },
  { id: "ort_datum", x: 395, y: 138, w: 165, h: 12, typ: "Variabel", inhalt: "[Ort]  [Datum]", aktiv: true, drucken: true },
  { id: "dok_titel", x: 395, y: 158, w: 165, h: 16, typ: "Variabel", inhalt: "[Dokumenttyp] [Dok.-Nr.]", aktiv: true, drucken: true, font: "Arial Bold 14pt" },
  { id: "bauvorhaben", x: 60, y: 180, w: 500, h: 12, typ: "Variabel", inhalt: "Bauvorhaben: [Projektname]", aktiv: true, drucken: true },
  { id: "arbeitsbereich", x: 60, y: 200, w: 500, h: 550, typ: "Variabel", inhalt: "[Arbeitsbereich]", aktiv: true, drucken: true },
  { id: "fusszeile_links", x: 60, y: 790, w: 170, h: 25, typ: "Text", inhalt: "GF: Ronny Friedrich\nVollhafter: FriStD-Bau Verwaltung\nHRA 119618 AG Hamburg", aktiv: true, drucken: true, font: "Arial 7pt", farbe: "#718096" },
  { id: "fusszeile_mitte", x: 230, y: 790, w: 180, h: 25, typ: "Text", inhalt: "Postbank Hamburg\nIBAN DE58 2001 0020 0637 5432 04\nBIC PBNKDEFFXXX", aktiv: true, drucken: true, font: "Arial 7pt", farbe: "#718096" },
  { id: "fusszeile_rechts", x: 410, y: 790, w: 150, h: 25, typ: "Text", inhalt: "Haldesdorfer Str. 44\n22179 Hamburg\nTel: 040 - 38 67 45 65", aktiv: true, drucken: true, font: "Arial 7pt", farbe: "#718096", ausrichtung: "rechts" },
];

const DEFAULT_FIELDS_PAGE2: FormField[] = [
  { id: "firma_p2", x: 60, y: 25, w: 300, h: 12, typ: "Text", inhalt: "FriStD-Bau ZuB GmbH & Co.KG", aktiv: true, drucken: true, font: "Arial 9pt" },
  { id: "datum_p2", x: 395, y: 25, w: 80, h: 12, typ: "Variabel", inhalt: "[Datum]", aktiv: true, drucken: true },
  { id: "blatt_p2", x: 480, y: 25, w: 80, h: 12, typ: "Variabel", inhalt: "Blatt [Seitenzahl]", aktiv: true, drucken: true },
  { id: "doktyp_p2", x: 60, y: 42, w: 200, h: 12, typ: "Variabel", inhalt: "[Dokumenttyp] [Dok.-Nr.]", aktiv: true, drucken: true },
  { id: "kundennr_p2", x: 395, y: 42, w: 165, h: 12, typ: "Variabel", inhalt: "Kunden-Nr.: [Kundennummer]", aktiv: true, drucken: true },
  { id: "arbeitsbereich_p2", x: 60, y: 62, w: 500, h: 700, typ: "Variabel", inhalt: "[Arbeitsbereich]", aktiv: true, drucken: true },
  { id: "fusszeile_links_p2", x: 60, y: 790, w: 170, h: 25, typ: "Text", inhalt: "GF: Ronny Friedrich\nVollhafter: FriStD-Bau Verwaltung\nHRA 119618 AG Hamburg", aktiv: true, drucken: true, font: "Arial 7pt", farbe: "#718096" },
  { id: "fusszeile_mitte_p2", x: 230, y: 790, w: 180, h: 25, typ: "Text", inhalt: "Postbank Hamburg\nIBAN DE58 2001 0020 0637 5432 04\nBIC PBNKDEFFXXX", aktiv: true, drucken: true, font: "Arial 7pt", farbe: "#718096" },
  { id: "fusszeile_rechts_p2", x: 410, y: 790, w: 150, h: 25, typ: "Text", inhalt: "Haldesdorfer Str. 44\n22179 Hamburg\nTel: 040 - 38 67 45 65", aktiv: true, drucken: true, font: "Arial 7pt", farbe: "#718096", ausrichtung: "rechts" },
];

const DEFAULT_ENDSUMME: EndsummeConfig = {
  schriftart: "Nimbus Sans 9pt",
  schriftartGesamt: "Nimbus Sans Bold 10pt",
  labelNetto: "Nettosumme",
  labelMwst: "Umsatzsteuer {satz} %",
  labelGesamt: "Gesamtsumme",
  labelLohn: "Enthaltener Lohnanteil gem. §35a EStG: {betrag}",
  linienBreite: 0.5,
  linienBreiteGesamt: 1,
  abstandZeilen: 4,
};

const DEFAULT_WORKAREA: WorkAreaConfig = {
  schriftart: "Arial 10pt",
  zeilenAbstand: 4,
  linienBreite: 0.5,
  spalten: [
    { name: "Pos", breite: 35, ausrichtung: "links" },
    { name: "Menge", breite: 45, ausrichtung: "rechts" },
    { name: "ME", breite: 25, ausrichtung: "links" },
    { name: "Bezeichnung", breite: 250, ausrichtung: "links" },
    { name: "E-Preis", breite: 70, ausrichtung: "rechts" },
    { name: "G-Preis", breite: 70, ausrichtung: "rechts" },
  ],
  tabellenkopf: { hintergrund: "#F0F0F0", schriftart: "Arial Bold 9pt", rahmen: true },
  endsumme: DEFAULT_ENDSUMME,
};

const typColors: Record<string, string> = {
  Bild: "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40",
  Text: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40",
  Variabel: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40",
  Arbeitsbereich: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40",
};

const typIcons: Record<string, typeof Image> = { Bild: Image, Text: Type, Variabel: Variable, Arbeitsbereich: LayoutGrid };
const typBorderColors: Record<string, string> = { Bild: "#805AD5", Text: "#2B6CB0", Variabel: "#D69E2E", Arbeitsbereich: "#38A169" };

const FIELD_TYPES = ["Text", "Variabel", "Bild", "Arbeitsbereich"];
const LIST_BASE_TABLES = [
  { value: "Adressen", label: "Adressen / Kunden" },
  { value: "Rechnungsausgang", label: "Rechnungsausgang" },
  { value: "Projektverwaltung", label: "Projektverwaltung" },
  { value: "Lagerverwaltung", label: "Lagerverwaltung" },
  { value: "Kassenbuch", label: "Kassenbuch" },
  { value: "Personal", label: "Personal" },
  { value: "Materialstamm", label: "Materialstamm" },
];

const FONT_OPTIONS = [
  "Arial", "Arial Black", "Calibri", "Cambria", "Courier New", "Georgia",
  "Helvetica", "Nimbus Sans", "Nimbus Sans L", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
];

const FONT_SIZE_OPTIONS = ["6", "7", "7.5", "8", "8.5", "9", "10", "11", "12", "14", "16", "18", "20", "24"];

const VARIABLE_TOKENS = [
  "[Firmenlogo]", "[Kundenadresse]", "[Dokumenttyp]", "[Dok.-Nr.]", "[Datum]",
  "[Betreff]", "[Vortext/Floskel]", "[Nachtext/Floskel]", "[Positionstabelle]",
  "[Kundennummer]", "[Kundenname]", "[Projektnummer]", "[Projektname]",
  "[Sachbearbeiter]", "[Zahlungsbedingung]", "[Skonto]", "[IBAN]", "[BIC]",
  "[Steuernummer]", "[USt-IdNr.]", "[Seitenzahl]", "[Gesamtseiten]",
  "[Arbeitsbereich]",
];

function ImageUploadButton({ onUploaded, label }: { onUploaded: (url: string) => void; label?: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/uploads/image", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload fehlgeschlagen");
      const data = await res.json();
      onUploaded(data.url);
      toast({ title: "Bild hochgeladen" });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="button-upload-image">
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {label || "Bild hochladen"}
      </Button>
    </>
  );
}

function FieldEditDialog({ field, open, onOpenChange, onSave }: {
  field: FormField;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (f: FormField) => void;
}) {
  const [form, setForm] = useState<FormField>({ ...field });
  const upd = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { setForm({ ...field }); }, [field]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Feld bearbeiten: {field.id}</DialogTitle>
          <DialogDescription>Position, Größe und Eigenschaften des Feldes anpassen</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Feld-ID</Label>
              <Input className="h-8 text-xs" value={form.id} onChange={e => upd("id", e.target.value)} data-testid="input-field-id" />
            </div>
            <div>
              <Label className="text-xs">Typ</Label>
              <Select value={form.typ} onValueChange={v => upd("typ", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-field-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">X (pt)</Label>
              <Input className="h-8 text-xs" type="number" value={form.x} onChange={e => upd("x", +e.target.value)} data-testid="input-field-x" />
            </div>
            <div>
              <Label className="text-xs">Y (pt)</Label>
              <Input className="h-8 text-xs" type="number" value={form.y} onChange={e => upd("y", +e.target.value)} data-testid="input-field-y" />
            </div>
            <div>
              <Label className="text-xs">Breite</Label>
              <Input className="h-8 text-xs" type="number" value={form.w} onChange={e => upd("w", +e.target.value)} data-testid="input-field-w" />
            </div>
            <div>
              <Label className="text-xs">Höhe</Label>
              <Input className="h-8 text-xs" type="number" value={form.h} onChange={e => upd("h", +e.target.value)} data-testid="input-field-h" />
            </div>
          </div>

          {form.typ === "Bild" && (
            <div className="space-y-2 border rounded-lg p-3 bg-purple-50/50 dark:bg-purple-950/20">
              <Label className="text-xs font-semibold">Bild / Logo</Label>
              {form.imageUrl ? (
                <div className="space-y-2">
                  <img src={form.imageUrl} alt="Logo" className="max-h-[80px] border rounded bg-white p-1" />
                  <div className="flex gap-2">
                    <ImageUploadButton onUploaded={(url) => upd("imageUrl", url)} label="Ersetzen" />
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => upd("imageUrl", "")} data-testid="button-remove-image">
                      <Trash2 className="h-3 w-3 mr-1" />Entfernen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-3 border-2 border-dashed rounded-lg">
                  <Image className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Kein Bild hochgeladen</p>
                  <ImageUploadButton onUploaded={(url) => upd("imageUrl", url)} label="Bild hochladen" />
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">Inhalt</Label>
            <Textarea className="text-xs min-h-[60px]" value={form.inhalt} onChange={e => upd("inhalt", e.target.value)} data-testid="input-field-content" />
            {form.typ === "Variabel" && (
              <div className="flex flex-wrap gap-1 mt-1">
                {VARIABLE_TOKENS.map(t => (
                  <button key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                    onClick={() => upd("inhalt", form.inhalt + " " + t)}>{t}</button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FontPicker value={form.font || ""} onChange={v => upd("font", v)} label="Schrift" testId="input-field-font" />
            <div>
              <Label className="text-xs">Farbe</Label>
              <div className="flex gap-2">
                <Input className="h-8 text-xs flex-1" value={form.farbe || ""} onChange={e => upd("farbe", e.target.value)} placeholder="#000000" data-testid="input-field-color" />
                <Input type="color" className="h-8 w-10 p-0.5" value={form.farbe || "#000000"} onChange={e => upd("farbe", e.target.value)} />
              </div>
            </div>
          </div>
          {(form.typ === "Text" || form.typ === "Variabel") && (
            <div>
              <Label className="text-xs">Ausrichtung</Label>
              <Select value={form.ausrichtung || "links"} onValueChange={v => upd("ausrichtung", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-field-align"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="links">Linksbündig</SelectItem>
                  <SelectItem value="zentriert">Zentriert</SelectItem>
                  <SelectItem value="rechts">Rechtsbündig</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch checked={form.aktiv} onCheckedChange={v => upd("aktiv", v)} data-testid="switch-field-active" />
              Aktiv
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch checked={form.drucken} onCheckedChange={v => upd("drucken", v)} data-testid="switch-field-print" />
              Drucken
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="button-cancel-field">Abbrechen</Button>
            <Button size="sm" onClick={() => { onSave(form); onOpenChange(false); }} data-testid="button-save-field">
              <Save className="h-3 w-3 mr-1" />Übernehmen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormTemplateDialog({ template, open, onOpenChange, onSaved }: {
  template?: FormTemplateData;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!template;
  const [form, setForm] = useState({
    name: template?.name || "",
    type: normalizeFormTemplateType(template?.type),
    description: template?.description || "",
    status: template?.status || "aktiv",
    printer: template?.printer || "",
  });
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name || "",
        type: normalizeFormTemplateType(template.type),
        description: template.description || "",
        status: template.status || "aktiv",
        printer: template.printer || "",
      });
    } else {
      setForm({ name: "", type: "Dokument", description: "", status: "aktiv", printer: "" });
    }
  }, [template, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form, type: normalizeFormTemplateType(form.type), fields: template?.fields || DEFAULT_FIELDS, fieldsPage2: template?.fieldsPage2 || DEFAULT_FIELDS_PAGE2, workArea: template?.workArea || DEFAULT_WORKAREA };
      if (isEdit) {
        await apiRequest("PATCH", `/api/form-templates/${template.id}`, payload);
      } else {
        await apiRequest("POST", "/api/form-templates", payload);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Formular aktualisiert" : "Formular erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/form-templates"] });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Formular bearbeiten" : "Neues Formular"}</DialogTitle>
          <DialogDescription>Formular-Eigenschaften festlegen</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-xs" value={form.name} onChange={e => upd("name", e.target.value)} placeholder="z.B. Rechnung_Standard" data-testid="input-form-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Typ</Label>
              <Select value={form.type} onValueChange={v => upd("type", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-form-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {formTemplateTypeOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => upd("status", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-form-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="inaktiv">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Textarea className="text-xs min-h-[50px]" value={form.description} onChange={e => upd("description", e.target.value)} data-testid="input-form-description" />
          </div>
          <div>
            <Label className="text-xs">Drucker</Label>
            <Input className="h-8 text-xs" value={form.printer} onChange={e => upd("printer", e.target.value)} placeholder="z.B. HP LaserJet Pro" data-testid="input-form-printer" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name} data-testid="button-save-form-template">
              {mutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FontPicker({ value, onChange: onFontChange, label, testId }: { value: string; onChange: (v: string) => void; label?: string; testId?: string }) {
  const parsed = parseFontSpec(value);
  const isBold = /bold/i.test(value);
  const familyRaw = parsed.fontFamily.replace(/, sans-serif$/, "");
  const sizeStr = String(parsed.fontSize);

  const buildFontStr = (family: string, size: string, bold: boolean) => {
    const parts: string[] = [];
    if (family) parts.push(family);
    if (bold) parts.push("Bold");
    parts.push(`${size}pt`);
    return parts.join(" ");
  };

  return (
    <div>
      {label && <Label className="text-xs">{label}</Label>}
      <div className="flex gap-1" data-testid={testId}>
        <Select value={familyRaw} onValueChange={v => onFontChange(buildFontStr(v, sizeStr, isBold))}>
          <SelectTrigger className="h-8 text-xs flex-1" data-testid={testId ? `${testId}-family` : undefined}><SelectValue placeholder="Schrift..." /></SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map(f => (
              <SelectItem key={f} value={f}>
                <span style={{ fontFamily: f }}>{f}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sizeStr} onValueChange={v => onFontChange(buildFontStr(familyRaw, v, isBold))}>
          <SelectTrigger className="h-8 text-xs w-[70px]" data-testid={testId ? `${testId}-size` : undefined}><SelectValue /></SelectTrigger>
          <SelectContent>
            {FONT_SIZE_OPTIONS.map(s => (
              <SelectItem key={s} value={s}>{s}pt</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={isBold ? "default" : "outline"}
          size="sm"
          className="h-8 w-8 p-0 font-bold text-xs shrink-0"
          onClick={() => onFontChange(buildFontStr(familyRaw, sizeStr, !isBold))}
          data-testid={testId ? `${testId}-bold` : undefined}
        >
          B
        </Button>
      </div>
    </div>
  );
}

const PRINTER_PROFILES = [
  { value: "PDF-Mailer", label: "PDF-Mailer (E-Mail-Versand)", desc: "Erzeugt PDF für E-Mail-Versand" },
  { value: "Adobe PDF", label: "Adobe PDF", desc: "Adobe Acrobat PDF-Drucker" },
  { value: "Microsoft Print to PDF", label: "Microsoft Print to PDF", desc: "Windows PDF-Ausgabe" },
  { value: "Standarddrucker", label: "Standarddrucker", desc: "Systemstandarddrucker verwenden" },
  { value: "HP LaserJet", label: "HP LaserJet", desc: "HP Laserdrucker" },
  { value: "Brother", label: "Brother", desc: "Brother Drucker" },
  { value: "DYMO LabelWriter", label: "DYMO LabelWriter", desc: "Etikettendrucker" },
];

function PrinterSettingsEditor({ template, onSave }: {
  template: FormTemplateData;
  onSave: (updates: Partial<FormTemplateData>) => Promise<void>;
}) {
  const [printer, setPrinter] = useState(template.printer || "PDF-Mailer");
  const [customPrinter, setCustomPrinter] = useState("");
  const [paperFormat, setPaperFormat] = useState("A4");
  const [orientation, setOrientation] = useState("Hochformat");
  const [margins, setMargins] = useState({ oben: 15, unten: 15, links: 20, rechts: 15 });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const isCustom = !PRINTER_PROFILES.some(p => p.value === printer);

  useEffect(() => {
    setPrinter(template.printer || "PDF-Mailer");
  }, [template.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalPrinter = isCustom ? (customPrinter || printer) : printer;
      await onSave({ printer: finalPrinter });
      toast({ title: "Druckereinstellung gespeichert" });
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Druckereinstellung — {template.name}</h3>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving} data-testid="button-save-printer">
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Speichern
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold mb-2">Druckerprofil</div>
            <div>
              <Label className="text-[10px]">Formulardrucker</Label>
              <Select value={isCustom ? "__custom__" : printer} onValueChange={v => {
                if (v === "__custom__") {
                  setPrinter("__custom__");
                  setCustomPrinter("");
                } else {
                  setPrinter(v);
                }
              }}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-printer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRINTER_PROFILES.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span>{p.label}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Benutzerdefiniert...</SelectItem>
                </SelectContent>
              </Select>
              {isCustom && (
                <Input className="h-7 text-xs mt-2" value={customPrinter || (printer !== "__custom__" ? printer : "")} onChange={e => { setCustomPrinter(e.target.value); setPrinter(e.target.value || "__custom__"); }} placeholder="Druckername eingeben..." data-testid="input-custom-printer" />
              )}
            </div>
            {!isCustom && (
              <p className="text-[10px] text-muted-foreground">{PRINTER_PROFILES.find(p => p.value === printer)?.desc}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Papierformat</Label>
                <Select value={paperFormat} onValueChange={setPaperFormat}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-paper-format"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                    <SelectItem value="A5">A5 (148 × 210 mm)</SelectItem>
                    <SelectItem value="Letter">Letter (216 × 279 mm)</SelectItem>
                    <SelectItem value="Legal">Legal (216 × 356 mm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Ausrichtung</Label>
                <Select value={orientation} onValueChange={setOrientation}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-orientation"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hochformat">Hochformat (Portrait)</SelectItem>
                    <SelectItem value="Querformat">Querformat (Landscape)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold mb-2">Seitenränder (mm)</div>
            <div className="grid grid-cols-2 gap-2">
              {(["oben", "unten", "links", "rechts"] as const).map(side => (
                <div key={side}>
                  <Label className="text-[10px]">{side.charAt(0).toUpperCase() + side.slice(1)}</Label>
                  <Input className="h-7 text-xs" type="number" value={margins[side]} onChange={e => setMargins(m => ({ ...m, [side]: +e.target.value }))} data-testid={`input-margin-${side}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableSpaltenRow({ spalte, idx, updSpalte, removeSpalte, moveSpalte, total }: {
  spalte: { name: string; breite: number; ausrichtung: string };
  idx: number;
  updSpalte: (idx: number, key: string, val: any) => void;
  removeSpalte: (idx: number) => void;
  moveSpalte: (idx: number, dir: -1 | 1) => void;
  total: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `spalte-${idx}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    background: isDragging ? "var(--accent)" : undefined,
  };
  return (
    <tr ref={setNodeRef} style={style} className={idx % 2 ? "bg-muted/20" : ""} data-testid={`row-spalte-${idx}`}>
      <td className="px-2 py-1 border-b border-border/50 text-muted-foreground cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-3 w-3" />
      </td>
      <td className="px-2 py-1 border-b border-border/50">
        <Input className="h-6 text-xs border-0 bg-transparent p-0" value={spalte.name} onChange={e => updSpalte(idx, "name", e.target.value)} data-testid={`input-col-name-${idx}`} />
      </td>
      <td className="px-2 py-1 border-b border-border/50">
        <Input className="h-6 text-xs border-0 bg-transparent p-0 text-right w-16 ml-auto" type="number" value={spalte.breite} onChange={e => updSpalte(idx, "breite", +e.target.value)} data-testid={`input-col-width-${idx}`} />
      </td>
      <td className="px-2 py-1 border-b border-border/50">
        <Select value={spalte.ausrichtung} onValueChange={v => updSpalte(idx, "ausrichtung", v)}>
          <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 shadow-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="links">links</SelectItem>
            <SelectItem value="rechts">rechts</SelectItem>
            <SelectItem value="zentriert">zentriert</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1 border-b border-border/50">
        <div className="flex gap-0.5 justify-end">
          <button className="p-0.5 hover:text-foreground text-muted-foreground" onClick={() => moveSpalte(idx, -1)} disabled={idx === 0} data-testid={`button-col-up-${idx}`}><ChevronUp className="h-3 w-3" /></button>
          <button className="p-0.5 hover:text-foreground text-muted-foreground" onClick={() => moveSpalte(idx, 1)} disabled={idx === total - 1} data-testid={`button-col-down-${idx}`}><ChevronDown className="h-3 w-3" /></button>
          <button className="p-0.5 hover:text-destructive text-muted-foreground" onClick={() => removeSpalte(idx)} data-testid={`button-col-delete-${idx}`}><X className="h-3 w-3" /></button>
        </div>
      </td>
    </tr>
  );
}

const PREVIEW_SAMPLE_DATA: Record<string, string[]> = {
  "Pos": ["1", "2", "3"],
  "Menge": ["12,00", "4,00", "3,50"],
  "ME": ["m", "Stk", "Std"],
  "Bezeichnung": ["Kupferrohr 15mm Installation", "Fitting T-Stück 15mm", "Monteurstunde"],
  "E-Preis": ["6,90", "3,70", "58,50"],
  "G-Preis": ["82,80", "14,80", "204,75"],
  "Einheit": ["m", "Stk", "Std"],
  "EP": ["6,90", "3,70", "58,50"],
  "GP": ["82,80", "14,80", "204,75"],
  "Einzelpreis": ["6,90", "3,70", "58,50"],
  "Gesamtpreis": ["82,80", "14,80", "204,75"],
  "Rabatt": ["0,00", "5,00", "0,00"],
  "MwSt": ["19%", "19%", "19%"],
  "Nummer": ["1", "2", "3"],
  "Nr.": ["1", "2", "3"],
  "Pos.": ["1", "2", "3"],
  "Beschreibung": ["Rohinstallation Heizung", "Sanitäranschluss Bad", "Wartungsarbeiten"],
  "Text": ["Lieferung und Montage", "inkl. Kleinteile", "nach Aufwand"],
};

function getPreviewCellData(spaltenName: string, rowIdx: number): string {
  const key = Object.keys(PREVIEW_SAMPLE_DATA).find(k => k.toLowerCase() === spaltenName.toLowerCase());
  if (key) return PREVIEW_SAMPLE_DATA[key][rowIdx] || "";
  return `[${spaltenName}]`;
}

function EndsummePreview({ endsumme }: { endsumme?: EndsummeConfig }) {
  const cfg = { ...DEFAULT_ENDSUMME, ...endsumme };
  const font = parseFontSpec(cfg.schriftart);
  const fontGesamt = parseFontSpec(cfg.schriftartGesamt);
  const mwstLabel = (cfg.labelMwst || "").replace("{satz}", "19,00");

  return (
    <div>
      <span className="text-xs font-semibold mb-2 block">Vorschau Endsumme</span>
      <div className="border rounded-lg overflow-hidden p-3" data-testid="preview-endsumme">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr style={{ borderTop: `${cfg.linienBreite}pt solid #333` }}>
              <td style={{ padding: `${cfg.abstandZeilen}px 4px`, fontFamily: font.fontFamily, fontSize: `${font.fontSize}pt`, fontWeight: font.fontWeight === "bold" ? 700 : 400 }}>
                {cfg.labelNetto}
              </td>
              <td style={{ padding: `${cfg.abstandZeilen}px 4px`, textAlign: "right", fontFamily: font.fontFamily, fontSize: `${font.fontSize}pt`, fontWeight: font.fontWeight === "bold" ? 700 : 400 }}>
                1.385,71 €
              </td>
            </tr>
            <tr>
              <td style={{ padding: `${cfg.abstandZeilen}px 4px`, fontFamily: font.fontFamily, fontSize: `${font.fontSize}pt`, fontWeight: font.fontWeight === "bold" ? 700 : 400 }}>
                {mwstLabel}
              </td>
              <td style={{ padding: `${cfg.abstandZeilen}px 4px`, textAlign: "right", fontFamily: font.fontFamily, fontSize: `${font.fontSize}pt`, fontWeight: font.fontWeight === "bold" ? 700 : 400 }}>
                263,28 €
              </td>
            </tr>
            <tr style={{ borderTop: `${cfg.linienBreiteGesamt}pt solid #333` }}>
              <td style={{ padding: `${cfg.abstandZeilen}px 4px`, fontFamily: fontGesamt.fontFamily, fontSize: `${fontGesamt.fontSize}pt`, fontWeight: fontGesamt.fontWeight === "bold" ? 700 : 400 }}>
                {cfg.labelGesamt}
              </td>
              <td style={{ padding: `${cfg.abstandZeilen}px 4px`, textAlign: "right", fontFamily: fontGesamt.fontFamily, fontSize: `${fontGesamt.fontSize}pt`, fontWeight: fontGesamt.fontWeight === "bold" ? 700 : 400 }}>
                1.648,99 €
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PositionTablePreview({ workArea }: { workArea: WorkAreaConfig }) {
  const totalBreite = workArea.spalten.reduce((s, c) => s + c.breite, 0);
  const headerFont = parseFontSpec(workArea.tabellenkopf.schriftart);
  const bodyFont = parseFontSpec(workArea.schriftart);

  return (
    <div>
      <span className="text-xs font-semibold mb-2 block">Vorschau Positionstabelle</span>
      <div className="border rounded-lg overflow-hidden" data-testid="preview-position-table">
        <table className="w-full table-fixed" style={{ borderCollapse: "collapse" }}>
          <colgroup>
            {workArea.spalten.map((s, i) => (
              <col key={i} style={{ width: `${(s.breite / totalBreite) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{
              background: workArea.tabellenkopf.hintergrund,
              borderBottom: workArea.tabellenkopf.rahmen ? `${workArea.tabellenkopf.linienBreite ?? workArea.linienBreite}pt solid #999` : "none",
            }}>
              {workArea.spalten.map((s, i) => (
                <th key={i} style={{
                  textAlign: s.ausrichtung === "rechts" ? "right" : s.ausrichtung === "zentriert" ? "center" : "left",
                  padding: "4px 6px",
                  fontFamily: headerFont.fontFamily,
                  fontSize: `${headerFont.fontSize}pt`,
                  fontWeight: headerFont.fontWeight === "bold" ? 700 : 600,
                  borderRight: workArea.tabellenkopf.rahmen && i < workArea.spalten.length - 1 ? `${workArea.linienBreite}pt solid #ccc` : "none",
                }}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map(rowIdx => (
              <tr key={rowIdx} style={{
                borderBottom: `${workArea.linienBreite}pt solid #e5e5e5`,
              }}>
                {workArea.spalten.map((s, ci) => (
                  <td key={ci} style={{
                    textAlign: s.ausrichtung === "rechts" ? "right" : s.ausrichtung === "zentriert" ? "center" : "left",
                    padding: `${workArea.zeilenAbstand}px 6px`,
                    fontFamily: bodyFont.fontFamily,
                    fontSize: `${bodyFont.fontSize}pt`,
                    fontWeight: bodyFont.fontWeight === "bold" ? 700 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {getPreviewCellData(s.name, rowIdx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkAreaEditor({ workArea, onChange }: { workArea: WorkAreaConfig; onChange: (wa: WorkAreaConfig) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const updSpalte = (idx: number, key: string, val: any) => {
    const newSpalten = [...workArea.spalten];
    newSpalten[idx] = { ...newSpalten[idx], [key]: val };
    onChange({ ...workArea, spalten: newSpalten });
  };
  const addSpalte = () => onChange({ ...workArea, spalten: [...workArea.spalten, { name: "Neu", breite: 60, ausrichtung: "links" }] });
  const removeSpalte = (idx: number) => onChange({ ...workArea, spalten: workArea.spalten.filter((_, i) => i !== idx) });
  const moveSpalte = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= workArea.spalten.length) return;
    const newSpalten = [...workArea.spalten];
    [newSpalten[idx], newSpalten[newIdx]] = [newSpalten[newIdx], newSpalten[idx]];
    onChange({ ...workArea, spalten: newSpalten });
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = workArea.spalten.findIndex((_, i) => `spalte-${i}` === active.id);
    const newIndex = workArea.spalten.findIndex((_, i) => `spalte-${i}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({ ...workArea, spalten: arrayMove(workArea.spalten, oldIndex, newIndex) });
  };
  const spaltenIds = useMemoReact(() => workArea.spalten.map((_, i) => `spalte-${i}`), [workArea.spalten.length]);

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-4">
        <h3 className="text-sm font-bold">Arbeitsbereich — Positionstabelle</h3>
        <div className="grid grid-cols-2 gap-3">
          <FontPicker value={workArea.schriftart} onChange={v => onChange({ ...workArea, schriftart: v })} label="Positionstext" testId="input-wa-font" />
          <FontPicker value={workArea.schriftartTitel || workArea.schriftart.replace(/(\d+pt)/, "Bold $1")} onChange={v => onChange({ ...workArea, schriftartTitel: v })} label="Titel / Gruppe" testId="input-wa-font-titel" />
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-3">
          <div />
          <div>
            <Label className="text-xs">Zeilenabstand (pt)</Label>
            <Input className="h-8 text-xs w-20" type="number" step="0.5" value={workArea.zeilenAbstand} onChange={e => onChange({ ...workArea, zeilenAbstand: +e.target.value })} data-testid="input-wa-linespacing" />
          </div>
          <div>
            <Label className="text-xs">Linienbreite (pt)</Label>
            <Input className="h-8 text-xs w-20" type="number" step="0.1" value={workArea.linienBreite} onChange={e => onChange({ ...workArea, linienBreite: +e.target.value })} data-testid="input-wa-linewidth" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Spalten ({workArea.spalten.length})</span>
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addSpalte} data-testid="button-add-column">
              <Plus className="h-3 w-3 mr-1" />Spalte
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground w-8" />
                    <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Name</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Breite</th>
                    <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Ausrichtung</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <SortableContext items={spaltenIds} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {workArea.spalten.map((s, i) => (
                      <SortableSpaltenRow key={`spalte-${i}`} spalte={s} idx={i} updSpalte={updSpalte} removeSpalte={removeSpalte} moveSpalte={moveSpalte} total={workArea.spalten.length} />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </DndContext>
          </div>
        </div>

        <div>
          <span className="text-xs font-semibold">Tabellenkopf</span>
          <div className="grid grid-cols-3 gap-3 mt-1">
            <div>
              <Label className="text-[10px]">Hintergrund</Label>
              <div className="flex gap-1">
                <Input className="h-7 text-xs flex-1" value={workArea.tabellenkopf.hintergrund} onChange={e => onChange({ ...workArea, tabellenkopf: { ...workArea.tabellenkopf, hintergrund: e.target.value } })} />
                <Input type="color" className="h-7 w-8 p-0.5" value={workArea.tabellenkopf.hintergrund} onChange={e => onChange({ ...workArea, tabellenkopf: { ...workArea.tabellenkopf, hintergrund: e.target.value } })} />
              </div>
            </div>
            <FontPicker value={workArea.tabellenkopf.schriftart} onChange={v => onChange({ ...workArea, tabellenkopf: { ...workArea.tabellenkopf, schriftart: v } })} label="Schrift" testId="input-wa-header-font" />
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={workArea.tabellenkopf.rahmen} onCheckedChange={v => onChange({ ...workArea, tabellenkopf: { ...workArea.tabellenkopf, rahmen: v } })} />
                Rahmen
              </label>
              <div>
                <Label className="text-[10px]">Linie (pt)</Label>
                <Input className="h-7 text-xs w-16" type="number" step="0.1" value={workArea.tabellenkopf.linienBreite ?? workArea.linienBreite} onChange={e => onChange({ ...workArea, tabellenkopf: { ...workArea.tabellenkopf, linienBreite: +e.target.value } })} data-testid="input-wa-header-line" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold border-b pb-1">Endsumme</h3>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Schriften</span>
            <div className="grid grid-cols-2 gap-3">
              <FontPicker value={workArea.endsumme?.schriftart || DEFAULT_ENDSUMME.schriftart!} onChange={v => onChange({ ...workArea, endsumme: { ...workArea.endsumme, schriftart: v } })} label="Netto / MwSt" testId="input-endsumme-font" />
              <FontPicker value={workArea.endsumme?.schriftartGesamt || DEFAULT_ENDSUMME.schriftartGesamt!} onChange={v => onChange({ ...workArea, endsumme: { ...workArea.endsumme, schriftartGesamt: v } })} label="Gesamtsumme" testId="input-endsumme-font-gesamt" />
            </div>
            <FontPicker value={workArea.endsumme?.schriftartSkonto || workArea.endsumme?.schriftart || DEFAULT_ENDSUMME.schriftart!} onChange={v => onChange({ ...workArea, endsumme: { ...workArea.endsumme, schriftartSkonto: v } })} label="Skonto / Verrechnung" testId="input-endsumme-schriftart-skonto" />
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Linien & Abstände</span>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-[10px]">Linie oben (pt)</Label>
                <Input className="h-7 text-xs" type="number" step="0.1" value={workArea.endsumme?.linienBreite ?? DEFAULT_ENDSUMME.linienBreite} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, linienBreite: +e.target.value } })} data-testid="input-endsumme-line" />
              </div>
              <div>
                <Label className="text-[10px]">Linie Gesamt (pt)</Label>
                <Input className="h-7 text-xs" type="number" step="0.1" value={workArea.endsumme?.linienBreiteGesamt ?? DEFAULT_ENDSUMME.linienBreiteGesamt} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, linienBreiteGesamt: +e.target.value } })} data-testid="input-endsumme-line-gesamt" />
              </div>
              <div>
                <Label className="text-[10px]">Zeilenabstand (pt)</Label>
                <Input className="h-7 text-xs" type="number" step="0.5" value={workArea.endsumme?.abstandZeilen ?? DEFAULT_ENDSUMME.abstandZeilen} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, abstandZeilen: +e.target.value } })} data-testid="input-endsumme-spacing" />
              </div>
              <div>
                <Label className="text-[10px]">Unterstreichung</Label>
                <select
                  className="h-7 text-xs border rounded px-2 w-full bg-background"
                  value={workArea.endsumme?.gesamtUnterstreichung || "einfach"}
                  onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, gesamtUnterstreichung: e.target.value as "einfach" | "doppelt" } })}
                  data-testid="select-gesamt-unterstreichung"
                >
                  <option value="einfach">Einfach</option>
                  <option value="doppelt">Doppelt</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Beschriftungen — Endsumme</span>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px]">Netto</Label>
                <Input className="h-7 text-xs" value={workArea.endsumme?.labelNetto || DEFAULT_ENDSUMME.labelNetto} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, labelNetto: e.target.value } })} data-testid="input-endsumme-label-netto" />
              </div>
              <div>
                <Label className="text-[10px]">MwSt <span className="text-muted-foreground">({"{satz}"} = Satz)</span></Label>
                <Input className="h-7 text-xs" value={workArea.endsumme?.labelMwst || DEFAULT_ENDSUMME.labelMwst} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, labelMwst: e.target.value } })} data-testid="input-endsumme-label-mwst" />
              </div>
              <div>
                <Label className="text-[10px]">Gesamt</Label>
                <Input className="h-7 text-xs" value={workArea.endsumme?.labelGesamt || DEFAULT_ENDSUMME.labelGesamt} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, labelGesamt: e.target.value } })} data-testid="input-endsumme-label-gesamt" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Lohnanteil <span className="text-muted-foreground">({"{betrag}"} = Betrag)</span></Label>
              <Input className="h-7 text-xs" value={workArea.endsumme?.labelLohn || DEFAULT_ENDSUMME.labelLohn} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, labelLohn: e.target.value } })} data-testid="input-endsumme-label-lohn" />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Beschriftungen — Schlussrechnung</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px]">Gesamtrechnungsbetrag</Label>
                <Input className="h-7 text-xs" value={workArea.endsumme?.labelGesamtrechnungsbetrag || "Gesamtrechnungsbetrag"} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, labelGesamtrechnungsbetrag: e.target.value } })} data-testid="input-endsumme-label-gesamtrechnungsbetrag" />
              </div>
              <div>
                <Label className="text-[10px]">Summe Abschläge</Label>
                <Input className="h-7 text-xs" value={workArea.endsumme?.labelSummeAbschlaege || "Summe Abschläge/Teilrechnungen"} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, labelSummeAbschlaege: e.target.value } })} data-testid="input-endsumme-label-summe-abschlaege" />
              </div>
              <div>
                <Label className="text-[10px]">Restsumme</Label>
                <Input className="h-7 text-xs" value={workArea.endsumme?.labelRestsumme || "Restsumme"} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, labelRestsumme: e.target.value } })} data-testid="input-endsumme-label-restsumme" />
              </div>
              <div>
                <Label className="text-[10px]">Zahlbetrag</Label>
                <Input className="h-7 text-xs" value={workArea.endsumme?.labelZahlbetrag || "Zahlbetrag:"} onChange={e => onChange({ ...workArea, endsumme: { ...workArea.endsumme, labelZahlbetrag: e.target.value } })} data-testid="input-endsumme-label-zahlbetrag" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sichtbarkeit (Standard für neue Dokumente)</span>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Switch
                  checked={!(workArea.endsumme?.defaultHideNetto ?? false)}
                  onCheckedChange={v => onChange({ ...workArea, endsumme: { ...workArea.endsumme, defaultHideNetto: !v } })}
                  data-testid="switch-endsumme-netto"
                />
                <span>Netto</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Switch
                  checked={!(workArea.endsumme?.defaultHideMwst ?? false)}
                  onCheckedChange={v => onChange({ ...workArea, endsumme: { ...workArea.endsumme, defaultHideMwst: !v } })}
                  data-testid="switch-endsumme-mwst"
                />
                <span>MwSt</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Switch
                  checked={!(workArea.endsumme?.defaultHideGesamt ?? false)}
                  onCheckedChange={v => onChange({ ...workArea, endsumme: { ...workArea.endsumme, defaultHideGesamt: !v } })}
                  data-testid="switch-endsumme-gesamt"
                />
                <span>Gesamt</span>
              </label>
            </div>
          </div>
        </div>

        <EndsummePreview endsumme={workArea.endsumme} />

        <PositionTablePreview workArea={workArea} />
      </CardContent>
    </Card>
  );
}

function FormDesignerTab() {
  const { toast } = useToast();
  const { data: dbTemplates = [], isLoading } = useQuery<FormTemplateData[]>({ queryKey: ["/api/form-templates"] });
  const [selId, setSelId] = useState<number | null>(null);
  const [fields, setFields] = useState<FormField[]>(DEFAULT_FIELDS);
  const [fieldsPage2, setFieldsPage2] = useState<FormField[]>(DEFAULT_FIELDS_PAGE2);
  const [workArea, setWorkArea] = useState<WorkAreaConfig>(DEFAULT_WORKAREA);
  const [selFeld, setSelFeld] = useState<FormField | null>(null);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);
  const [editFieldOpen, setEditFieldOpen] = useState(false);
  const [ansicht, setAnsicht] = useState("design");
  const [zoom, setZoom] = useState(75);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<FormTemplateData | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragField, setDragField] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ mx: number; my: number; fx: number; fy: number } | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ mx: number; my: number; fw: number; fh: number } | null>(null);
  const [guidesH, setGuidesH] = useState<number[]>([]);
  const [guidesV, setGuidesV] = useState<number[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [activeSnaps, setActiveSnaps] = useState<{ h: number[]; v: number[] }>({ h: [], v: [] });
  const [draggingGuide, setDraggingGuide] = useState<{ axis: "h" | "v"; index: number; startPos: number; startMouse: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const scale = zoom / 100;
  const A4W = 595;
  const A4H = 842;
  const SNAP_THRESHOLD = 5;

  const selTemplate = dbTemplates.find(t => t.id === selId);

  useEffect(() => {
    if (selTemplate) {
      setFields(selTemplate.fields?.length ? selTemplate.fields : DEFAULT_FIELDS);
      setFieldsPage2(selTemplate.fieldsPage2?.length ? selTemplate.fieldsPage2 : DEFAULT_FIELDS_PAGE2);
      setWorkArea((selTemplate.workArea as WorkAreaConfig) || DEFAULT_WORKAREA);
      setDirty(false);
      setSelFeld(null);
    }
  }, [selId, selTemplate?.id]);

  const saveMutation = useMutation({
    mutationFn: async (overrides?: { id: number; data: Partial<FormTemplateData> }) => {
      if (overrides) {
        await apiRequest("PATCH", `/api/form-templates/${overrides.id}`, overrides.data);
      } else {
        if (!selId) return;
        await apiRequest("PATCH", `/api/form-templates/${selId}`, { fields, fieldsPage2, workArea });
      }
    },
    onSuccess: () => {
      toast({ title: "Formular gespeichert" });
      queryClient.invalidateQueries({ queryKey: ["/api/form-templates"] });
      setDirty(false);
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/form-templates/${id}`); },
    onSuccess: () => {
      toast({ title: "Formular gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/form-templates"] });
      setSelId(null);
      setDeleteId(null);
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!selTemplate) return;
      await apiRequest("POST", "/api/form-templates", {
        name: selTemplate.name + " (Kopie)", type: normalizeFormTemplateType(selTemplate.type), description: selTemplate.description || "",
        status: "aktiv", printer: selTemplate.printer || "", fields, fieldsPage2, workArea,
      });
    },
    onSuccess: () => {
      toast({ title: "Formular dupliziert" });
      queryClient.invalidateQueries({ queryKey: ["/api/form-templates"] });
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const isPage2 = ansicht === "folgeblaetter";
  const activeFields = isPage2 ? fieldsPage2 : fields;
  const setActiveFields = isPage2 ? setFieldsPage2 : setFields;

  const updateField = (updated: FormField) => {
    setActiveFields(prev => prev.map(f => f.id === (selFeld?.id || updated.id) ? updated : f));
    setSelFeld(updated);
    setDirty(true);
  };

  const addField = (typ: string = "Text") => {
    const newId = `feld_${Date.now()}`;
    const newField: FormField = {
      id: newId, x: 50, y: 50, w: typ === "Bild" ? 150 : 100, h: typ === "Bild" ? 50 : 20,
      typ, inhalt: typ === "Bild" ? "[Bild]" : typ === "Variabel" ? "[Variable]" : "Neuer Text",
      aktiv: true, drucken: true,
    };
    setActiveFields(prev => [...prev, newField]);
    setSelFeld(newField);
    setDirty(true);
    if (typ === "Bild") setEditFieldOpen(true);
  };

  const removeField = (id: string) => {
    setActiveFields(prev => prev.filter(f => f.id !== id));
    if (selFeld?.id === id) setSelFeld(null);
    setDirty(true);
  };

  const copyFieldToOtherPage = (field: FormField) => {
    const targetFields = isPage2 ? fields : fieldsPage2;
    const setTarget = isPage2 ? setFields : setFieldsPage2;
    const existing = targetFields.find(f => f.id === field.id);
    if (existing) {
      setTarget(prev => prev.map(f => f.id === field.id ? { ...field } : f));
    } else {
      setTarget(prev => [...prev, { ...field }]);
    }
    setDirty(true);
    toast({ title: `"${field.id}" auf ${isPage2 ? "Erstes Blatt" : "Folgeseite"} kopiert` });
  };

  const copyAllFieldsToOtherPage = () => {
    const setTarget = isPage2 ? setFields : setFieldsPage2;
    const targetFields = isPage2 ? fields : fieldsPage2;
    const merged = [...targetFields];
    for (const field of activeFields) {
      const idx = merged.findIndex(f => f.id === field.id);
      if (idx >= 0) {
        merged[idx] = { ...field };
      } else {
        merged.push({ ...field });
      }
    }
    setTarget(merged);
    setDirty(true);
    toast({ title: `${activeFields.length} Felder auf ${isPage2 ? "Erstes Blatt" : "Folgeseite"} kopiert` });
  };

  const snapToGuides = useCallback((fieldId: string, edges: { left: number; right: number; top: number; bottom: number }) => {
    let snapX: number | null = null;
    let snapY: number | null = null;
    const snappedH: number[] = [];
    const snappedV: number[] = [];

    if (!snapEnabled) return { snapX, snapY, snappedH, snappedV };

    const allSnapPointsH = [...guidesH];
    const allSnapPointsV = [...guidesV];
    activeFields.forEach(f => {
      if (f.id === fieldId) return;
      allSnapPointsV.push(f.x, f.x + f.w);
      allSnapPointsH.push(f.y, f.y + f.h);
    });

    for (const gv of allSnapPointsV) {
      if (Math.abs(edges.left - gv) <= SNAP_THRESHOLD) { snapX = gv; snappedV.push(gv); break; }
      if (Math.abs(edges.right - gv) <= SNAP_THRESHOLD) { snapX = gv - (edges.right - edges.left); snappedV.push(gv); break; }
    }
    for (const gh of allSnapPointsH) {
      if (Math.abs(edges.top - gh) <= SNAP_THRESHOLD) { snapY = gh; snappedH.push(gh); break; }
      if (Math.abs(edges.bottom - gh) <= SNAP_THRESHOLD) { snapY = gh - (edges.bottom - edges.top); snappedH.push(gh); break; }
    }

    return { snapX, snapY, snappedH, snappedV };
  }, [snapEnabled, guidesH, guidesV, activeFields, SNAP_THRESHOLD]);

  const snapResizeToGuides = useCallback((fieldId: string, x: number, y: number, w: number, h: number) => {
    let snappedW = w;
    let snappedH2 = h;
    const snappedHLines: number[] = [];
    const snappedVLines: number[] = [];

    if (!snapEnabled) return { snappedW, snappedH: snappedH2, snappedHLines, snappedVLines };

    const rightEdge = x + w;
    const bottomEdge = y + h;
    const allV = [...guidesV];
    const allH = [...guidesH];
    activeFields.forEach(f => {
      if (f.id === fieldId) return;
      allV.push(f.x, f.x + f.w);
      allH.push(f.y, f.y + f.h);
    });

    for (const gv of allV) {
      if (Math.abs(rightEdge - gv) <= SNAP_THRESHOLD) { snappedW = gv - x; snappedVLines.push(gv); break; }
    }
    for (const gh of allH) {
      if (Math.abs(bottomEdge - gh) <= SNAP_THRESHOLD) { snappedH2 = gh - y; snappedHLines.push(gh); break; }
    }

    return { snappedW, snappedH: snappedH2, snappedHLines, snappedVLines };
  }, [snapEnabled, guidesH, guidesV, activeFields, SNAP_THRESHOLD]);

  const handleCanvasMouseDown = useCallback((fieldId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const field = activeFields.find(f => f.id === fieldId);
    if (!field) return;
    setSelFeld(field);
    setDragField(fieldId);
    setDragStart({ mx: e.clientX, my: e.clientY, fx: field.x, fy: field.y });
  }, [activeFields]);

  const handleResizeMouseDown = useCallback((fieldId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const field = activeFields.find(f => f.id === fieldId);
    if (!field) return;
    setSelFeld(field);
    setResizing(fieldId);
    setResizeStart({ mx: e.clientX, my: e.clientY, fw: field.w, fh: field.h });
  }, [activeFields]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingGuide) {
      const delta = (draggingGuide.axis === "h")
        ? (e.clientY - draggingGuide.startMouse) / scale
        : (e.clientX - draggingGuide.startMouse) / scale;
      const newPos = Math.max(0, Math.min(draggingGuide.axis === "h" ? A4H : A4W, Math.round(draggingGuide.startPos + delta)));
      if (draggingGuide.axis === "h") {
        setGuidesH(prev => prev.map((g, i) => i === draggingGuide.index ? newPos : g));
      } else {
        setGuidesV(prev => prev.map((g, i) => i === draggingGuide.index ? newPos : g));
      }
      return;
    }
    if (dragField && dragStart) {
      const dx = (e.clientX - dragStart.mx) / scale;
      const dy = (e.clientY - dragStart.my) / scale;
      let newX = Math.max(0, Math.min(A4W - 20, Math.round(dragStart.fx + dx)));
      let newY = Math.max(0, Math.min(A4H - 20, Math.round(dragStart.fy + dy)));
      const field = activeFields.find(f => f.id === dragField);
      if (field) {
        const { snapX, snapY, snappedH: sH, snappedV: sV } = snapToGuides(dragField, {
          left: newX, right: newX + field.w, top: newY, bottom: newY + field.h,
        });
        if (snapX !== null) newX = snapX;
        if (snapY !== null) newY = snapY;
        setActiveSnaps({ h: sH, v: sV });
      }
      setActiveFields(prev => prev.map(f => f.id === dragField ? { ...f, x: newX, y: newY } : f));
    }
    if (resizing && resizeStart) {
      const dx = (e.clientX - resizeStart.mx) / scale;
      const dy = (e.clientY - resizeStart.my) / scale;
      let newW = Math.max(20, Math.round(resizeStart.fw + dx));
      let newH = Math.max(10, Math.round(resizeStart.fh + dy));
      const field = activeFields.find(f => f.id === resizing);
      if (field) {
        const { snappedW, snappedH: sH2, snappedHLines, snappedVLines } = snapResizeToGuides(resizing, field.x, field.y, newW, newH);
        newW = snappedW;
        newH = sH2;
        setActiveSnaps({ h: snappedHLines, v: snappedVLines });
      }
      setActiveFields(prev => prev.map(f => f.id === resizing ? { ...f, w: newW, h: newH } : f));
    }
  }, [dragField, dragStart, resizing, resizeStart, scale, setActiveFields, snapToGuides, snapResizeToGuides, draggingGuide]);

  const handleCanvasMouseUp = useCallback(() => {
    if (draggingGuide) {
      setDraggingGuide(null);
      return;
    }
    setActiveSnaps({ h: [], v: [] });
    if (dragField) {
      setDirty(true);
      const updated = activeFields.find(f => f.id === dragField);
      if (updated) setSelFeld(updated);
      setDragField(null);
      setDragStart(null);
    }
    if (resizing) {
      setDirty(true);
      const updated = activeFields.find(f => f.id === resizing);
      if (updated) setSelFeld(updated);
      setResizing(null);
      setResizeStart(null);
    }
  }, [dragField, resizing, activeFields, draggingGuide]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selFeld) return;
      if (editFieldOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setDeleteFieldId(selFeld.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selFeld, editFieldOpen]);

  const handleExportTemplate = useCallback(() => {
    if (!selTemplate) return;
    const exportData = {
      _exportVersion: 1,
      _exportDate: new Date().toISOString(),
      name: selTemplate.name,
      type: normalizeFormTemplateType(selTemplate.type),
      description: selTemplate.description,
      status: selTemplate.status,
      printer: selTemplate.printer,
      fields: selTemplate.fields,
      fieldsPage2: selTemplate.fieldsPage2,
      workArea: selTemplate.workArea,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `formular-${selTemplate.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Formular exportiert", description: `"${selTemplate.name}" als JSON heruntergeladen.` });
  }, [selTemplate, toast]);

  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportTemplate = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.name || !data.fields) {
          toast({ title: "Fehler", description: "Ungueltige Formular-Datei: Name oder Felder fehlen.", variant: "destructive" });
          return;
        }
        const importPayload = {
          name: `${data.name} (Import)`,
          type: normalizeFormTemplateType(data.type),
          description: data.description || "",
          status: data.status || "aktiv",
          printer: data.printer || null,
          fields: data.fields || [],
          fieldsPage2: data.fieldsPage2 || [],
          workArea: data.workArea || null,
        };
        const res = await apiRequest("POST", "/api/form-templates", importPayload);
        const created = await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/form-templates"] });
        setSelId(created.id);
        toast({ title: "Formular importiert", description: `"${importPayload.name}" erfolgreich importiert.` });
      } catch (err: any) {
        toast({ title: "Import fehlgeschlagen", description: err.message || "Datei konnte nicht gelesen werden.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [toast]);

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-3">
      <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImportTemplate} data-testid="input-import-form" />
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={selId ? String(selId) : "none"} onValueChange={v => { if (v === "none") setSelId(null); else setSelId(+v); }}>
          <SelectTrigger className="w-[280px] h-8 text-xs" data-testid="select-form-template">
            <SelectValue placeholder="Formular wählen..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">-- Formular wählen --</SelectItem>
            {dbTemplates.map(f => (
              <SelectItem key={f.id} value={String(f.id)}>
                <span className="font-medium">{f.name}</span>
                <span className="text-muted-foreground ml-2">— {getFormTemplateTypeLabel(f.type)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selTemplate && (
          <Badge variant={selTemplate.status === "aktiv" ? "default" : "secondary"} className="text-[10px]">
            {selTemplate.status}
          </Badge>
        )}
        {selTemplate?.description && <span className="text-xs text-muted-foreground">{selTemplate.description}</span>}

        <div className="flex-1" />

        {selId && dirty && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => saveMutation.mutate(undefined)} disabled={saveMutation.isPending} data-testid="button-save-form">
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Speichern
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditTemplate(undefined); setTemplateDialogOpen(true); }} data-testid="button-new-form">
          <Plus className="h-3 w-3" />Neues Formular
        </Button>
        {selId && (
          <>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditTemplate(selTemplate); setTemplateDialogOpen(true); }} data-testid="button-edit-form-props">
              <Pencil className="h-3 w-3" />Eigenschaften
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending} data-testid="button-duplicate-form">
              <Copy className="h-3 w-3" />Duplizieren
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleExportTemplate} data-testid="button-export-form">
              <Download className="h-3 w-3" />Export
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => setDeleteId(selId)} data-testid="button-delete-form">
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => importFileRef.current?.click()} data-testid="button-import-form">
          <Upload className="h-3 w-3" />Import
        </Button>
      </div>

      {!selId ? (
        <Card className="shadow-sm">
          <CardContent className="p-12 text-center text-muted-foreground space-y-2">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-medium">Kein Formular ausgewählt</p>
            <p className="text-xs">Wählen Sie oben ein Formular aus oder erstellen Sie ein neues.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { setEditTemplate(undefined); setTemplateDialogOpen(true); }} data-testid="button-new-form-empty">
              <Plus className="h-3 w-3 mr-1" />Neues Formular erstellen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-0.5 border-b">
            {[
              { id: "design", l: "Erstes Blatt" },
              { id: "folgeblaetter", l: "Folgeblätter" },
              { id: "arbeitsbereich", l: "Arbeitsbereich" },
              { id: "drucker", l: "Druckereinstellung" },
            ].map(t => (
              <button key={t.id} onClick={() => { setAnsicht(t.id); setSelFeld(null); }}
                className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors ${ansicht === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid={`tab-form-${t.id}`}>
                {t.l}
              </button>
            ))}
          </div>

          {(ansicht === "design" || ansicht === "folgeblaetter") && (
            <div className="flex gap-3">
              <div className="flex-1 overflow-auto bg-muted/50 rounded-lg p-5 flex justify-center"
                onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}>
                <div className="relative shrink-0" style={{ paddingLeft: 20, paddingTop: 20 }}>
                  <div
                    className="absolute left-0 top-[20px] bg-gray-100 dark:bg-gray-800 border-r border-b border-gray-300 dark:border-gray-600 select-none"
                    style={{ width: 20, height: A4H * scale, cursor: "crosshair" }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = Math.round((e.clientY - rect.top) / scale);
                      if (y >= 0 && y <= A4H) setGuidesH(prev => [...prev, y]);
                    }}
                    data-testid="ruler-left"
                  >
                    {[0, 100, 200, 300, 400, 500, 600, 700, 800].filter(v => v <= A4H).map(v => (
                      <div key={v} className="absolute text-[7px] text-gray-400 select-none" style={{ top: v * scale - 4, left: 2, lineHeight: 1 }}>{v}</div>
                    ))}
                  </div>
                  <div
                    className="absolute top-0 left-[20px] bg-gray-100 dark:bg-gray-800 border-b border-r border-gray-300 dark:border-gray-600 select-none"
                    style={{ height: 20, width: A4W * scale, cursor: "crosshair" }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = Math.round((e.clientX - rect.left) / scale);
                      if (x >= 0 && x <= A4W) setGuidesV(prev => [...prev, x]);
                    }}
                    data-testid="ruler-top"
                  >
                    {[0, 60, 100, 200, 300, 400, 500].filter(v => v <= A4W).map(v => (
                      <div key={v} className="absolute text-[7px] text-gray-400 select-none" style={{ left: v * scale - 4, top: 4, lineHeight: 1 }}>{v}</div>
                    ))}
                  </div>
                  <div className="absolute top-0 left-0 w-[20px] h-[20px] bg-gray-200 dark:bg-gray-700 border-b border-r border-gray-300 dark:border-gray-600" />
                <div style={{ width: A4W * scale, height: A4H * scale, position: "relative" }}>
                <div className="bg-white shadow-lg rounded-sm overflow-hidden" ref={canvasRef}
                  style={{ width: A4W, height: A4H, transform: `scale(${scale})`, transformOrigin: "top left", cursor: dragField ? "grabbing" : resizing ? "nwse-resize" : draggingGuide ? (draggingGuide.axis === "h" ? "ns-resize" : "ew-resize") : "default", position: "absolute", top: 0, left: 0 }}
                  data-testid="canvas-a4-preview">
                  <div className="absolute border border-dashed border-gray-200"
                    style={{ top: 15, left: 15, right: 15, bottom: 15 }} />
                  {showGuides && guidesH.map((g, i) => (
                    <div
                      key={`gh-${i}`}
                      className="absolute left-0 right-0 z-30"
                      style={{ top: g - 1, height: 3, cursor: "ns-resize", borderTop: "1px dashed #ef4444" }}
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingGuide({ axis: "h", index: i, startPos: g, startMouse: e.clientY }); }}
                      onDoubleClick={(e) => { e.stopPropagation(); setGuidesH(prev => prev.filter((_, idx) => idx !== i)); }}
                      data-testid={`guide-h-${i}`}
                    >
                      <span className="absolute -left-0 -top-3 text-[7px] text-red-500 bg-white/80 px-0.5 rounded pointer-events-none">{g}</span>
                    </div>
                  ))}
                  {showGuides && guidesV.map((g, i) => (
                    <div
                      key={`gv-${i}`}
                      className="absolute top-0 bottom-0 z-30"
                      style={{ left: g - 1, width: 3, cursor: "ew-resize", borderLeft: "1px dashed #ef4444" }}
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingGuide({ axis: "v", index: i, startPos: g, startMouse: e.clientX }); }}
                      onDoubleClick={(e) => { e.stopPropagation(); setGuidesV(prev => prev.filter((_, idx) => idx !== i)); }}
                      data-testid={`guide-v-${i}`}
                    >
                      <span className="absolute -top-0 -left-1 text-[7px] text-red-500 bg-white/80 px-0.5 rounded pointer-events-none rotate-90 origin-top-left translate-x-3">{g}</span>
                    </div>
                  ))}
                  {(dragField || resizing) && activeSnaps.h.map((g, i) => (
                    <div key={`sh-${i}`} className="absolute left-0 right-0 z-40 pointer-events-none" style={{ top: g, borderTop: "1px solid #22c55e" }} />
                  ))}
                  {(dragField || resizing) && activeSnaps.v.map((g, i) => (
                    <div key={`sv-${i}`} className="absolute top-0 bottom-0 z-40 pointer-events-none" style={{ left: g, borderLeft: "1px solid #22c55e" }} />
                  ))}
                  {activeFields.map(f => {
                    const borderColor = typBorderColors[f.typ] || "#718096";
                    const isSelected = selFeld?.id === f.id;
                    const parsed = parseFontSpec(f.font);
                    return (
                      <div key={f.id}
                        onMouseDown={(e) => handleCanvasMouseDown(f.id, e)}
                        onDoubleClick={() => { setSelFeld(f); setEditFieldOpen(true); }}
                        className={`absolute overflow-hidden select-none ${!f.aktiv ? "opacity-30" : ""}`}
                        style={{
                          left: f.x, top: f.y, width: f.w, height: f.h,
                          border: `${isSelected ? 2 : 1}px ${isSelected ? "solid" : "dashed"} ${borderColor}`,
                          background: isSelected ? borderColor + "15" : f.typ === "Arbeitsbereich" ? "#E6FFFA10" : "transparent",
                          borderRadius: 2, padding: 2, fontSize: `${parsed.fontSize}px`,
                          fontFamily: parsed.fontFamily, fontWeight: parsed.fontWeight,
                          color: f.farbe || borderColor, textAlign: f.ausrichtung === "rechts" ? "right" : f.ausrichtung === "zentriert" ? "center" : "left",
                          lineHeight: 1.3, whiteSpace: "pre-wrap",
                          cursor: dragField === f.id ? "grabbing" : "grab",
                        }}
                        data-testid={`field-${f.id}`}>
                        {f.typ === "Bild" && f.imageUrl ? (
                          <img src={f.imageUrl} alt={f.id} className="w-full h-full object-contain" draggable={false} />
                        ) : f.typ === "Arbeitsbereich" ? (
                          <div className="w-full h-full" style={{ background: `repeating-linear-gradient(0deg,transparent,transparent 10px,#E2E8F020 10px,#E2E8F020 11px)` }}>
                            <div className="border-b" style={{ background: "#F0F0F0", padding: 2, fontSize: 7, fontWeight: 600 }}>
                              Pos. | Bezeichnung | Menge | EH | EP | GP
                            </div>
                          </div>
                        ) : f.inhalt}
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(f.id, e)}
                            className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
                            style={{ background: borderColor, borderRadius: "0 0 2px 0", opacity: 0.7 }}
                            data-testid={`resize-handle-${f.id}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
                </div>
              </div>

              <div className="w-[260px] shrink-0 space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ZoomIn className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Zoom</span>
                    <span className="text-xs text-muted-foreground ml-auto">{zoom}%</span>
                  </div>
                  <Slider value={[zoom]} onValueChange={v => setZoom(v[0])} min={40} max={120} step={5} className="w-full" data-testid="slider-zoom" />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Ruler className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Hilfslinien</span>
                    <span className="text-[9px] text-muted-foreground ml-auto">{guidesH.length + guidesV.length}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                      <Switch checked={showGuides} onCheckedChange={setShowGuides} className="scale-75" data-testid="switch-show-guides" />
                      Anzeigen
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                      <Switch checked={snapEnabled} onCheckedChange={setSnapEnabled} className="scale-75" data-testid="switch-snap" />
                      <Magnet className="h-3 w-3" />Fangen
                    </label>
                  </div>
                  {(guidesH.length > 0 || guidesV.length > 0) && (
                    <div className="border rounded-md p-1 max-h-[80px] overflow-y-auto space-y-0.5">
                      {guidesH.map((g, i) => (
                        <div key={`gh-${i}`} className="flex items-center justify-between text-[10px] px-1 hover:bg-accent rounded">
                          <span className="text-red-500">— H: {g} pt</span>
                          <button className="p-0.5 hover:text-destructive text-muted-foreground" onClick={() => setGuidesH(prev => prev.filter((_, idx) => idx !== i))} data-testid={`remove-guide-h-${i}`}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                      {guidesV.map((g, i) => (
                        <div key={`gv-${i}`} className="flex items-center justify-between text-[10px] px-1 hover:bg-accent rounded">
                          <span className="text-red-500">| V: {g} pt</span>
                          <button className="p-0.5 hover:text-destructive text-muted-foreground" onClick={() => setGuidesV(prev => prev.filter((_, idx) => idx !== i))} data-testid={`remove-guide-v-${i}`}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(guidesH.length > 0 || guidesV.length > 0) && (
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] w-full text-destructive" onClick={() => { setGuidesH([]); setGuidesV([]); }} data-testid="button-clear-guides">
                      Alle Hilfslinien entfernen
                    </Button>
                  )}
                  <p className="text-[9px] text-muted-foreground italic">
                    Klick auf Lineal = Hilfslinie setzen. Doppelklick auf Linie = entfernen. Ziehen = verschieben.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Felder ({activeFields.length})</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => addField("Text")} data-testid="button-add-field-text" title="Textfeld">
                        <Type className="h-2.5 w-2.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => addField("Variabel")} data-testid="button-add-field-var" title="Variable">
                        <Variable className="h-2.5 w-2.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => addField("Bild")} data-testid="button-add-field-image" title="Bild/Logo">
                        <Image className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                  {activeFields.length > 0 && (
                    <Button variant="outline" size="sm" className="h-5 text-[9px] w-full mb-1" onClick={copyAllFieldsToOtherPage} data-testid="button-copy-all-to-page">
                      <Copy className="h-2.5 w-2.5 mr-1" />
                      Alle auf {isPage2 ? "Erstes Blatt" : "Folgeseite"} kopieren
                    </Button>
                  )}
                  <div className="max-h-[220px] overflow-y-auto space-y-0.5 border rounded-md p-1">
                    {activeFields.map(f => {
                      const Icon = typIcons[f.typ] || Type;
                      return (
                        <div key={f.id} className={`flex items-center gap-1 rounded text-xs transition-colors ${selFeld?.id === f.id ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"}`}>
                          <button className="flex-1 text-left px-2 py-1 flex items-center gap-2" onClick={() => setSelFeld(f)} data-testid={`field-list-${f.id}`}>
                            <Icon className="h-3 w-3 shrink-0" style={{ color: typBorderColors[f.typ] }} />
                            <span className="flex-1 truncate">{f.id}</span>
                            <span className="text-[9px] text-muted-foreground">{f.typ}</span>
                          </button>
                          <button className="p-0.5 hover:text-primary text-muted-foreground shrink-0" onClick={(e) => { e.stopPropagation(); copyFieldToOtherPage(f); }} title={`Auf ${isPage2 ? "Erstes Blatt" : "Folgeseite"} kopieren`} data-testid={`button-copy-field-${f.id}`}>
                            <Copy className="h-3 w-3" />
                          </button>
                          <button className="p-0.5 hover:text-destructive text-muted-foreground shrink-0 mr-1" onClick={() => removeField(f.id)} data-testid={`button-remove-field-${f.id}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selFeld && (
                  <Card className="shadow-sm">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm flex-1 truncate">{selFeld.id}</span>
                        <Badge variant="outline" className={`text-[9px] ${typColors[selFeld.typ] || ""}`}>{selFeld.typ}</Badge>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditFieldOpen(true)} data-testid="button-edit-field">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyFieldToOtherPage(selFeld)} title={`Auf ${isPage2 ? "Erstes Blatt" : "Folgeseite"} kopieren`} data-testid="button-copy-selected-field">
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteFieldId(selFeld.id)} data-testid="button-delete-field">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {selFeld.typ === "Bild" && selFeld.imageUrl && (
                        <img src={selFeld.imageUrl} alt="Logo" className="w-full max-h-[50px] object-contain border rounded bg-white p-1" />
                      )}
                      {selFeld.typ === "Bild" && !selFeld.imageUrl && (
                        <ImageUploadButton onUploaded={(url) => {
                          const updated = { ...selFeld, imageUrl: url };
                          updateField(updated);
                        }} label="Logo hochladen" />
                      )}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[["X", selFeld.x + " pt"], ["Y", selFeld.y + " pt"], ["Breite", selFeld.w + " pt"], ["Höhe", selFeld.h + " pt"]].map(([l, v]) => (
                          <div key={l}>
                            <div className="text-[9px] font-semibold text-muted-foreground uppercase">{l}</div>
                            <div className="font-medium">{v}</div>
                          </div>
                        ))}
                      </div>
                      {selFeld.typ !== "Bild" && (
                        <div>
                          <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-0.5">Inhalt</div>
                          <div className="text-xs p-1.5 bg-muted/50 rounded whitespace-pre-wrap max-h-[60px] overflow-auto leading-relaxed">{selFeld.inhalt}</div>
                        </div>
                      )}
                      <div className="flex gap-4">
                        <span className={`text-[10px] ${selFeld.aktiv ? "text-green-600" : "text-muted-foreground"}`}>{selFeld.aktiv ? "\u2713 Aktiv" : "\u2717 Inaktiv"}</span>
                        <span className={`text-[10px] ${selFeld.drucken ? "text-blue-600" : "text-muted-foreground"}`}>{selFeld.drucken ? "\u2713 Drucken" : "\u2717 Nicht drucken"}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <p className="text-[9px] text-muted-foreground italic">
                  Felder per Drag & Drop verschieben. Doppelklick zum Bearbeiten. Ecke unten rechts zum Größe ändern. Entf-Taste oder Mülleimer-Icon zum Löschen.
                </p>
              </div>
            </div>
          )}

          {ansicht === "arbeitsbereich" && (
            <WorkAreaEditor workArea={workArea} onChange={(wa) => { setWorkArea(wa); setDirty(true); }} />
          )}

          {ansicht === "drucker" && selTemplate && (
            <PrinterSettingsEditor template={selTemplate} onSave={async (updates) => {
              await saveMutation.mutateAsync({ id: selTemplate.id, data: updates });
            }} />
          )}
        </>
      )}

      {editFieldOpen && selFeld && (
        <FieldEditDialog field={selFeld} open={editFieldOpen} onOpenChange={setEditFieldOpen} onSave={updateField} />
      )}

      {templateDialogOpen && (
        <FormTemplateDialog template={editTemplate} open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} onSaved={() => {}} />
      )}

      <AlertDialog open={deleteFieldId !== null} onOpenChange={(open) => !open && setDeleteFieldId(null)}>
        <AlertDialogContent data-testid="dialog-delete-form-field">
          <AlertDialogHeader>
            <AlertDialogTitle>Feld loeschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Feld "{deleteFieldId || ""}" wird aus dem Formular entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-form-field">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-form-field"
              onClick={() => {
                if (!deleteFieldId) return;
                removeField(deleteFieldId);
                setDeleteFieldId(null);
              }}
            >
              Loeschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Formular löschen?</AlertDialogTitle>
            <AlertDialogDescription>Dieses Formular wird unwiderruflich gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ListTemplateDialog({ template, open, onOpenChange, onSaved }: {
  template?: ListTemplateData;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!template;
  const [form, setForm] = useState({
    name: template?.name || "",
    baseTable: template?.baseTable || "Adressen",
    description: template?.description || "",
    status: template?.status || "aktiv",
  });
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...form,
        columns: template?.columns || [{ name: "Nr.", feld: "nr", breite: 60, sichtbar: true }, { name: "Bezeichnung", feld: "bezeichnung", breite: 200, sichtbar: true }],
        filters: template?.filters || [],
        sorting: template?.sorting || { field: "nr", direction: "ASC" },
      };
      if (isEdit) {
        await apiRequest("PATCH", `/api/list-templates/${template.id}`, payload);
      } else {
        await apiRequest("POST", "/api/list-templates", payload);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Liste aktualisiert" : "Liste erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/list-templates"] });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Liste bearbeiten" : "Neue Liste"}</DialogTitle>
          <DialogDescription>Listen-Eigenschaften festlegen</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-xs" value={form.name} onChange={e => upd("name", e.target.value)} placeholder="z.B. Kundenliste mit Umsatz" data-testid="input-list-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Basistabelle / Modul</Label>
              <Select value={form.baseTable} onValueChange={v => upd("baseTable", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-list-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIST_BASE_TABLES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => upd("status", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-list-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="inaktiv">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Textarea className="text-xs min-h-[50px]" value={form.description} onChange={e => upd("description", e.target.value)} data-testid="input-list-description" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name} data-testid="button-save-list-template">
              {mutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListDesignerTab() {
  const { toast } = useToast();
  const { data: dbLists = [], isLoading } = useQuery<ListTemplateData[]>({ queryKey: ["/api/list-templates"] });
  const [selId, setSelId] = useState<number | null>(null);
  const [columns, setColumns] = useState<ListColumn[]>([]);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState("ASC");
  const [filterExpr, setFilterExpr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ListTemplateData | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const selList = dbLists.find(l => l.id === selId);

  useEffect(() => {
    if (selList) {
      setColumns(selList.columns || []);
      const sorting = selList.sorting as any;
      setSortField(sorting?.field || "");
      setSortDir(sorting?.direction || "ASC");
      setFilterExpr(selList.filters?.[0]?.expression || "");
      setDirty(false);
    }
  }, [selId, selList?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selId) return;
      await apiRequest("PATCH", `/api/list-templates/${selId}`, {
        columns, sorting: { field: sortField, direction: sortDir },
        filters: filterExpr ? [{ expression: filterExpr }] : [],
      });
    },
    onSuccess: () => { toast({ title: "Liste gespeichert" }); queryClient.invalidateQueries({ queryKey: ["/api/list-templates"] }); setDirty(false); },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/list-templates/${id}`); },
    onSuccess: () => { toast({ title: "Liste gelöscht" }); queryClient.invalidateQueries({ queryKey: ["/api/list-templates"] }); setSelId(null); setDeleteId(null); },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!selList) return;
      await apiRequest("POST", "/api/list-templates", {
        name: selList.name + " (Kopie)", baseTable: selList.baseTable, description: selList.description || "",
        status: "aktiv", columns, sorting: { field: sortField, direction: sortDir },
        filters: filterExpr ? [{ expression: filterExpr }] : [],
      });
    },
    onSuccess: () => { toast({ title: "Liste dupliziert" }); queryClient.invalidateQueries({ queryKey: ["/api/list-templates"] }); },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const handleExportList = useCallback(() => {
    if (!selList) return;
    const exportData = {
      _exportVersion: 1,
      _exportDate: new Date().toISOString(),
      name: selList.name,
      baseTable: selList.baseTable,
      description: selList.description,
      status: selList.status,
      columns,
      filters: filterExpr ? [{ expression: filterExpr }] : (selList.filters || []),
      sorting: { field: sortField, direction: sortDir },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liste-${selList.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Liste exportiert", description: `"${selList.name}" als JSON heruntergeladen.` });
  }, [columns, filterExpr, selList, sortDir, sortField, toast]);

  const importListFileRef = useRef<HTMLInputElement>(null);

  const handleImportList = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.name || !data.baseTable || !Array.isArray(data.columns)) {
          toast({ title: "Fehler", description: "Ungueltige Listen-Datei: Name, Grundtabelle oder Spalten fehlen.", variant: "destructive" });
          return;
        }
        const importPayload = {
          name: `${data.name} (Import)`,
          baseTable: data.baseTable,
          description: data.description || "",
          status: data.status || "aktiv",
          columns: data.columns || [],
          filters: Array.isArray(data.filters) ? data.filters : [],
          sorting: data.sorting || { field: "", direction: "ASC" },
        };
        const res = await apiRequest("POST", "/api/list-templates", importPayload);
        const created = await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/list-templates"] });
        setSelId(created.id);
        toast({ title: "Liste importiert", description: `"${importPayload.name}" erfolgreich importiert.` });
      } catch (err: any) {
        toast({ title: "Import fehlgeschlagen", description: err.message || "Datei konnte nicht gelesen werden.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [toast]);

  const updCol = (idx: number, key: string, val: any) => { setColumns(prev => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c)); setDirty(true); };
  const addCol = () => { setColumns(prev => [...prev, { name: "Neu", feld: "neu", breite: 80, sichtbar: true }]); setDirty(true); };
  const removeCol = (idx: number) => { setColumns(prev => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const moveCol = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= columns.length) return;
    const newCols = [...columns];
    [newCols[idx], newCols[newIdx]] = [newCols[newIdx], newCols[idx]];
    setColumns(newCols); setDirty(true);
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-3">
      <input ref={importListFileRef} type="file" accept=".json" className="hidden" onChange={handleImportList} data-testid="input-import-list" />
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1" />
        {selId && dirty && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-list">
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Speichern
          </Button>
        )}
        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditTemplate(undefined); setTemplateDialogOpen(true); }} data-testid="button-new-list">
          <Plus className="h-3 w-3" />Neue Liste
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => importListFileRef.current?.click()} data-testid="button-import-list">
          <Upload className="h-3 w-3" />Import
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="w-[280px] shrink-0 space-y-1.5 max-h-[600px] overflow-y-auto">
          {dbLists.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8 border rounded-lg">
              <List className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              Keine Listen vorhanden
            </div>
          )}
          {dbLists.map(l => (
            <button key={l.id} onClick={() => setSelId(l.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${selId === l.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}
              data-testid={`list-item-${l.id}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-semibold text-xs">{l.name}</span>
                <Badge variant="outline" className={`text-[9px] ${l.status === "aktiv" ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400" : ""}`}>{l.status}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">{l.baseTable}</div>
              {l.description && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{l.description}</div>}
            </button>
          ))}
        </div>

        {selList ? (
          <div className="flex-1 border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <span className="text-sm font-bold">{selList.name}</span>
              <Badge variant="secondary" className="text-[10px]">{selList.baseTable}</Badge>
              <div className="flex-1" />
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => { setEditTemplate(selList); setTemplateDialogOpen(true); }} data-testid="button-edit-list-props">
                <Pencil className="h-3 w-3" />Eigenschaften
              </Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending} data-testid="button-duplicate-list">
                <Copy className="h-3 w-3" />Duplizieren
              </Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={handleExportList} data-testid="button-export-list">
                <Download className="h-3 w-3" />Export
              </Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 text-destructive" onClick={() => setDeleteId(selList.id)} data-testid="button-delete-list">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">Spalten ({columns.length})</span>
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addCol} data-testid="button-add-list-column">
                    <Plus className="h-3 w-3 mr-1" />Spalte
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="w-8" />
                        <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Spalte</th>
                        <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground font-mono">Feld</th>
                        <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Breite</th>
                        <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Sichtbar</th>
                        <th className="w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((s, i) => (
                        <tr key={i} className={`${i % 2 ? "bg-muted/20" : ""} ${!s.sichtbar ? "opacity-50" : ""}`}>
                          <td className="px-2 py-1 border-b border-border/50 text-muted-foreground"><GripVertical className="h-3 w-3" /></td>
                          <td className="px-2 py-1 border-b border-border/50">
                            <Input className="h-6 text-xs border-0 bg-transparent p-0" value={s.name} onChange={e => updCol(i, "name", e.target.value)} data-testid={`input-listcol-name-${i}`} />
                          </td>
                          <td className="px-2 py-1 border-b border-border/50">
                            <Input className="h-6 text-xs border-0 bg-transparent p-0 font-mono" value={s.feld} onChange={e => updCol(i, "feld", e.target.value)} data-testid={`input-listcol-field-${i}`} />
                          </td>
                          <td className="px-2 py-1 border-b border-border/50">
                            <Input className="h-6 text-xs border-0 bg-transparent p-0 text-right w-16 ml-auto" type="number" value={s.breite} onChange={e => updCol(i, "breite", +e.target.value)} data-testid={`input-listcol-width-${i}`} />
                          </td>
                          <td className="px-2 py-1 text-center border-b border-border/50">
                            <input type="checkbox" className="h-3 w-3" checked={s.sichtbar} onChange={e => updCol(i, "sichtbar", e.target.checked)} data-testid={`check-listcol-visible-${i}`} />
                          </td>
                          <td className="px-2 py-1 border-b border-border/50">
                            <div className="flex gap-0.5 justify-end">
                              <button className="p-0.5 hover:text-foreground text-muted-foreground" onClick={() => moveCol(i, -1)}><ChevronUp className="h-3 w-3" /></button>
                              <button className="p-0.5 hover:text-foreground text-muted-foreground" onClick={() => moveCol(i, 1)}><ChevronDown className="h-3 w-3" /></button>
                              <button className="p-0.5 hover:text-destructive text-muted-foreground" onClick={() => removeCol(i)}><X className="h-3 w-3" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <ArrowUpDown className="h-3 w-3" />Sortierung
                  </div>
                  <div className="flex gap-2">
                    <Input className="h-7 text-xs flex-1 font-mono" value={sortField} onChange={e => { setSortField(e.target.value); setDirty(true); }} placeholder="Feld" data-testid="input-sort-field" />
                    <Select value={sortDir} onValueChange={v => { setSortDir(v); setDirty(true); }}>
                      <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ASC">Aufsteigend</SelectItem>
                        <SelectItem value="DESC">Absteigend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <Filter className="h-3 w-3" />Filter / Auswahl
                  </div>
                  <Input className="h-7 text-xs font-mono" value={filterExpr} onChange={e => { setFilterExpr(e.target.value); setDirty(true); }} placeholder="z.B. status = 'aktiv'" data-testid="input-filter-expr" />
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold mb-2 block">Druckvorschau</span>
                <div className="border rounded-lg overflow-hidden p-3 bg-white dark:bg-gray-950">
                  <div className="text-center text-[10px] font-semibold text-muted-foreground mb-2">
                    FriStD-Bau ZuB GmbH & Co.KG — {selList.name} — {new Date().toLocaleDateString("de-DE")}
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted">
                        {columns.filter(s => s.sichtbar).map(s => (
                          <th key={s.name} className="text-left px-2 py-1 font-semibold text-[9px] border-b">{s.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[0, 1, 2].map(ri => (
                        <tr key={ri} className="border-b border-border/30">
                          {columns.filter(s => s.sichtbar).map((s, ci) => (
                            <td key={ci} className="px-2 py-1 text-muted-foreground italic">Beispieldaten...</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-right text-[9px] text-muted-foreground mt-1.5">Seite 1 von 1</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center border rounded-lg bg-background text-muted-foreground min-h-[300px] gap-2">
            <List className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm">Liste links auswählen oder neue erstellen</p>
          </div>
        )}
      </div>

      {templateDialogOpen && (
        <ListTemplateDialog template={editTemplate} open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} onSaved={() => {}} />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liste löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Liste wird unwiderruflich gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function DesignerPage() {
  const [activeTab, setActiveTab] = useState("formular");

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-3">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-page-title">Formular- & Listendesigner</h1>
        <p className="text-muted-foreground text-xs">Formulare für Druckausgabe und Listenvorlagen verwalten</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-designer">
          <TabsTrigger value="formular" data-testid="tab-formulardesigner" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Formulardesigner
          </TabsTrigger>
          <TabsTrigger value="listen" data-testid="tab-listendesigner" className="gap-1.5">
            <List className="h-3.5 w-3.5" />
            Listendesigner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="formular">
          <FormDesignerTab />
        </TabsContent>

        <TabsContent value="listen">
          <ListDesignerTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

