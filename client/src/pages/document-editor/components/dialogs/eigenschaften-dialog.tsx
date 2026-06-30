import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EditorItem } from "../../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function EigenschaftenDialog({
  open,
  item,
  onClose,
  onUpdate,
}: {
  open: boolean;
  item: Partial<EditorItem>;
  onClose: () => void;
  onUpdate: (fields: Partial<EditorItem>) => void;
}) {
  const [flag, setFlag] = useState(item.positionFlag || "normal");
  const [flagLabel, setFlagLabel] = useState(item.flagLabel || "");
  const [pageBreak, setPageBreak] = useState(item.pageBreakBefore || false);

  const showFlagLabel = flag === "alternativ" || flag === "bedarf";
  const defaultFlagLabel = flag === "alternativ" ? "Alternativposition" : flag === "bedarf" ? "Bedarfsposition" : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Eigenschaften: {item.title || "Position"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold">Positions-Flag</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                ["normal", "Normal"],
                ["alternativ", "Alternativ"],
                ["bedarf", "Bedarf"],
                ["festpreis", "Festpreis"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${flag === v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent border-border"}`}
                  onClick={() => {
                    setFlag(v);
                    if (v !== "alternativ" && v !== "bedarf") setFlagLabel("");
                  }}
                  data-testid={`flag-option-${v}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {showFlagLabel && (
            <div>
              <Label className="text-xs font-semibold">Kennzeichnung</Label>
              <Input
                className="mt-1 text-xs"
                placeholder={defaultFlagLabel}
                value={flagLabel}
                onChange={(e) => setFlagLabel(e.target.value)}
                data-testid="input-flag-label"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Leer = "{defaultFlagLabel}". Kann z.B. "Eventualposition" oder "Alternative zu Pos. X" sein.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pageBreak"
              checked={!!pageBreak}
              onChange={(e) => setPageBreak(e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="pageBreak" className="text-xs cursor-pointer">
              Seitenumbruch vor dieser Position
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => {
              onUpdate({
                positionFlag: flag,
                flagLabel: showFlagLabel ? (flagLabel || null) : null,
                pageBreakBefore: pageBreak,
              });
              onClose();
            }}
            data-testid="button-save-eigenschaften"
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
