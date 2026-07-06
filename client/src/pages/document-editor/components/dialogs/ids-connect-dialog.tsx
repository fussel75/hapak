import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { fmtCurrency } from "@/lib/format";
import type { IdsArticle } from "../../types";

export function IdsConnectDialog({
  open,
  onClose,
  onInsert,
  parentJumboIndex,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (articles: IdsArticle[], parentJumboIndex?: number) => void;
  parentJumboIndex?: number;
}) {
  const [xmlUrl, setXmlUrl] = useState("");
  const [articles, setArticles] = useState<IdsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      setXmlUrl("");
      setArticles([]);
      setError("");
      setSelected(new Set());
    }
  }, [open]);

  const gcShopUrl = "https://www.gc-online.de";

  const parseIdsXml = (xmlText: string): IdsArticle[] => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, "text/xml");
      const items: IdsArticle[] = [];
      const orderItems = doc.querySelectorAll("ORDER_ITEM, ITEM");

      orderItems.forEach((item) => {
        const qty = parseFloat(
          item.querySelector("QUANTITY, ITEM_ORDER_QUANTITY")?.textContent ||
            "1",
        );
        const price = parseFloat(
          item.querySelector("PRICE_AMOUNT, UNIT_PRICE")?.textContent || "0",
        );
        const desc =
          item.querySelector("DESCRIPTION_SHORT, ITEM_DESCR")?.textContent ||
          item.querySelector("PRODUCT_ID, ARTICLE_ID")?.textContent ||
          "Artikel";
        const artNr =
          item.querySelector("SUPPLIER_PID, ARTICLE_ID")?.textContent || "";
        const unit =
          item.querySelector("ORDER_UNIT, UNIT")?.textContent || "Stk";

        items.push({
          artikelnummer: artNr,
          bezeichnung: desc,
          menge: qty,
          einheit: unit,
          einzelpreis: price,
          gesamtpreis: price * qty,
          lieferant: "GC",
        });
      });

      if (items.length === 0) {
        const catalogArticles = doc.querySelectorAll("ARTICLE, article");
        catalogArticles.forEach((article) => {
          const desc =
            article.querySelector("DESCRIPTION_SHORT")?.textContent ||
            article.querySelector("ARTICLE_ID")?.textContent ||
            "Artikel";
          const artNr =
            article.querySelector("SUPPLIER_AID, ARTICLE_ID")?.textContent ||
            "";
          const price = parseFloat(
            article.querySelector("PRICE_AMOUNT")?.textContent || "0",
          );
          const unit =
            article.querySelector("ORDER_UNIT")?.textContent || "Stk";

          items.push({
            artikelnummer: artNr,
            bezeichnung: desc,
            menge: 1,
            einheit: unit,
            einzelpreis: price,
            gesamtpreis: price,
            lieferant: "GC",
          });
        });
      }

      return items;
    } catch {
      return [];
    }
  };

  const loadFromUrl = async () => {
    if (!xmlUrl.trim()) return;

    setLoading(true);
    setError("");
    setArticles([]);

    try {
      const res = await fetch(
        `/api/proxy-fetch?url=${encodeURIComponent(xmlUrl)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const parsed = parseIdsXml(text);
      if (parsed.length === 0) {
        throw new Error(
          "Keine Artikel gefunden - pruefe, ob die URL ein gueltiges IDS/OpenTrans-XML enthaelt.",
        );
      }

      setArticles(parsed);
      setSelected(new Set(parsed.map((_, index) => index)));
    } catch (e: any) {
      setError(e.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    const toInsert = articles.filter((_, index) => selected.has(index));
    onInsert(toInsert, parentJumboIndex);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-bold text-blue-600">IDS</span>
            Connect - GC Grosshandel
          </DialogTitle>
        </DialogHeader>

        <div className="border-b pb-2">
          <div className="text-xs font-semibold text-slate-700">
            Warenkorb importieren
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Importiert IDS/OpenTrans-Warenkoerbe aus dem GC-Online-Shop als
            Dokumentpositionen.
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto">
          <div className="space-y-2 rounded-lg bg-blue-50 p-3">
            <div className="text-xs font-semibold text-blue-800">
              Schritt 1: Warenkorb im GC-Shop befuellen
            </div>
            <div className="text-xs text-blue-700">
              Oeffne den GC-Online-Shop, fuege Artikel in den Warenkorb und
              klicke dort auf "IDS-Uebergabe" oder "Warenkorb uebergeben".
            </div>
            <Button
              size="sm"
              className="h-7 bg-blue-600 text-xs hover:bg-blue-700"
              onClick={() => window.open(gcShopUrl, "_blank")}
            >
              GC-Online-Shop oeffnen
            </Button>
          </div>

          <div className="space-y-2 rounded-lg bg-gray-50 p-3">
            <div className="text-xs font-semibold text-gray-700">
              Schritt 2: IDS-XML-URL einfuegen
            </div>
            <div className="text-xs text-gray-500">
              Nach der IDS-Uebergabe im Shop erhaeltst du eine URL. Kopiere sie
              hier rein:
            </div>
            <div className="flex gap-2">
              <Input
                className="h-7 flex-1 font-mono text-xs"
                placeholder="https://www.gc-online.de/ids/warenkorb?token=..."
                value={xmlUrl}
                onChange={(event) => setXmlUrl(event.target.value)}
              />
              <Button
                size="sm"
                className="h-7 shrink-0 text-xs"
                onClick={loadFromUrl}
                disabled={loading || !xmlUrl.trim()}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Laden"
                )}
              </Button>
            </div>
            {error && (
              <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">
                {error}
              </div>
            )}
          </div>

          {articles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">
                  {articles.length} Artikel im Warenkorb
                </div>
                <div className="flex gap-2">
                  <button
                    className="text-[11px] text-blue-600 hover:underline"
                    onClick={() =>
                      setSelected(new Set(articles.map((_, index) => index)))
                    }
                  >
                    Alle
                  </button>
                  <button
                    className="text-[11px] text-blue-600 hover:underline"
                    onClick={() => setSelected(new Set())}
                  >
                    Keine
                  </button>
                </div>
              </div>

              <div className="max-h-[240px] divide-y overflow-y-auto rounded-md border">
                {articles.map((article, index) => (
                  <label
                    key={index}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-xs ${
                      selected.has(index) ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={selected.has(index)}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(index);
                        else next.delete(index);
                        setSelected(next);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {article.bezeichnung}
                      </div>
                      <div className="font-mono text-muted-foreground">
                        {article.artikelnummer}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono">
                        {article.menge} {article.einheit} x{" "}
                        {fmtCurrency(article.einzelpreis)}
                      </div>
                      <div className="font-mono font-bold">
                        {fmtCurrency(article.gesamtpreis)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="text-right text-xs text-muted-foreground">
                Gesamt:{" "}
                <span className="font-mono font-bold">
                  {fmtCurrency(
                    articles
                      .filter((_, index) => selected.has(index))
                      .reduce((sum, article) => sum + article.gesamtpreis, 0),
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={selected.size === 0 || articles.length === 0}
            onClick={handleInsert}
          >
            {selected.size} Artikel uebernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
