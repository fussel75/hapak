import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Copy, Check, Wand2, Minimize2, Wrench, Heart } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type KiMode = "generate" | "improve" | "shorten" | "technical" | "friendly";

const KI_MODES: { id: KiMode; label: string; icon: typeof Sparkles; instruction: string }[] = [
  { id: "generate", label: "Neu erzeugen", icon: Sparkles, instruction: "Erzeuge einen professionellen Positionstext aus den Stichworten." },
  { id: "improve", label: "Verbessern", icon: Wand2, instruction: "Verbessere den Text: professioneller, klarer, vollständiger." },
  { id: "shorten", label: "Kürzen", icon: Minimize2, instruction: "Kürze den Text auf das Wesentliche, behalte alle fachlichen Details." },
  { id: "technical", label: "Technischer", icon: Wrench, instruction: "Formuliere den Text fachlich-technischer mit korrekten Fachbegriffen." },
  { id: "friendly", label: "Kundenfreundlicher", icon: Heart, instruction: "Formuliere den Text verständlicher und kundenfreundlicher." },
];

interface KiTextDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (text: string, mode: "replace" | "append") => void;
  context?: {
    documentType?: string;
    existingTitle?: string;
    positionType?: string;
  };
}

export function KiTextDialog({ open, onClose, onInsert, context }: KiTextDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<KiMode>("generate");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const { toast } = useToast();

  useEffect(() => {
    if (open && context?.existingTitle) {
      setPrompt(context.existingTitle);
      setMode("improve");
    } else if (open) {
      setMode("generate");
    }
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [open, context?.existingTitle]);

  const handleGenerate = useCallback(async (selectedMode?: KiMode) => {
    const activeMode = selectedMode || mode;
    const modeConfig = KI_MODES.find(m => m.id === activeMode)!;
    const effectivePrompt = prompt.trim() || context?.existingTitle || "";
    if (!effectivePrompt) {
      toast({ title: "Bitte eine Beschreibung eingeben", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult("");
    setMode(activeMode);
    try {
      const contextStr = [
        context?.documentType ? `Dokumenttyp: ${context.documentType}` : "",
        context?.positionType ? `Positionstyp: ${context.positionType}` : "",
      ].filter(Boolean).join(", ");

      const isTransform = activeMode !== "generate";
      const endpoint = isTransform ? "/api/ai/optimize-text" : "/api/ai/generate-text";
      const body = isTransform
        ? { text: effectivePrompt, instruction: modeConfig.instruction }
        : { prompt: effectivePrompt, context: contextStr, type: "position" };

      const resp = await apiRequest("POST", endpoint, body);
      const data = await resp.json();
      if (data.text) {
        setResult(data.text);
      } else {
        toast({ title: "KI konnte keinen Text generieren", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "KI-Fehler: " + (err.message || "Unbekannt"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [prompt, mode, context, toast]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const handleClose = useCallback(() => {
    setPrompt("");
    setResult("");
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            KI-Positionstext
          </DialogTitle>
          <DialogDescription>
            Text per KI generieren oder verbessern. Preise, Mengen und Summen werden nicht verändert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-1">
            {KI_MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  mode === id
                    ? "bg-violet-100 text-violet-700 font-medium"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                }`}
                onClick={() => setMode(id)}
                data-testid={`ki-mode-${id}`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              {mode === "generate" ? "Stichworte / Beschreibung" : "Text zum Bearbeiten"}
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={mode === "generate"
                ? "z.B. Dachstuhl erneuern, Sparren 8/20, Unterspannbahn, inkl. Lattung"
                : "Bestehenden Positionstext hier einfügen oder bearbeiten..."}
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              data-testid="ki-prompt-input"
            />
            <div className="text-[11px] text-gray-400 mt-1">Strg+Enter zum Generieren</div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 py-4 justify-center text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              KI generiert Text...
            </div>
          )}

          {result && !loading && (
            <div className="relative">
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Vorschlag (nur Text — keine Preise/Mengen)
              </label>
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed" data-testid="ki-result-text">
                {result}
              </div>
              <button
                onClick={handleCopy}
                className="absolute top-7 right-2 p-1 rounded hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors"
                title="In Zwischenablage kopieren"
                data-testid="ki-copy-button"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={handleClose} data-testid="ki-cancel-button">
            Abbrechen
          </Button>
          {!result ? (
            <Button
              onClick={() => handleGenerate()}
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700"
              data-testid="ki-generate-button"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generieren...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {KI_MODES.find(m => m.id === mode)?.label || "Text generieren"}
                </>
              )}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => { setResult(""); }}
                data-testid="ki-retry-button"
              >
                Neu generieren
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onInsert(result, "append");
                  setPrompt("");
                  setResult("");
                  onClose();
                }}
                data-testid="ki-append-button"
              >
                Anfügen
              </Button>
              <Button
                onClick={() => {
                  onInsert(result, "replace");
                  setPrompt("");
                  setResult("");
                  onClose();
                }}
                className="bg-violet-600 hover:bg-violet-700"
                data-testid="ki-replace-button"
              >
                Ersetzen
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
