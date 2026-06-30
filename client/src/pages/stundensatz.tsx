import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { HourlyRateCalc, LaborRate } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Trash2, FolderOpen, Plus, Calculator, TrendingUp, Clock, BarChart3, ArrowRight, Download, CheckCircle2, HardHat, Wrench, CloudRain } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";

function deFormatNumber(val: number, decimals = 2): string {
  return val.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function deParseNumber(s: string): number {
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function DeNumberInput({ value, onChange, decimals = 2, className = "", disabled = false, "data-testid": testId }: {
  value: string; onChange: (val: string) => void; decimals?: number; className?: string; disabled?: boolean; "data-testid"?: string;
}) {
  const [display, setDisplay] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) {
      const num = parseFloat(value) || 0;
      setDisplay(deFormatNumber(num, decimals));
    }
  }, [value, focused, decimals]);

  const handleFocus = () => {
    setFocused(true);
    const num = parseFloat(value) || 0;
    setDisplay(num === 0 ? "" : deFormatNumber(num, decimals));
    setTimeout(() => ref.current?.select(), 0);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = deParseNumber(display);
    onChange(parsed.toFixed(decimals));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (/^[\d.,\-\s]*$/.test(v)) {
      setDisplay(v);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      className={`text-right ${className}`}
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      data-testid={testId}
    />
  );
}

interface FormState {
  name: string;
  bwaYear: string;
  personalkosten: string;
  raumkosten: string;
  fahrzeugkosten: string;
  versicherungen: string;
  abschreibungen: string;
  sonstigeKosten: string;
  betrieblicheSteuern: string;
  werbeReisekosten: string;
  reparaturInstandhaltung: string;
  kostenWarenabgabe: string;
  besondereKosten: string;
  produktivstunden: string;
  produktiveMitarbeiter: string;
  geplGewinn: string;
  geplUmsatz: string;
  materialAnteil: string;
  materialAufschlag: string;
  weeklyHours: string;
  socialCostsPercent: string;
  freeDays: string;
  freeDayHours: string;
  unproductivePercent: string;
  arbeitstageJahr: string;
  urlaubstage: string;
  feiertage: string;
  krankheitstage: string;
  fortbildungstage: string;
  fahrzeitStdTag: string;
  ruestzeitStdTag: string;
  materialLogistikStdTag: string;
  besprechungStdTag: string;
  wetterausfallTage: string;
  gewerkAuswahl: string;
}

const defaultForm: FormState = {
  name: "Neue Kalkulation",
  bwaYear: "2026",
  personalkosten: "288925.00",
  raumkosten: "20818.00",
  fahrzeugkosten: "20454.00",
  versicherungen: "7385.00",
  abschreibungen: "34516.00",
  sonstigeKosten: "79521.00",
  betrieblicheSteuern: "1434.00",
  werbeReisekosten: "3922.00",
  reparaturInstandhaltung: "3888.00",
  kostenWarenabgabe: "377.00",
  besondereKosten: "0.00",
  produktivstunden: "9000.00",
  produktiveMitarbeiter: "6",
  geplGewinn: "150000.00",
  geplUmsatz: "780000.00",
  materialAnteil: "33.00",
  materialAufschlag: "30.00",
  weeklyHours: "40.00",
  socialCostsPercent: "29.00",
  freeDays: "49",
  freeDayHours: "8.00",
  unproductivePercent: "15.00",
  arbeitstageJahr: "261",
  urlaubstage: "30",
  feiertage: "7",
  krankheitstage: "14.80",
  fortbildungstage: "3",
  fahrzeitStdTag: "0.45",
  ruestzeitStdTag: "0.20",
  materialLogistikStdTag: "0.15",
  besprechungStdTag: "0.10",
  wetterausfallTage: "5",
  gewerkAuswahl: "zimmerer",
};

const GEWERK_PRESETS: Record<string, { label: string; icon: typeof HardHat; wetterausfallTage: string; fahrzeitStdTag: string; ruestzeitStdTag: string; materialLogistikStdTag: string; besprechungStdTag: string; color: string }> = {
  shk: {
    label: "Heizung/Sanitär (SHK)",
    icon: Wrench,
    wetterausfallTage: "2",
    fahrzeitStdTag: "0.40",
    ruestzeitStdTag: "0.15",
    materialLogistikStdTag: "0.15",
    besprechungStdTag: "0.10",
    color: "bg-blue-500",
  },
  zimmerer: {
    label: "Zimmerer",
    icon: HardHat,
    wetterausfallTage: "5",
    fahrzeitStdTag: "0.45",
    ruestzeitStdTag: "0.20",
    materialLogistikStdTag: "0.15",
    besprechungStdTag: "0.10",
    color: "bg-amber-600",
  },
  dachdecker: {
    label: "Dachdecker",
    icon: CloudRain,
    wetterausfallTage: "12",
    fahrzeitStdTag: "0.45",
    ruestzeitStdTag: "0.25",
    materialLogistikStdTag: "0.15",
    besprechungStdTag: "0.10",
    color: "bg-slate-600",
  },
};

function p(v: string): number {
  return parseFloat(v) || 0;
}

interface BwaSummary {
  year: number;
  umsatz: number;
  materialkosten: number;
  personalkosten: number;
  raumkosten: number;
  fahrzeugkosten: number;
  versicherungen: number;
  abschreibungen: number;
  sonstigeKosten: number;
  betrieblicheSteuern: number;
  werbeReisekosten: number;
  reparaturInstandhaltung: number;
  kostenWarenabgabe: number;
  besondereKosten: number;
  gemeinkosten: number;
  gesamtkosten: number;
  betriebsergebnis: number;
}

interface ProduktivCalc {
  arbeitstageJahr: number;
  urlaubstage: number;
  feiertage: number;
  krankheitstage: number;
  fortbildungstage: number;
  moeglicheArbeitstage: number;
  stundenProTag: number;
  bruttoJahresstunden: number;
  verfuegbareStunden: number;
  fahrzeitStdTag: number;
  ruestzeitStdTag: number;
  materialLogistikStdTag: number;
  besprechungStdTag: number;
  wetterausfallTage: number;
  unproduktiveStdTag: number;
  unproduktiveStdJahr: number;
  wetterausfallStd: number;
  totalUnproduktiv: number;
  produktivStundenMA: number;
  produktivitaetProzent: number;
}

function useProduktivCalc(form: FormState): ProduktivCalc {
  return useMemo(() => {
    const arbeitstageJahr = p(form.arbeitstageJahr);
    const urlaubstage = p(form.urlaubstage);
    const feiertage = p(form.feiertage);
    const krankheitstage = p(form.krankheitstage);
    const fortbildungstage = p(form.fortbildungstage);
    const stundenProTag = p(form.weeklyHours) / 5;

    const moeglicheArbeitstage = arbeitstageJahr - urlaubstage - feiertage;
    const bruttoJahresstunden = moeglicheArbeitstage * stundenProTag;

    const abzugTage = krankheitstage + fortbildungstage;
    const verfuegbareStunden = (moeglicheArbeitstage - abzugTage) * stundenProTag;

    const fahrzeitStdTag = p(form.fahrzeitStdTag);
    const ruestzeitStdTag = p(form.ruestzeitStdTag);
    const materialLogistikStdTag = p(form.materialLogistikStdTag);
    const besprechungStdTag = p(form.besprechungStdTag);
    const wetterausfallTage = p(form.wetterausfallTage);

    const anwesenheitsTage = moeglicheArbeitstage - abzugTage;
    const unproduktiveStdTag = fahrzeitStdTag + ruestzeitStdTag + materialLogistikStdTag + besprechungStdTag;
    const unproduktiveStdJahr = unproduktiveStdTag * anwesenheitsTage;
    const wetterausfallStd = wetterausfallTage * stundenProTag;
    const totalUnproduktiv = unproduktiveStdJahr + wetterausfallStd;

    const produktivStundenMA = Math.max(0, verfuegbareStunden - totalUnproduktiv);
    const produktivitaetProzent = verfuegbareStunden > 0 ? (produktivStundenMA / verfuegbareStunden) * 100 : 0;

    return {
      arbeitstageJahr,
      urlaubstage,
      feiertage,
      krankheitstage,
      fortbildungstage,
      moeglicheArbeitstage,
      stundenProTag,
      bruttoJahresstunden,
      verfuegbareStunden,
      fahrzeitStdTag,
      ruestzeitStdTag,
      materialLogistikStdTag,
      besprechungStdTag,
      wetterausfallTage,
      unproduktiveStdTag,
      unproduktiveStdJahr,
      wetterausfallStd,
      totalUnproduktiv,
      produktivStundenMA,
      produktivitaetProzent,
    };
  }, [form.arbeitstageJahr, form.urlaubstage, form.feiertage, form.krankheitstage, form.fortbildungstage, form.weeklyHours, form.fahrzeitStdTag, form.ruestzeitStdTag, form.materialLogistikStdTag, form.besprechungStdTag, form.wetterausfallTage]);
}

function useCalc(form: FormState) {
  return useMemo(() => {
    const personalkosten = p(form.personalkosten);
    const gemeinkosten =
      p(form.raumkosten) +
      p(form.fahrzeugkosten) +
      p(form.versicherungen) +
      p(form.abschreibungen) +
      p(form.sonstigeKosten) +
      p(form.betrieblicheSteuern) +
      p(form.werbeReisekosten) +
      p(form.reparaturInstandhaltung) +
      p(form.kostenWarenabgabe) +
      p(form.besondereKosten);

    const betriebskosten = personalkosten + gemeinkosten;
    const produktivstunden = p(form.produktivstunden) || 1;
    const mitarbeiter = p(form.produktiveMitarbeiter) || 1;
    const geplGewinn = p(form.geplGewinn);

    const selbstkostenProStd = betriebskosten / produktivstunden;
    const personalkostenProStd = personalkosten / produktivstunden;
    const gemeinkostenProStd = gemeinkosten / produktivstunden;
    const gewinnProStd = geplGewinn / produktivstunden;
    const kalkulierterStundensatz = selbstkostenProStd + gewinnProStd;

    const stundenProMa = produktivstunden / mitarbeiter;

    const geplUmsatz = p(form.geplUmsatz);
    const materialAnteil = p(form.materialAnteil);
    const materialAufschlag = p(form.materialAufschlag);

    const materialUmsatz = geplUmsatz * materialAnteil / 100;
    const materialEinkauf = materialAufschlag > 0
      ? materialUmsatz / (1 + materialAufschlag / 100)
      : materialUmsatz;
    const materialGewinn = materialUmsatz - materialEinkauf;
    const lohnUmsatz = geplUmsatz - materialUmsatz;

    const zuDeckenDurchStunden = betriebskosten + geplGewinn - materialGewinn;
    const kalkulierterStundensatzMitMaterial = zuDeckenDurchStunden / produktivstunden;

    return {
      personalkosten,
      gemeinkosten,
      betriebskosten,
      produktivstunden,
      mitarbeiter,
      geplGewinn,
      selbstkostenProStd,
      personalkostenProStd,
      gemeinkostenProStd,
      gewinnProStd,
      kalkulierterStundensatz,
      stundenProMa,
      geplUmsatz,
      materialAnteil,
      materialAufschlag,
      materialUmsatz,
      materialEinkauf,
      materialGewinn,
      lohnUmsatz,
      zuDeckenDurchStunden,
      kalkulierterStundensatzMitMaterial,
    };
  }, [form]);
}

function ResultRow({ label, value, bold = false, highlight = false, className = "", negative = false }: {
  label: string; value: string; bold?: boolean; highlight?: boolean; className?: string; negative?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 py-1 ${className}`}>
      <span className={`text-sm ${bold ? "font-semibold" : ""} ${negative ? "text-red-600 dark:text-red-400" : ""}`}>{label}</span>
      <span className={`text-sm font-mono tabular-nums ${bold ? "font-bold" : "font-medium"} ${highlight ? "bg-primary/10 px-2 py-0.5 rounded text-base" : ""} ${negative ? "text-red-600 dark:text-red-400" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function InputRow({ label, value, onChange, suffix = "€", decimals = 2, className = "", inputWidth = "w-32", testId, negative = false }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string; decimals?: number; className?: string; inputWidth?: string; testId?: string; negative?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 py-1 ${className}`}>
      <span className={`text-sm ${negative ? "text-red-600 dark:text-red-400" : ""}`}>{label}</span>
      <div className="flex items-center gap-1">
        <DeNumberInput value={value} onChange={onChange} decimals={decimals} className={inputWidth} data-testid={testId} />
        {suffix && <span className="text-xs text-muted-foreground w-6">{suffix}</span>}
      </div>
    </div>
  );
}

function ProduktivstundenCard({ form, setForm, produktivCalc }: { form: FormState; setForm: (fn: (f: FormState) => FormState) => void; produktivCalc: ProduktivCalc }) {
  const set = (field: keyof FormState) => (val: string) => {
    setForm(f => ({ ...f, [field]: val }));
  };

  const applyGewerk = (key: string) => {
    const preset = GEWERK_PRESETS[key];
    if (!preset) return;
    setForm(f => ({
      ...f,
      gewerkAuswahl: key,
      wetterausfallTage: preset.wetterausfallTage,
      fahrzeitStdTag: preset.fahrzeitStdTag,
      ruestzeitStdTag: preset.ruestzeitStdTag,
      materialLogistikStdTag: preset.materialLogistikStdTag,
      besprechungStdTag: preset.besprechungStdTag,
    }));
  };

  const [istLoading, setIstLoading] = useState(false);
  const [istData, setIstData] = useState<{
    produktivStunden: number;
    abwesenheitStunden: number;
    mitarbeiterAnzahl: number;
    arbeit: { stunden: number; anzahl: number };
    urlaub: { stunden: number; anzahl: number };
    krank: { stunden: number; anzahl: number };
    feiertag: { stunden: number; anzahl: number };
    gesamt: { stunden: number; anzahl: number };
  } | null>(null);
  const { toast } = useToast();

  const loadIstStunden = async () => {
    setIstLoading(true);
    try {
      const year = parseInt(form.bwaYear) || 2026;
      const res = await fetch(`/api/time-tracking/year-summary/${year}`, { credentials: "include" });
      if (!res.ok) {
        let msg = "Fehler beim Laden der IST-Stunden";
        try { const err = await res.json(); msg = err.message || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      setIstData(data);
      setForm(f => ({
        ...f,
        produktivstunden: data.produktivStunden.toFixed(2),
        produktiveMitarbeiter: String(data.mitarbeiterAnzahl || f.produktiveMitarbeiter),
      }));
      toast({
        title: "IST-Stunden geladen",
        description: `${year}: ${fmtNumber(data.produktivStunden)} Produktivstunden, ${data.mitarbeiterAnzahl} Mitarbeiter`,
      });
    } catch (err: any) {
      setIstData(null);
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setIstLoading(false);
    }
  };

  const pc = produktivCalc;
  const mitarbeiter = p(form.produktiveMitarbeiter) || 1;
  const sollGesamt = pc.produktivStundenMA * mitarbeiter;

  return (
    <Card className="xl:col-span-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          2. Produktivstunden
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <Tabs defaultValue="soll">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="soll" className="flex-1" data-testid="tab-soll-hours">SOLL (Kalkulation)</TabsTrigger>
            <TabsTrigger value="ist" className="flex-1" data-testid="tab-ist-hours">IST (Zeiterfassung)</TabsTrigger>
          </TabsList>

          <TabsContent value="soll" className="space-y-2">
            <div className="flex gap-1 mb-3">
              {Object.entries(GEWERK_PRESETS).map(([key, gw]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={form.gewerkAuswahl === key ? "default" : "outline"}
                  className="flex-1 text-xs px-1"
                  onClick={() => applyGewerk(key)}
                  data-testid={`button-gewerk-${key}`}
                >
                  <gw.icon className="h-3 w-3 mr-1" />
                  {gw.label.split(" ")[0]}
                </Button>
              ))}
            </div>

            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bruttojahresstunden</p>
            <InputRow label="Arbeitstage/Jahr (Mo–Fr)" value={form.arbeitstageJahr} onChange={set("arbeitstageJahr")} suffix="Tg" decimals={0} inputWidth="w-20" testId="input-arbeitstage" />
            <InputRow label="− Urlaubstage" value={form.urlaubstage} onChange={set("urlaubstage")} suffix="Tg" decimals={0} inputWidth="w-20" testId="input-urlaub" negative />
            <InputRow label="− Feiertage (Hamburg)" value={form.feiertage} onChange={set("feiertage")} suffix="Tg" decimals={0} inputWidth="w-20" testId="input-feiertage" negative />
            <ResultRow label="= Mögliche Arbeitstage" value={`${fmtNumber(pc.moeglicheArbeitstage, 0)} Tage`} bold />

            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-sm">× Stunden/Tag</span>
              <span className="text-sm font-mono">{fmtNumber(pc.stundenProTag)} Std</span>
            </div>
            <ResultRow label="= Bruttojahresstunden" value={`${fmtNumber(pc.bruttoJahresstunden)} Std`} bold />

            <Separator className="my-2" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Verfügbare Stunden</p>
            <InputRow label="− Krankheit (Ø Dtl.)" value={form.krankheitstage} onChange={set("krankheitstage")} suffix="Tg" decimals={1} inputWidth="w-20" testId="input-krankheit" negative />
            <InputRow label="− Fortbildung/Unterweis." value={form.fortbildungstage} onChange={set("fortbildungstage")} suffix="Tg" decimals={0} inputWidth="w-20" negative />
            <ResultRow label="= Anwesenheitsstunden" value={`${fmtNumber(pc.verfuegbareStunden)} Std/Jahr`} bold />

            <Separator className="my-2" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unproduktive Zeiten (pro Tag)</p>
            <InputRow label="Fahrzeit" value={form.fahrzeitStdTag} onChange={set("fahrzeitStdTag")} suffix="Std" decimals={2} inputWidth="w-20" testId="input-fahrzeit" />
            <InputRow label="Rüst-/Ladezeit" value={form.ruestzeitStdTag} onChange={set("ruestzeitStdTag")} suffix="Std" decimals={2} inputWidth="w-20" />
            <InputRow label="Material holen" value={form.materialLogistikStdTag} onChange={set("materialLogistikStdTag")} suffix="Std" decimals={2} inputWidth="w-20" />
            <InputRow label="Bespr./Doku" value={form.besprechungStdTag} onChange={set("besprechungStdTag")} suffix="Std" decimals={2} inputWidth="w-20" />
            <ResultRow label="= Unproduktiv/Tag" value={`${fmtNumber(pc.unproduktiveStdTag)} Std`} negative />
            <ResultRow label="× Anwesenheitstage → /Jahr" value={`−${fmtNumber(pc.unproduktiveStdJahr)} Std`} negative />

            <Separator className="my-2" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Wetterbedingte Ausfälle</p>
            <InputRow label="Wetterausfall" value={form.wetterausfallTage} onChange={set("wetterausfallTage")} suffix="Tg" decimals={0} inputWidth="w-20" testId="input-wetterausfall" />
            <ResultRow label="= Wetterausfall" value={`−${fmtNumber(pc.wetterausfallStd)} Std`} negative />

            <Separator className="my-3" />
            <div className="bg-primary/5 rounded-lg p-3 space-y-1">
              <ResultRow label="Produktivstunden/MA" value={`${fmtNumber(pc.produktivStundenMA)} Std`} bold highlight />
              <ResultRow label={`Produktivität (von ${fmtNumber(pc.verfuegbareStunden)} Anw.)`} value={fmtPercent(pc.produktivitaetProzent)} />

              <Separator className="my-2" />
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm">× Mitarbeiter</span>
                <div className="flex items-center gap-1">
                  <DeNumberInput
                    value={form.produktiveMitarbeiter}
                    onChange={v => setForm(f => ({ ...f, produktiveMitarbeiter: String(Math.round(parseFloat(v) || 1)) }))}
                    decimals={0}
                    className="w-16"
                    data-testid="input-produktive-ma"
                  />
                  <span className="text-xs text-muted-foreground">MA</span>
                </div>
              </div>
              <ResultRow label="= SOLL gesamt" value={`${fmtNumber(sollGesamt)} Std`} bold highlight />
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full mt-2"
              onClick={() => setForm(f => ({ ...f, produktivstunden: sollGesamt.toFixed(2) }))}
              data-testid="button-use-soll-hours"
            >
              <ArrowRight className="mr-1 h-3 w-3" />
              SOLL übernehmen ({fmtNumber(sollGesamt)} Std)
            </Button>

            <div className="mt-3 p-2 rounded bg-muted/50 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Richtwerte produktive Std/Jahr:</p>
              <div className="grid grid-cols-3 gap-1">
                <span>SHK: 1.500–1.600</span>
                <span>Zimmerer: 1.450–1.550</span>
                <span>Dachdecker: 1.350–1.500</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ist" className="space-y-3">
            <p className="text-xs text-muted-foreground">Tatsächlich gebuchte Produktivstunden aus der Zeiterfassung</p>
            <Button size="sm" variant="outline" className="w-full" onClick={loadIstStunden} disabled={istLoading} data-testid="button-load-ist">
              <Download className="mr-1 h-3 w-3" />
              {istLoading ? "Lade..." : "IST-Stunden laden"}
            </Button>

            {istData && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <ResultRow label="Arbeitsstunden" value={`${fmtNumber(istData.arbeit.stunden)} Std (${istData.arbeit.anzahl} Eintr.)`} />
                <ResultRow label="Urlaub" value={`${fmtNumber(istData.urlaub.stunden)} Std`} />
                <ResultRow label="Krank" value={`${fmtNumber(istData.krank.stunden)} Std`} />
                <ResultRow label="Feiertage" value={`${fmtNumber(istData.feiertag.stunden)} Std`} />
                <Separator />
                <ResultRow label="Gesamt (alle Typen)" value={`${fmtNumber(istData.gesamt.stunden)} Std`} bold />
                <ResultRow label="Mitarbeiter erkannt" value={`${istData.mitarbeiterAnzahl} MA`} />
              </div>
            )}

            <InputRow label="Produktivstunden gesamt" value={form.produktivstunden} onChange={set("produktivstunden")} suffix="Std" testId="input-produktivstunden" />
            <InputRow label="Produktive Mitarbeiter" value={form.produktiveMitarbeiter} onChange={v => setForm(f => ({ ...f, produktiveMitarbeiter: String(Math.round(parseFloat(v) || 1)) }))} suffix="MA" decimals={0} testId="input-produktive-ma-ist" />

            <Separator />
            <ResultRow label="Stunden pro MA" value={`${fmtNumber(p(form.produktivstunden) / (p(form.produktiveMitarbeiter) || 1))} Std/Jahr`} bold />

            {produktivCalc.produktivStundenMA > 0 && (
              <div className="bg-muted/30 rounded p-2 text-xs space-y-1">
                <p className="font-medium">SOLL vs. IST Vergleich:</p>
                <div className="flex justify-between">
                  <span>SOLL/MA:</span>
                  <span className="font-mono">{fmtNumber(produktivCalc.produktivStundenMA)} Std</span>
                </div>
                <div className="flex justify-between">
                  <span>IST/MA:</span>
                  <span className="font-mono">{fmtNumber(p(form.produktivstunden) / (p(form.produktiveMitarbeiter) || 1))} Std</span>
                </div>
                {(() => {
                  const istPerMa = p(form.produktivstunden) / (p(form.produktiveMitarbeiter) || 1);
                  const diff = istPerMa - produktivCalc.produktivStundenMA;
                  const diffPct = (diff / produktivCalc.produktivStundenMA) * 100;
                  return (
                    <div className="flex justify-between">
                      <span>Abweichung:</span>
                      <span className={`font-mono font-medium ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {diff >= 0 ? "+" : ""}{fmtNumber(diff)} Std ({diff >= 0 ? "+" : ""}{fmtPercent(diffPct)})
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function StundensatzPage() {
  const [form, setForm] = useState<FormState>({ ...defaultForm });
  const [editId, setEditId] = useState<number | null>(null);
  const [bwaLoaded, setBwaLoaded] = useState(false);
  const { toast } = useToast();
  const calc = useCalc(form);
  const produktivCalc = useProduktivCalc(form);

  const { data: calcs, isLoading } = useQuery<HourlyRateCalc[]>({
    queryKey: ["/api/hourly-rate-calcs"],
  });

  const { data: laborRates } = useQuery<LaborRate[]>({
    queryKey: ["/api/labor-rates"],
  });

  const hapakRates = useMemo(() => {
    if (!laborRates) return [];
    return laborRates.filter(r => r.laborNumber !== null && r.laborNumber !== "");
  }, [laborRates]);

  useEffect(() => {
    if (calcs && calcs.length > 0 && !editId) {
      const bwaCalc = calcs.find(c => c.name.includes("BWA")) || calcs[calcs.length - 1];
      loadCalc(bwaCalc);
    }
  }, [calcs]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        weeklyHours: form.weeklyHours,
        socialCostsPercent: form.socialCostsPercent,
        freeDays: parseInt(form.freeDays) || 0,
        freeDayHours: form.freeDayHours,
        unproductivePercent: form.unproductivePercent,
        materialCosts: form.raumkosten,
        personnelCosts: form.personalkosten,
        fixedCosts: form.geplGewinn,
        fixedIncome: "0",
        costIncrease: form.materialAufschlag,
        productiveEmployees: parseInt(form.produktiveMitarbeiter) || 1,
        plannedRevenue: form.geplUmsatz,
        plannedProfitPercent: form.materialAnteil,
        resultProductiveHours: calc.produktivstunden.toFixed(2),
        resultHourlySurcharge: "0",
        resultFixCostsPerHour: calc.gemeinkostenProStd.toFixed(2),
        resultCostCoveringRate: calc.selbstkostenProStd.toFixed(2),
        resultCalculatedRate: calc.kalkulierterStundensatzMitMaterial.toFixed(2),
      };
      if (editId) {
        return apiRequest("PATCH", `/api/hourly-rate-calcs/${editId}`, body);
      }
      return apiRequest("POST", "/api/hourly-rate-calcs", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hourly-rate-calcs"] });
      toast({ title: "Gespeichert", description: `Kalkulation "${form.name}" wurde gespeichert.` });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/hourly-rate-calcs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hourly-rate-calcs"] });
      toast({ title: "Gelöscht" });
      if (editId) { setEditId(null); setForm({ ...defaultForm }); }
    },
  });

  const loadCalc = (c: HourlyRateCalc) => {
    setEditId(c.id);
    setForm({
      ...defaultForm,
      name: c.name,
      personalkosten: c.personnelCosts ?? defaultForm.personalkosten,
      raumkosten: c.materialCosts ?? defaultForm.raumkosten,
      produktivstunden: c.resultProductiveHours ?? defaultForm.produktivstunden,
      produktiveMitarbeiter: String(c.productiveEmployees ?? 6),
      geplGewinn: c.fixedCosts ?? defaultForm.geplGewinn,
      geplUmsatz: c.plannedRevenue ?? defaultForm.geplUmsatz,
      materialAnteil: c.plannedProfitPercent ?? defaultForm.materialAnteil,
      materialAufschlag: c.costIncrease ?? defaultForm.materialAufschlag,
      weeklyHours: c.weeklyHours ?? defaultForm.weeklyHours,
      socialCostsPercent: c.socialCostsPercent ?? defaultForm.socialCostsPercent,
      freeDays: String(c.freeDays ?? 49),
      freeDayHours: c.freeDayHours ?? defaultForm.freeDayHours,
      unproductivePercent: c.unproductivePercent ?? defaultForm.unproductivePercent,
    });
  };

  const loadBwaData = async () => {
    try {
      const year = parseInt(form.bwaYear) || 2026;
      const res = await fetch(`/api/bwa-reports/year-summary/${year}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Fehler beim Laden");
      }
      const data: BwaSummary = await res.json();
      setForm(f => ({
        ...f,
        personalkosten: data.personalkosten.toFixed(2),
        raumkosten: data.raumkosten.toFixed(2),
        fahrzeugkosten: data.fahrzeugkosten.toFixed(2),
        versicherungen: data.versicherungen.toFixed(2),
        abschreibungen: data.abschreibungen.toFixed(2),
        sonstigeKosten: data.sonstigeKosten.toFixed(2),
        betrieblicheSteuern: data.betrieblicheSteuern.toFixed(2),
        werbeReisekosten: data.werbeReisekosten.toFixed(2),
        reparaturInstandhaltung: data.reparaturInstandhaltung.toFixed(2),
        kostenWarenabgabe: data.kostenWarenabgabe.toFixed(2),
        besondereKosten: data.besondereKosten.toFixed(2),
      }));
      setBwaLoaded(true);
      toast({
        title: "BWA geladen",
        description: `BWA ${year}: Gesamtkosten ${fmtCurrency(data.gesamtkosten)}, davon Personal ${fmtCurrency(data.personalkosten)}`,
      });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    }
  };

  const set = (field: keyof FormState) => (val: string) => {
    setForm(f => ({ ...f, [field]: val }));
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Stundensatzermittlung</h1>
          <p className="text-sm text-muted-foreground mt-1">Kalkulierter Stundensatz auf Basis der BWA und Produktivstunden</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setEditId(null); setForm({ ...defaultForm }); setBwaLoaded(false); }} data-testid="button-new-calc">
            <Plus className="mr-1 h-4 w-4" />
            Neu
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-calc">
            <Save className="mr-1 h-4 w-4" />
            {editId ? "Aktualisieren" : "Speichern"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor="calc-name" className="shrink-0">Name:</Label>
        <Input
          id="calc-name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="max-w-sm"
          data-testid="input-calc-name"
        />
        {editId && <Badge variant="secondary">Bearbeitung #{editId}</Badge>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-4 gap-6">
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              1. BWA-Kosten
            </CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <DeNumberInput
                value={form.bwaYear}
                onChange={v => setForm(f => ({ ...f, bwaYear: String(Math.round(parseFloat(v) || 2026)) }))}
                decimals={0}
                className="w-20"
                data-testid="input-bwa-year"
              />
              <Button size="sm" variant="outline" onClick={loadBwaData} data-testid="button-load-bwa">
                <Download className="mr-1 h-3 w-3" />
                BWA laden
              </Button>
              {bwaLoaded && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Personalkosten</p>
            <InputRow label="Löhne + Gehälter + NK" value={form.personalkosten} onChange={set("personalkosten")} testId="input-personalkosten" />

            <Separator className="my-2" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Sachkosten / Gemeinkosten</p>
            <InputRow label="Raumkosten" value={form.raumkosten} onChange={set("raumkosten")} testId="input-raumkosten" />
            <InputRow label="Fahrzeugkosten" value={form.fahrzeugkosten} onChange={set("fahrzeugkosten")} />
            <InputRow label="Versicherungen" value={form.versicherungen} onChange={set("versicherungen")} />
            <InputRow label="Abschreibungen (AfA)" value={form.abschreibungen} onChange={set("abschreibungen")} />
            <InputRow label="Betr. Steuern" value={form.betrieblicheSteuern} onChange={set("betrieblicheSteuern")} />
            <InputRow label="Werbe-/Reisekosten" value={form.werbeReisekosten} onChange={set("werbeReisekosten")} />
            <InputRow label="Reparatur/Instandh." value={form.reparaturInstandhaltung} onChange={set("reparaturInstandhaltung")} />
            <InputRow label="Versandkosten" value={form.kostenWarenabgabe} onChange={set("kostenWarenabgabe")} />
            <InputRow label="Besondere Kosten" value={form.besondereKosten} onChange={set("besondereKosten")} />
            <InputRow label="Sonstige Kosten" value={form.sonstigeKosten} onChange={set("sonstigeKosten")} />

            <Separator className="my-2" />
            <ResultRow label="= Gemeinkosten" value={fmtCurrency(calc.gemeinkosten)} bold />
            <ResultRow label="+ Personalkosten" value={fmtCurrency(calc.personalkosten)} />

            <Separator className="my-2" />
            <ResultRow label="= Betriebskosten gesamt" value={fmtCurrency(calc.betriebskosten)} bold highlight />
            <p className="text-xs text-muted-foreground italic">ohne Materialkosten (separat kalkuliert)</p>
          </CardContent>
        </Card>

        <ProduktivstundenCard form={form} setForm={setForm} produktivCalc={produktivCalc} />

        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              3. Material & Marge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Umsatzplanung</p>
            <InputRow label="Geplanter Gesamtumsatz" value={form.geplUmsatz} onChange={set("geplUmsatz")} testId="input-gepl-umsatz" />
            <InputRow label="Geplanter Gewinn/Jahr" value={form.geplGewinn} onChange={set("geplGewinn")} testId="input-geplanter-gewinn" />

            <Separator className="my-3" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Materialanteil</p>
            <InputRow label="Anteil am Umsatz" value={form.materialAnteil} onChange={set("materialAnteil")} suffix="%" testId="input-material-anteil" />
            <ResultRow label="= Material-Umsatz" value={fmtCurrency(calc.materialUmsatz)} />

            <Separator className="my-2" />
            <InputRow label="Aufschlag auf Mat.-EK" value={form.materialAufschlag} onChange={set("materialAufschlag")} suffix="%" testId="input-material-aufschlag" />
            <ResultRow label="Material-Einkauf (netto)" value={fmtCurrency(calc.materialEinkauf)} />

            <Separator className="my-2" />
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 space-y-1">
              <ResultRow label="Material-Marge" value={fmtCurrency(calc.materialGewinn)} bold highlight />
              <p className="text-xs text-muted-foreground">
                {fmtCurrency(calc.materialUmsatz)} Umsatz − {fmtCurrency(calc.materialEinkauf)} Einkauf
              </p>
            </div>

            <Separator className="my-3" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Umsatzaufteilung</p>
            <ResultRow label="Lohn-Umsatz (aus Stunden)" value={fmtCurrency(calc.lohnUmsatz)} />
            <ResultRow label="Material-Umsatz" value={fmtCurrency(calc.materialUmsatz)} />
            <div className="mt-1">
              <div className="flex h-3 rounded overflow-hidden border">
                <div
                  className="bg-primary/70 transition-all"
                  style={{ width: `${calc.geplUmsatz > 0 ? ((calc.lohnUmsatz / calc.geplUmsatz) * 100) : 67}%` }}
                  title={`Lohn: ${fmtPercent(calc.geplUmsatz > 0 ? (calc.lohnUmsatz / calc.geplUmsatz) * 100 : 0)}`}
                />
                <div
                  className="bg-orange-400 transition-all"
                  style={{ width: `${calc.geplUmsatz > 0 ? ((calc.materialUmsatz / calc.geplUmsatz) * 100) : 33}%` }}
                  title={`Material: ${fmtPercent(calc.materialAnteil)}`}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">Lohn {fmtPercent(100 - calc.materialAnteil)}</span>
                <span className="text-xs text-muted-foreground">Material {fmtPercent(calc.materialAnteil)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              4. Stundensatz
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Selbstkosten pro Stunde</p>
            <ResultRow label="Personalkosten/Std" value={fmtCurrency(calc.personalkostenProStd)} />
            <ResultRow label="Gemeinkosten/Std" value={fmtCurrency(calc.gemeinkostenProStd)} />
            <Separator className="my-2" />
            <ResultRow label="= Selbstkosten/Std" value={fmtCurrency(calc.selbstkostenProStd)} bold />

            <Separator className="my-3" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Ohne Material-Marge</p>
            <ResultRow label="Gewinn/Std" value={fmtCurrency(calc.gewinnProStd)} />
            <ResultRow label="Stundensatz (brutto)" value={fmtCurrency(calc.kalkulierterStundensatz)} />

            <Separator className="my-3" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Mit Material-Marge</p>
            <ResultRow label="Material-Marge deckt" value={`−${fmtCurrency(calc.materialGewinn / calc.produktivstunden)}/Std`} className="text-green-600 dark:text-green-400" />
            <ResultRow label="Noch zu decken/Std" value={fmtCurrency(calc.zuDeckenDurchStunden / calc.produktivstunden)} />

            <Separator className="my-3" />
            <div className="bg-primary/5 rounded-lg p-3 space-y-2">
              <ResultRow label="Kalk. Stundensatz" value={fmtCurrency(calc.kalkulierterStundensatzMitMaterial)} bold highlight />
              <p className="text-xs text-muted-foreground">
                ({fmtCurrency(calc.betriebskosten)} + {fmtCurrency(calc.geplGewinn)} − {fmtCurrency(calc.materialGewinn)} Mat.-Marge) / {fmtNumber(calc.produktivstunden)} Std
              </p>
              {calc.kalkulierterStundensatz !== calc.kalkulierterStundensatzMitMaterial && (
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Material-Marge senkt den Stundensatz um {fmtCurrency(calc.kalkulierterStundensatz - calc.kalkulierterStundensatzMitMaterial)}/Std
                </p>
              )}
            </div>

            <Separator className="my-3" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Produktivstunden-Zusammenfassung</p>
            <ResultRow label="Prod.Std/MA (SOLL)" value={`${fmtNumber(produktivCalc.produktivStundenMA)} Std`} />
            <ResultRow label="Prod.Std gesamt (verwendet)" value={`${fmtNumber(calc.produktivstunden)} Std`} bold />
            <ResultRow label="Stunden pro MA" value={`${fmtNumber(calc.stundenProMa)} Std`} />

            {hapakRates.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Vergleich mit Lohnsätzen</p>
                {hapakRates.slice(0, 5).map(rate => {
                  const vk1 = parseFloat(rate.salePrice1 ?? "0");
                  const diff = vk1 - calc.kalkulierterStundensatzMitMaterial;
                  const diffPct = calc.kalkulierterStundensatzMitMaterial > 0 ? (diff / calc.kalkulierterStundensatzMitMaterial) * 100 : 0;
                  return (
                    <div key={rate.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs truncate max-w-[140px]" title={rate.name}>{rate.laborNumber}: {rate.name.split(" ").slice(0, 2).join(" ")}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">{fmtCurrency(vk1)}</span>
                        <Badge variant={diff >= 0 ? "default" : "destructive"} className="text-xs px-1.5 py-0">
                          {diff >= 0 ? "+" : ""}{fmtPercent(diffPct)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Gespeicherte Kalkulationen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !calcs || calcs.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-calcs">
              Keine Kalkulationen vorhanden. Erstellen Sie eine neue Kalkulation.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Kalk. Stundensatz</TableHead>
                  <TableHead className="text-right">Produktivstunden</TableHead>
                  <TableHead className="text-right">Selbstkosten/Std</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calcs.map(c => (
                  <TableRow
                    key={c.id}
                    className={editId === c.id ? "bg-muted/50" : "cursor-pointer hover:bg-muted/30"}
                    onClick={() => loadCalc(c)}
                    data-testid={`row-calc-${c.id}`}
                  >
                    <TableCell className="font-medium" data-testid={`text-calc-name-${c.id}`}>
                      {c.name}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-calc-rate-${c.id}`}>
                      {fmtCurrency(c.resultCalculatedRate)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtNumber(c.resultProductiveHours)} Std
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtCurrency(c.resultCostCoveringRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); loadCalc(c); }} data-testid={`button-load-calc-${c.id}`}>
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(c.id); }} disabled={deleteMutation.isPending} data-testid={`button-delete-calc-${c.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
