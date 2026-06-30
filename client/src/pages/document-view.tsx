import { useQuery } from "@tanstack/react-query";
import type { Document, Customer, DocumentItem, CompanySettings, BankAccount } from "@shared/schema";
import { documentTypeLabels, documentStatusLabels } from "@shared/schema";
import { normalizeDocumentTypeLabel } from "@shared/document-engine/document-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Pencil, Printer, FileText, Lock } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useRef, useState, useEffect, useCallback } from "react";
import { fmtCurrency, fmtDate, fmtNumber, fmtPercent, fmtDocNumber, fmtQty } from "@/lib/format";
import { textToSafeHtml } from "@/lib/safe-html";

const statusColors: Record<string, string> = {
  entwurf: "bg-gray-500", gesendet: "bg-blue-500", beauftragt: "bg-emerald-500",
  bezahlt: "bg-green-600", teilbezahlt: "bg-amber-500", abgelehnt: "bg-red-500",
  storniert: "bg-red-600", archiviert: "bg-slate-500",
};

export default function DocumentViewPage() {
  const params = useParams<{ id: string }>();
  const docId = parseInt(params.id);
  const [, setLocation] = useLocation();

  const { data: doc, isLoading: docLoading } = useQuery<Document>({ queryKey: ["/api/documents", docId] });
  const { data: items } = useQuery<DocumentItem[]>({ queryKey: ["/api/documents", docId, "items"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: settings } = useQuery<CompanySettings | null>({ queryKey: ["/api/company-settings"] });
  const { data: bankAccounts } = useQuery<BankAccount[]>({ queryKey: ["/api/bank-accounts"] });
  const { data: lockStatus } = useQuery<{ locked: boolean; lock: { userId: number; fullName: string; username: string } | null }>({
    queryKey: ["/api/documents", docId, "lock-status"],
    refetchInterval: 30000,
  });

  const a4ContainerRef = useRef<HTMLDivElement>(null);
  const a4PageRef = useRef<HTMLDivElement>(null);
  const [mobileScale, setMobileScale] = useState(1);

  const updateScale = useCallback(() => {
    const container = a4ContainerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    const a4Width = 794;
    if (containerWidth < a4Width) {
      setMobileScale(containerWidth / a4Width);
    } else {
      setMobileScale(1);
    }
  }, []);

  useEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (a4ContainerRef.current) ro.observe(a4ContainerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  const customer = customers?.find((c) => c.id === doc?.customerId);
  const isLockedByOther = lockStatus?.locked && lockStatus.lock;
  const defaultBank = bankAccounts?.find(b => b.isDefault) || bankAccounts?.[0];

  if (docLoading) return <div className="p-6"><Skeleton className="h-[800px] w-full max-w-[210mm] mx-auto" /></div>;
  if (!doc) return <div className="p-6 text-center text-muted-foreground">Dokument nicht gefunden</div>;

  const typeLabel = normalizeDocumentTypeLabel((doc as any).customTypeLabel, documentTypeLabels[doc.type] || doc.type);

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 p-2 sm:p-4 md:p-8">
      <div className="max-w-[220mm] mx-auto space-y-4">
        <div className="flex items-center justify-between print:hidden flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/dokumente")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />Zurück
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.open(`/api/documents/${doc.id}/pdf`, "_blank")} data-testid="button-pdf">
              <FileText className="h-4 w-4 mr-2" />PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()} data-testid="button-print">
              <Printer className="h-4 w-4 mr-2" />Drucken
            </Button>
            {isLockedByOther ? (
              <Button size="sm" variant="secondary" disabled data-testid="button-edit-locked">
                <Lock className="h-4 w-4 mr-2" />Gesperrt
              </Button>
            ) : (
              <Button size="sm" onClick={() => setLocation(`/dokumente/${doc.id}/bearbeiten`)} data-testid="button-edit">
                <Pencil className="h-4 w-4 mr-2" />Bearbeiten
              </Button>
            )}
          </div>
        </div>

        {isLockedByOther && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 print:hidden">
            <Lock className="h-5 w-5 text-amber-600" />
            <AlertDescription className="ml-2">
              <span className="font-semibold text-amber-800 dark:text-amber-300" data-testid="text-view-lock-info">
                Wird bearbeitet von: {lockStatus.lock!.fullName || lockStatus.lock!.username}
              </span>
            </AlertDescription>
          </Alert>
        )}

        <div ref={a4ContainerRef} className="overflow-hidden print:overflow-visible" style={{ margin: "0 auto" }}>
          <div
            ref={a4PageRef}
            className="bg-white dark:bg-gray-950 shadow-xl rounded-sm print:shadow-none"
            style={{
              width: "210mm",
              minHeight: "297mm",
              transformOrigin: "top left",
              ...(mobileScale < 1 ? { transform: `scale(${mobileScale})`, marginBottom: `calc((${mobileScale} - 1) * 297mm)` } : {}),
            }}
          >
          <div className="relative" style={{ padding: "15mm 20mm 20mm 20mm" }}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {settings?.companyName || "FriStD-Bau ZuB GmbH & Co.KG"}
                </h2>
                {settings?.companyName2 && (
                  <p className="text-sm text-gray-500">{settings.companyName2}</p>
                )}
              </div>
              <Badge className={`${statusColors[doc.status] || "bg-gray-500"} text-white text-xs print:hidden`}>
                {documentStatusLabels[doc.status] || doc.status}
              </Badge>
            </div>

            <p className="text-[9px] text-gray-400 border-b border-gray-300 pb-1 mb-6 tracking-wide">
              {settings?.companyName || "FriStD-Bau ZuB GmbH & Co.KG"} · {settings?.street || "Haldesdorfer Str. 44"} · {settings?.zip || "22179"} {settings?.city || "Hamburg"}
            </p>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                {customer && (
                  <div className="text-sm leading-relaxed">
                    {customer.salutation && <p>{customer.salutation}</p>}
                    <p className="font-semibold">{customer.name}</p>
                    {customer.name2 && <p>{customer.name2}</p>}
                    {customer.street && <p>{customer.street}</p>}
                    <p>{customer.zip} {customer.city}</p>
                  </div>
                )}
              </div>
              <div className="text-right text-sm space-y-1">
                <table className="ml-auto text-sm">
                  <tbody>
                    <tr>
                      <td className="text-gray-500 pr-4 text-right">Datum:</td>
                      <td className="font-medium">{fmtDate(doc.date)}</td>
                    </tr>
                    <tr>
                      <td className="text-gray-500 pr-4 text-right">{typeLabel}-Nr.:</td>
                      <td className="font-mono font-semibold">{fmtDocNumber(doc.documentNumber)}</td>
                    </tr>
                    {doc.validUntil && (
                      <tr>
                        <td className="text-gray-500 pr-4 text-right">Gültig bis:</td>
                        <td>{fmtDate(doc.validUntil)}</td>
                      </tr>
                    )}
                    {customer?.customerNumber && (
                      <tr>
                        <td className="text-gray-500 pr-4 text-right">Kunden-Nr.:</td>
                        <td className="font-mono">{customer.customerNumber}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <h1 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">
              {typeLabel}
            </h1>

            {doc.subject && (
              <p className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
                {doc.subject}
              </p>
            )}

            {(doc.beforeWorkText || doc.headerText) && (
              <div className="text-sm leading-relaxed mb-6 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {doc.beforeWorkText || doc.headerText}
              </div>
            )}

            {items && items.length > 0 && (
              <table className="w-full text-sm mb-6 border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-800 dark:border-gray-200">
                    <th className="text-left py-2 pr-2 w-14 font-semibold">Pos.</th>
                    <th className="text-left py-2 font-semibold">Bezeichnung</th>
                    <th className="text-right py-2 w-20 font-semibold">Menge</th>
                    <th className="text-right py-2 w-12 font-semibold">ME</th>
                    <th className="text-right py-2 w-24 font-semibold">EP</th>
                    <th className="text-right py-2 w-24 font-semibold">GP</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(item => item.type !== "abschluss" && item.type !== "nettosumme" && item.type !== "gesamtsumme" && item.type !== "skonto" && !item.afterTotals).map((item) => {
                    const isTitle = item.type === "titel" || item.type === "gruppe";
                    const isText = item.type === "text" || item.type === "freitext" || item.type === "floskel";
                    const isSum = item.type === "titelsumme" || item.type === "abschluss" || item.type === "zwischensumme";
                    const hasValues = parseFloat(item.quantity || "0") > 0 || parseFloat(item.unitPrice || "0") > 0;

                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-gray-200 dark:border-gray-700 ${isTitle ? "bg-gray-50 dark:bg-gray-900" : ""} ${isSum ? "border-t-2 border-gray-400" : ""}`}
                        data-testid={`view-item-${item.id}`}
                      >
                        <td className={`py-2 pr-2 align-top ${isTitle ? "font-bold" : "text-gray-600"}`}>
                          {item.positionNumber}
                        </td>
                        <td className={`py-2 align-top ${isTitle ? "font-bold" : ""}`}>
                          <div dangerouslySetInnerHTML={{ __html: textToSafeHtml(item.title) }} />
                          {item.description && item.description !== item.title && (
                            <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: textToSafeHtml(item.description) }} />
                          )}
                        </td>
                        <td className="text-right py-2 align-top tabular-nums">
                          {hasValues && !isTitle && !isText && !isSum ? fmtQty(item.quantity, 2) : ""}
                        </td>
                        <td className="text-right py-2 align-top text-gray-600">
                          {hasValues && !isTitle && !isText && !isSum ? item.unit : ""}
                        </td>
                        <td className="text-right py-2 align-top tabular-nums">
                          {hasValues && !isTitle && !isText && !isSum ? fmtCurrency(item.unitPrice) : ""}
                        </td>
                        <td className={`text-right py-2 align-top tabular-nums ${isSum ? "font-bold" : ""}`}>
                          {(hasValues || isSum) && !isTitle && !isText && parseFloat(item.totalPrice || "0") !== 0
                            ? fmtCurrency(item.totalPrice) : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className="border-t-2 border-gray-800 dark:border-gray-200 pt-3 mb-6">
              <table className="ml-auto text-sm" style={{ width: "250px" }}>
                <tbody>
                  <tr>
                    <td className="py-1 text-gray-600">Nettobetrag</td>
                    <td className="py-1 text-right tabular-nums font-medium">{fmtCurrency((doc as any).fibuNetto ?? doc.netTotal)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">MwSt. {fmtNumber(doc.taxRate)}%</td>
                    <td className="py-1 text-right tabular-nums">{fmtCurrency(
                      (doc as any).fibuNetto != null
                        ? (parseFloat((doc as any).fibuNetto) * parseFloat(String(doc.taxRate || "19")) / 100).toFixed(2)
                        : doc.taxAmount
                    )}</td>
                  </tr>
                  <tr className="border-t-2 border-gray-800 dark:border-gray-200">
                    <td className="py-2 text-xs text-muted-foreground">Bruttobetrag</td>
                    <td className="py-2 text-right tabular-nums text-xs text-muted-foreground" data-testid="text-view-gross">{fmtCurrency((doc as any).fibuBrutto ?? doc.grossTotal)}</td>
                  </tr>
                  {doc.laborTotal && parseFloat(doc.laborTotal) > 0 && (
                    <tr>
                      <td className="py-1 text-xs text-gray-500" colSpan={2}>
                        Enthaltener Lohnanteil gem. §35a EStG: {fmtCurrency(doc.laborTotal)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {(doc.beforeTotalsText || doc.footerText) && (
              <div className="text-sm leading-relaxed mb-4 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {doc.beforeTotalsText || doc.footerText}
              </div>
            )}

            {doc.afterTotalsText && (
              <div className="text-sm leading-relaxed mb-8 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {doc.afterTotalsText}
              </div>
            )}

            {(doc.paymentTermDays || doc.skontoPercent) && (
              <div className="text-xs text-gray-500 mb-8 leading-relaxed">
                {doc.paymentTermDays && (
                  <p>Zahlbar innerhalb von {doc.paymentTermDays} Tagen nach Rechnungsdatum.</p>
                )}
                {doc.skontoPercent && parseFloat(doc.skontoPercent) > 0 && (
                  <p>Bei Zahlung innerhalb von {doc.skontoDays} Tagen gewähren wir {fmtPercent(doc.skontoPercent)} Skonto.</p>
                )}
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 border-t border-gray-300 dark:border-gray-600" style={{ padding: "8mm 20mm 10mm 20mm" }}>
              <div className="grid grid-cols-3 gap-4 text-[9px] text-gray-500 leading-relaxed">
                <div>
                  <p className="font-semibold text-gray-700 dark:text-gray-300">{settings?.companyName || "FriStD-Bau ZuB GmbH & Co.KG"}</p>
                  <p>{settings?.street || "Haldesdorfer Str. 44"}</p>
                  <p>{settings?.zip || "22179"} {settings?.city || "Hamburg"}</p>
                  {settings?.managingDirector && <p>GF: {settings.managingDirector}</p>}
                </div>
                <div>
                  {settings?.phone && <p>Tel: {settings.phone}</p>}
                  {settings?.email && <p>E-Mail: {settings.email}</p>}
                  {settings?.website && <p>Web: {settings.website}</p>}
                  {settings?.taxId && <p>St.-Nr.: {settings.taxId}</p>}
                  {settings?.vatId && <p>USt-ID: {settings.vatId}</p>}
                </div>
                <div>
                  {defaultBank && (
                    <>
                      <p className="font-semibold text-gray-700 dark:text-gray-300">{defaultBank.bankName}</p>
                      <p>IBAN: {defaultBank.iban}</p>
                      {defaultBank.bic && <p>BIC: {defaultBank.bic}</p>}
                    </>
                  )}
                  {settings?.tradeRegister && <p>HRA: {settings.tradeRegister}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
