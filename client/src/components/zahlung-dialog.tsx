import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDocNumber } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { fmtCurrency } from "@/lib/format";
import { Loader2, Banknote } from "lucide-react";

interface Bankkonto {
  id: number;
  kontoNr: number;
  bezeichnung: string;
  iban?: string;
}

interface ZahlungDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reId: number;
  offen: number;
  brutto: number;
  rnr: string;
  adrSuch: string;
  skProzent?: number;
}

export function ZahlungDialog({ open, onOpenChange, reId, offen, brutto, rnr, adrSuch, skProzent = 0 }: ZahlungDialogProps) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [zahldat, setZahldat] = useState(today);
  const [betragStr, setBetragStr] = useState("");
  const [bankkonto, setBankkonto] = useState("1800");
  const [mitSkonto, setMitSkonto] = useState(false);
  const [skontoStr, setSkontoStr] = useState("");

  const resetForm = () => {
    setZahldat(today);
    setBetragStr("");
    setBankkonto("1800");
    setMitSkonto(false);
    setSkontoStr("");
  };

  const handleOpenChange = (v: boolean) => {
    if (v) {
      const offenRounded = Math.round(offen * 100) / 100;
      const skontoDefault = skProzent > 0 ? Math.round(brutto * skProzent / 100 * 100) / 100 : 0;
      setBetragStr(offenRounded > 0 ? formatDeInput(offenRounded) : "");
      setSkontoStr(skontoDefault > 0 ? formatDeInput(skontoDefault) : "");
      setZahldat(today);
      setBankkonto("1800");
      setMitSkonto(false);
    }
    onOpenChange(v);
  };

  const { data: bankkonten = [] } = useQuery<Bankkonto[]>({
    queryKey: ["/api/fibu/bankkonten"],
    queryFn: async () => {
      const res = await fetch("/api/fibu/bankkonten", { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: { betrag: number; skontoBetrag: number; bankkonto: string; zahldat: string }) => {
      const res = await apiRequest("POST", `/api/fibu/${reId}/payment`, payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fibu", reId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outgoing-invoices-fibu"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incoming-invoices-fibu"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu/statistics"] });
      onOpenChange(false);
      resetForm();
      toast({ title: "Zahlung gebucht", description: `${fmtCurrency(data.zahlung)} bezahlt, ${fmtCurrency(data.offen)} offen` });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message || "Zahlung konnte nicht gebucht werden", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const betrag = parseDeNumber(betragStr);
    const skontoBetrag = mitSkonto ? parseDeNumber(skontoStr) : 0;

    if (isNaN(betrag) || betrag <= 0) {
      toast({ title: "Fehler", description: "Bitte gültigen Betrag eingeben", variant: "destructive" });
      return;
    }
    if (!zahldat) {
      toast({ title: "Fehler", description: "Bitte Zahldatum angeben", variant: "destructive" });
      return;
    }
    if (mitSkonto && (isNaN(skontoBetrag) || skontoBetrag < 0)) {
      toast({ title: "Fehler", description: "Bitte gültigen Skonto-Betrag eingeben", variant: "destructive" });
      return;
    }

    mutation.mutate({ betrag, skontoBetrag, bankkonto, zahldat });
  };

  const parsedBetrag = parseDeNumber(betragStr);
  const parsedSkonto = mitSkonto ? parseDeNumber(skontoStr) : 0;
  const restOffen = offen - (isNaN(parsedBetrag) ? 0 : parsedBetrag) - (isNaN(parsedSkonto) ? 0 : parsedSkonto);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Zahlung buchen
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{fmtDocNumber(rnr)} — {adrSuch}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/30 rounded-lg p-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase">Brutto</span>
              <p className="font-semibold">{fmtCurrency(brutto)}</p>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase">Noch offen</span>
              <p className="font-semibold text-red-600">{fmtCurrency(offen)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Zahldatum</Label>
            <Input
              data-testid="input-zahldat"
              type="date"
              value={zahldat}
              onChange={(e) => setZahldat(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Zahlbetrag (€)</Label>
            <Input
              data-testid="input-zahlbetrag"
              value={betragStr}
              onChange={(e) => setBetragStr(e.target.value)}
              placeholder={formatDeInput(offen)}
              inputMode="decimal"
            />
          </div>

          <div className="space-y-2">
            <Label>Bankkonto</Label>
            <Select value={bankkonto} onValueChange={setBankkonto} data-testid="select-bankkonto">
              <SelectTrigger data-testid="select-bankkonto-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bankkonten.map((bk) => (
                  <SelectItem key={bk.kontoNr} value={String(bk.kontoNr)} data-testid={`option-bank-${bk.kontoNr}`}>
                    {bk.kontoNr} — {bk.bezeichnung}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="skonto-toggle">Mit Skonto</Label>
            <Switch
              id="skonto-toggle"
              data-testid="switch-skonto"
              checked={mitSkonto}
              onCheckedChange={setMitSkonto}
            />
          </div>

          {mitSkonto && (
            <div className="space-y-2">
              <Label>Skonto-Betrag (€){skProzent > 0 ? ` — ${skProzent.toLocaleString("de-DE")}%` : ""}</Label>
              <Input
                data-testid="input-skonto-betrag"
                value={skontoStr}
                onChange={(e) => setSkontoStr(e.target.value)}
                inputMode="decimal"
              />
            </div>
          )}

          {!isNaN(parsedBetrag) && parsedBetrag > 0 && (
            <div className="bg-muted/20 rounded p-2 text-sm">
              <span className="text-muted-foreground">Rest nach Buchung: </span>
              <span className={restOffen > 0.01 ? "text-red-600 font-semibold" : restOffen < -0.01 ? "text-orange-600 font-semibold" : "text-green-600 font-semibold"}>
                {fmtCurrency(restOffen)}
                {restOffen <= 0.01 && restOffen >= -0.01 && " ✓ Ausgeglichen"}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-zahlung">
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="button-submit-zahlung">
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Zahlung buchen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseDeNumber(str: string): number {
  if (!str) return NaN;
  const cleaned = str.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function formatDeInput(num: number): string {
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
