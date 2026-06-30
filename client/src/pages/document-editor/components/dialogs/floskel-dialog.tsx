import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Phrase } from "../../types";

export function FloskelDialog({
  open,
  onClose,
  onInsert,
  mehrfach = false,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (text: string, name: string) => void;
  mehrfach?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: phrases } = useQuery<Phrase[]>({
    queryKey: ["/api/phrases"],
    enabled: open,
  });
  const filtered = (phrases || []).filter(
    (p) =>
      p.active !== false &&
      (!search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.text?.toLowerCase().includes(search.toLowerCase())),
  );
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setSearch("");
    }
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Floskel / Textbaustein auswählen</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          className="h-7 text-xs"
          placeholder="Suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1 overflow-y-auto border rounded-md max-h-[400px]">
          {filtered.map((p) => (
            <button
              key={p.id}
              className={`w-full text-left px-3 py-2 text-xs border-b ${selectedId === p.id ? "bg-primary/10" : "hover:bg-accent"}`}
              onClick={() => setSelectedId(p.id)}
              onDoubleClick={() => {
                onInsert(p.text, p.name);
                if (!mehrfach) onClose();
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground">
                  {p.number}
                </span>
                <span className="font-semibold">{p.name}</span>
              </div>
              {p.text && (
                <div className="text-muted-foreground mt-0.5 line-clamp-2">
                  {p.text.substring(0, 150)}
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Keine Floskeln gefunden
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!selectedId}
            onClick={() => {
              const p = filtered.find((x) => x.id === selectedId);
              if (p) {
                onInsert(p.text, p.name);
                if (!mehrfach) onClose();
                else setSelectedId(null);
              }
            }}
          >
            {mehrfach ? "Einfügen & Weiter" : "Einfügen"}
          </Button>
          {mehrfach && (
            <Button variant="outline" onClick={onClose}>
              Fertig
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
