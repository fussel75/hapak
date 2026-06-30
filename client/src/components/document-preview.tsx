import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { fmtDocNumber } from "@/lib/format";
import { buildPrintPayload } from "@/lib/build-print-payload";
import { documentTypeLabels } from "@shared/schema";
import {
  X, Download, Printer as PrinterIcon, Mail, Loader2,
  ZoomIn, ZoomOut,
} from "lucide-react";

interface DocumentPreviewProps {
  docForm: {
    type: string;
    documentNumber: string;
    date: string;
    validUntil: string;
    subject: string;
    headerText: string;
    footerText: string;
    beforeWorkText: string;
    beforeTotalsText: string;
    afterTotalsText: string;
    taxRate: string;
    paymentTermDays: number;
    skontoDays: number;
    skontoPercent: string;
    customTypeLabel?: string | null;
    retentionPercent?: string;
    parentDocumentId?: number | null;
    abschlagNumber?: number | null;
    netTotal?: string;
    taxAmount?: string;
    grossTotal?: string;
    laborTotal?: string;
    previouslyInvoiced?: string;
    dezimalstellenMengen?: number;
    dezimalstellenPreise?: number;
    hideNetto?: boolean;
    hideMwst?: boolean;
    hideGesamt?: boolean;
    showLohnanteil?: boolean;
    [key: string]: any;
  };
  items: any[];
  customer?: any;
  company?: any;
  documentId?: number;
  formTemplateId?: number | null;
  projectId?: number | null;
  onClose: () => void;
  onEmail?: () => void;
  overrideTotals?: { netTotal: number; taxAmount: number; grossTotal: number };
  abschlaege?: any[];
  displayMode?: string;
}

export default function DocumentPreview({
  docForm,
  items,
  customer,
  documentId,
  formTemplateId,
  projectId,
  onClose,
  onEmail,
  displayMode,
}: DocumentPreviewProps) {
  const typeLabel = docForm.customTypeLabel || documentTypeLabels[docForm.type] || docForm.type;
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const payload = buildPrintPayload({
      docForm,
      items,
      customer,
      documentId,
      formTemplateId,
      projectId,
      displayMode,
    });

    fetch("/api/documents/preview-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
      signal: abortController.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Token-Erstellung fehlgeschlagen (${res.status})`);
        return res.json();
      })
      .then(({ token }) => {
        setPrintUrl(`/print?token=${token}`);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message || "Vorschau konnte nicht geladen werden.");
        setLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [docForm, items, customer, documentId, formTemplateId, projectId, displayMode]);

  const handleDownloadPdf = useCallback(async () => {
    if (pdfDownloading) return;
    setPdfDownloading(true);
    try {
      const payload = buildPrintPayload({
        docForm,
        items,
        customer,
        documentId,
        formTemplateId,
        projectId,
        displayMode,
      });
      const res = await fetch("/api/documents/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("PDF-Download fehlgeschlagen");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${typeLabel}_${fmtDocNumber(docForm.documentNumber) || "vorschau"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err: any) {
      console.error("PDF download error:", err);
    } finally {
      setPdfDownloading(false);
    }
  }, [docForm, items, customer, documentId, formTemplateId, projectId, displayMode, typeLabel, pdfDownloading]);

  const handlePrint = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      id="print-preview-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "#525659",
        display: "flex",
        flexDirection: "column",
      }}
      data-testid="overlay-preview"
    >
      <div
        className="no-print"
        style={{
          background: "#333",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>
          Druckvorschau — {typeLabel} {docForm.documentNumber ? `Nr. ${fmtDocNumber(docForm.documentNumber)}` : ""}
        </span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "white", fontSize: "12px", marginRight: "8px" }}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20 ml-2" onClick={() => setZoom(z => Math.min(2, z + 0.15))} data-testid="button-zoom-in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} data-testid="button-zoom-out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs ml-1">{Math.round(zoom * 100)}%</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={handleDownloadPdf}
            disabled={pdfDownloading}
            data-testid="button-preview-download"
          >
            {pdfDownloading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
            PDF herunterladen
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={handlePrint}
            disabled={!printUrl}
            data-testid="button-preview-print"
          >
            <PrinterIcon className="h-3 w-3 mr-1" />
            Drucken
          </Button>
          {onEmail && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={onEmail}
              data-testid="button-preview-email"
            >
              <Mail className="h-3 w-3 mr-1" />
              Per E-Mail senden
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
            data-testid="button-preview-close"
          >
            <X className="h-3 w-3 mr-1" />
            Schließen
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", padding: "20px 0" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "white", gap: "12px" }}>
            <Loader2 className="h-6 w-6 animate-spin" />
            <span style={{ fontSize: "16px" }}>Vorschau wird geladen…</span>
          </div>
        )}

        {error && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#f87171", fontSize: "16px" }}>
            {error}
          </div>
        )}

        {!loading && !error && printUrl && (
          <div style={{
            width: `${Math.round(210 * zoom)}mm`,
            height: "100%",
            overflow: "hidden",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}>
            <iframe
              ref={iframeRef}
              src={printUrl}
              title="Druckvorschau"
              style={{
                border: "none",
                background: "white",
                width: "210mm",
                height: `${Math.round(100 / zoom)}%`,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
              data-testid="iframe-html-preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}
