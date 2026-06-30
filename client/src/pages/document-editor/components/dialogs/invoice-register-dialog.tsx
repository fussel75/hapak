import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtCurrency, fmtNumber, fmtDocNumber } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, BookOpen, Euro } from "lucide-react";

interface InvoiceRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: number;
  onRegistered?: () => void;
}

interface RegisterCheckData {
  isInvoice: boolean;
  isGutschrift?: boolean;
  alreadyRegistered: boolean;
  existingReId: number | null;
  documentNumber: string;
  customerName: string;
  customerNumber: string;
  subject: string;
  typLabel: string;
  netTotal: number;
  steuer: number;
  grossTotal: number;
  erloeskonto: string;
  belegDatum: string;
  faelligDatum: string;
  skontoDatum: string;
  skontoPct: number;
  skontoBetrag: number;
  nichtMahnen: boolean;
  bereitsGezahlt: number;
}

export function InvoiceRegisterDialog({ open, onOpenChange, documentId, onRegistered }: InvoiceRegisterDialogProps) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<RegisterCheckData>({
    queryKey: ["/api/documents", documentId, "invoice-register-check"],
    queryFn: () => fetch(`/api/documents/${documentId}/invoice-register-check`, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!documentId,
  });

  const [belegDatum, setBelegDatum] = useState("");
  const [faelligDatum, setFaelligDatum] = useState("");
  const [skontoDatum, setSkontoDatum] = useState("");
  const [skontoPct, setSkontoPct] = useState("2");
  const [skontoBetrag, setSkontoBetrag] = useState("0");
  const [erloeskonto, setErloeskonto] = useState("4400");
  const [nichtMahnen, setNichtMahnen] = useState(false);
  const [zahlBetrag, setZahlBetrag] = useState("0");

  useEffect(() => {
    if (data && data.isInvoice) {
      setBelegDatum(data.belegDatum || "");
      setFaelligDatum(data.faelligDatum || "");
      setSkontoDatum(data.skontoDatum || "");
      setSkontoPct(String(data.skontoPct));
      setSkontoBetrag(String(Math.round(data.skontoBetrag * 100) / 100));
      setErloeskonto(data.erloeskonto || "4400");
      setZahlBetrag(String(Math.round(data.grossTotal * 100) / 100));
      setNichtMahnen(data.nichtMahnen || false);
    }
  }, [data]);

  useEffect(() => {
    if (data) {
      const pct = parseFloat(skontoPct) || 0;
      const basis = data.grossTotal;
      setSkontoBetrag(String(Math.round(basis * pct / 100 * 100) / 100));
    }
  }, [skontoPct, data]);

  const registerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/documents/${documentId}/register-invoice`, {
        belegDatum,
        faelligDatum,
        skontoDatum,
        skontoPct: parseFloat(skontoPct) || 0,
        skontoBetrag: parseFloat(skontoBetrag) || 0,
        erloeskonto,
        netTotal: data?.netTotal || 0,
        grossTotal: data?.grossTotal || 0,
        steuer: data?.steuer || 0,
        zahlBetrag: parseFloat(zahlBetrag) || data?.grossTotal || 0,
        nichtMahnen,
      });
    },
    onSuccess: async (response) => {
      const result = await response.json();
      const label = data?.isGutschrift ? "Gutschrift" : "Rechnung";
      toast({
        title: result.updated ? "Eintrag aktualisiert" : `${label} übernommen`,
        description: result.updated
          ? "Der bestehende Eintrag im Rechnungsausgangsbuch wurde korrigiert."
          : `Die ${label} wurde ins Rechnungsausgangsbuch eingetragen.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/outgoing-invoices-fibu"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-invoices-for-matching"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "invoice-register-check"] });
      onOpenChange(false);
      onRegistered?.();
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message || "Übernahme fehlgeschlagen", variant: "destructive" });
    },
  });

  if (!data || !data.isInvoice) return null;

  const fmtDe = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="invoice-register-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Übernahme in das Rechnungs-Ausgangsbuch
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 border rounded-md p-3 text-center space-y-1">
            <div className="font-semibold text-sm">
              {data.typLabel} {fmtDocNumber(data.documentNumber)}
            </div>
            <div className="text-xs text-muted-foreground">
              an {data.customerName} ({data.customerNumber})
            </div>
            {data.alreadyRegistered && (
              <Badge variant="outline" className="mt-1 text-amber-600 border-amber-300 bg-amber-50">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Bereits eingetragen — wird aktualisiert
              </Badge>
            )}
            {data.alreadyRegistered && data.bereitsGezahlt > 0 && (
              <div className="text-xs text-green-700 mt-1">
                bereits gezahlt: {fmtDe(data.bereitsGezahlt)} €
              </div>
            )}
            {!data.alreadyRegistered && (
              <div className="text-xs text-muted-foreground mt-1">
                Soll diese {data.isGutschrift ? "Gutschrift" : "Rechnung"} mit folgenden Angaben in das Rechnungs-Ausgangsbuch eingetragen werden?
              </div>
            )}
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-center text-sm">
            <Label className="text-muted-foreground whitespace-nowrap">Netto</Label>
            <div className="font-medium text-right" data-testid="register-netto">{fmtDe(data.netTotal)} €</div>

            <Label className="text-muted-foreground whitespace-nowrap">Steuer-Betrag</Label>
            <div className="text-right" data-testid="register-steuer">{fmtDe(data.steuer)} €</div>

            <Label className="text-muted-foreground whitespace-nowrap">Brutto</Label>
            <div className="font-bold text-right" data-testid="register-brutto">{fmtDe(data.grossTotal)} €</div>
          </div>

          <Separator />

          <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-2 items-center text-sm">
            <Label className="text-muted-foreground whitespace-nowrap">Erlöskonto</Label>
            <Input
              className="h-7 text-xs w-20"
              value={erloeskonto}
              onChange={(e) => setErloeskonto(e.target.value)}
              data-testid="register-erloeskonto"
            />
            <span className="text-xs text-muted-foreground col-span-2">
              {erloeskonto === "4400" ? "Erlöse 19% USt" : erloeskonto === "4300" ? "Erlöse 7% USt" : erloeskonto === "4337" ? "Erlöse 0% USt" : ""}
            </span>

            <Label className="text-muted-foreground whitespace-nowrap">Belegdatum</Label>
            <Input
              type="date"
              className="h-7 text-xs"
              value={belegDatum}
              onChange={(e) => setBelegDatum(e.target.value)}
              data-testid="register-belegdatum"
            />
            <Label className="text-muted-foreground whitespace-nowrap">fällig am</Label>
            <Input
              type="date"
              className="h-7 text-xs"
              value={faelligDatum}
              onChange={(e) => setFaelligDatum(e.target.value)}
              data-testid="register-faelligdatum"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-center text-sm">
            <Label className="text-muted-foreground whitespace-nowrap">Zahlbetrag</Label>
            <div className="flex items-center gap-1">
              <Input
                className="h-7 text-xs text-right w-28"
                value={zahlBetrag}
                onChange={(e) => setZahlBetrag(e.target.value)}
                data-testid="register-zahlbetrag"
              />
              <span className="text-xs">€</span>
            </div>

            <div className="flex items-center gap-2 col-span-2">
              <Checkbox
                id="nicht-mahnen"
                checked={nichtMahnen}
                onCheckedChange={(v) => setNichtMahnen(v === true)}
                data-testid="register-nicht-mahnen"
              />
              <Label htmlFor="nicht-mahnen" className="text-xs text-muted-foreground cursor-pointer">nicht mahnen</Label>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-2 items-center text-sm">
            <Label className="text-muted-foreground whitespace-nowrap">Skonto gewährt</Label>
            <div className="flex items-center gap-1">
              <Input
                className="h-7 text-xs text-right w-20"
                value={skontoBetrag}
                readOnly
                data-testid="register-skonto-betrag"
              />
              <span className="text-xs">€</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs">=</span>
              <Input
                className="h-7 text-xs text-right w-14"
                value={skontoPct}
                onChange={(e) => setSkontoPct(e.target.value)}
                data-testid="register-skonto-pct"
              />
              <span className="text-xs">%</span>
            </div>
            <div />

            <Label className="text-muted-foreground whitespace-nowrap">Skonto bis</Label>
            <Input
              type="date"
              className="h-7 text-xs"
              value={skontoDatum}
              onChange={(e) => setSkontoDatum(e.target.value)}
              data-testid="register-skonto-datum"
            />
            <div className="col-span-2" />
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="register-cancel">
            Nein
          </Button>
          <Button
            onClick={() => registerMutation.mutate()}
            disabled={registerMutation.isPending}
            className="gap-1"
            data-testid="register-confirm"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {registerMutation.isPending ? "Wird eingetragen..." : "Ja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
