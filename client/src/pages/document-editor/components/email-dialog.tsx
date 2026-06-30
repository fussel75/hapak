import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Send } from "lucide-react";

interface EmailForm {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  message: string;
  attachPdf: boolean;
}

interface EmailDialogProps {
  open: boolean;
  onClose: () => void;
  documentId: number | null | undefined;
  emailForm: EmailForm;
  setEmailForm: React.Dispatch<React.SetStateAction<EmailForm>>;
}

export function EmailDialog({ open, onClose, documentId, emailForm, setEmailForm }: EmailDialogProps) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Dokument per E-Mail senden</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {[
            ["An", "to"],
            ["CC", "cc"],
            ["BCC", "bcc"],
          ].map(([label, key]) => (
            <div key={key} className="flex items-center gap-2">
              <Label className="text-xs w-8">{label}</Label>
              <Input
                className="h-7 text-xs flex-1"
                value={(emailForm as any)[key]}
                onChange={(e) =>
                  setEmailForm((f) => ({ ...f, [key]: e.target.value }))
                }
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Label className="text-xs w-8">Betr.</Label>
            <Input
              className="h-7 text-xs flex-1"
              value={emailForm.subject}
              onChange={(e) =>
                setEmailForm((f) => ({ ...f, subject: e.target.value }))
              }
            />
          </div>
          <Textarea
            className="text-xs min-h-[80px] resize-y"
            placeholder="Nachricht..."
            value={emailForm.message}
            onChange={(e) =>
              setEmailForm((f) => ({ ...f, message: e.target.value }))
            }
          />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={emailForm.attachPdf}
              onChange={(e) =>
                setEmailForm((f) => ({ ...f, attachPdf: e.target.checked }))
              }
            />{" "}
            PDF anhängen
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={sending || !emailForm.to}
            onClick={async () => {
              setSending(true);
              try {
                await apiRequest(
                  "POST",
                  `/api/documents/${documentId}/send-email`,
                  emailForm,
                );
                toast({ title: "E-Mail gesendet" });
                onClose();
              } catch (e: any) {
                toast({
                  title: "Fehler",
                  description: e.message,
                  variant: "destructive",
                });
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
