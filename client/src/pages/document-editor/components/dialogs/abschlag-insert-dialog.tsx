import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtCurrency, fmtDocNumber } from "@/lib/format";
import type { Document } from "@shared/schema";
import { documentTypeLabels } from "@shared/schema";
import { Loader2 } from "lucide-react";

interface AbschlagInsertDialogProps {
  open: boolean;
  onClose: () => void;
  abschlaege: (Document & { deltaNet?: string; deltaGross?: string })[];
  loading: boolean;
  onInsertMultiple: (items: (Document & { deltaNet?: string; deltaGross?: string })[]) => void;
  currentDocId: number | null | undefined;
  existingDocIds?: number[];
}

export function AbschlagInsertDialog({
  open,
  onClose,
  abschlaege,
  loading,
  onInsertMultiple,
  currentDocId,
  existingDocIds = [],
}: AbschlagInsertDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const available = abschlaege.filter(ar => !existingDocIds.includes(ar.id));

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === available.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(available.map(a => a.id)));
    }
  };

  const handleInsert = () => {
    const items = available
      .filter(a => selected.has(a.id))
      .sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return da - db || a.id - b.id;
      });
    if (items.length > 0) {
      onInsertMultiple(items);
      setSelected(new Set());
    }
  };

  const handleClose = () => {
    setSelected(new Set());
    onClose();
  };

  const totalSelected = available
    .filter(a => selected.has(a.id))
    .reduce((s, a) => s + parseFloat(a.deltaGross || a.grossTotal || "0"), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-abschlag-insert">
        <DialogHeader>
          <DialogTitle>Rechnungen zur Verrechnung auswählen</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : available.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">
            {abschlaege.length > 0 && existingDocIds.length > 0
              ? "Alle verfügbaren Rechnungen sind bereits verrechnet."
              : "Keine Rechnungen im Projekt gefunden."}
          </div>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">
                Wählen Sie die Rechnungen zur Verrechnung:
              </span>
              <button
                className="text-xs text-blue-600 hover:text-blue-800 underline"
                onClick={toggleAll}
                data-testid="button-toggle-all"
              >
                {selected.size === available.length ? "Keine" : "Alle"} auswählen
              </button>
            </div>
            {available.map((ar) => {
              const grossAmount = parseFloat(ar.deltaGross || ar.grossTotal || "0");
              const netAmount = parseFloat(ar.deltaNet || ar.netTotal || "0");
              const isChecked = selected.has(ar.id);
              return (
                <label
                  key={ar.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded border transition-colors cursor-pointer ${
                    isChecked ? "bg-blue-50 border-blue-200" : "border-gray-100 hover:bg-gray-50"
                  }`}
                  data-testid={`abschlag-insert-row-${ar.id}`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggle(ar.id)}
                    data-testid={`abschlag-checkbox-${ar.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {ar.abschlagNumber ? `${ar.abschlagNumber}. ` : ""}
                      {documentTypeLabels[ar.type] || ar.type}
                      {ar.documentNumber ? ` ${fmtDocNumber(ar.documentNumber)}` : ""}
                    </div>
                    <div className="text-xs text-gray-400">
                      {ar.date ? new Date(ar.date).toLocaleDateString("de-DE") : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono tabular-nums">
                      {fmtCurrency(grossAmount)} €
                    </div>
                    {netAmount !== grossAmount && (
                      <div className="text-[10px] text-gray-400 font-mono tabular-nums">
                        netto {fmtCurrency(netAmount)} €
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            {selected.size > 0 && (
              <span>
                {selected.size} ausgewählt — Summe: <span className="font-mono font-medium">{fmtCurrency(totalSelected)} €</span>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} data-testid="button-abschlag-insert-close">
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0}
              onClick={handleInsert}
              data-testid="button-abschlag-insert-confirm"
            >
              {selected.size > 0 ? `${selected.size} Rechnung${selected.size > 1 ? "en" : ""} einfügen` : "Einfügen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
