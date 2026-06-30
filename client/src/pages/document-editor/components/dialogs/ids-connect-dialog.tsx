import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  const [tab, setTab] = useState<"warenkorb" | "suche">("warenkorb");
  const [xmlUrl, setXmlUrl] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [articles, setArticles] = useState<IdsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      setXmlUrl("");
      setSearchTerm("");
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
        const articles = doc.querySelectorAll("ARTICLE, article");
        articles.forEach((a) => {
          const desc =
            a.querySelector("DESCRIPTION_SHORT")?.textContent ||
            a.querySelector("ARTICLE_ID")?.textContent ||
            "Artikel";
          const artNr =
            a.querySelector("SUPPLIER_AID, ARTICLE_ID")?.textContent || "";
          const price = parseFloat(
            a.querySelector("PRICE_AMOUNT")?.textContent || "0",
          );
          const unit = a.querySelector("ORDER_UNIT")?.textContent || "Stk";
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
      if (parsed.length === 0)
        throw new Error(
          "Keine Artikel gefunden — prüfe ob die URL ein gültiges IDS/OpenTrans-XML enthält",
        );
      setArticles(parsed);
      setSelected(new Set(parsed.map((_, i) => i)));
    } catch (e: any) {
      setError(e.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    const toInsert = articles.filter((_, i) => selected.has(i));
    onInsert(toInsert, parentJumboIndex);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-blue-600 font-bold">IDS</span> Connect — GC
            Großhandel
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b pb-0">
          {[
            ["warenkorb", "🛒 Warenkorb importieren"],
            ["suche", "🔍 Artikel suchen"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${tab === k ? "border-blue-500 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              onClick={() => setTab(k as any)}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "warenkorb" && (
          <div className="space-y-3 flex-1 overflow-y-auto">
            <div className="bg-blue-50 rounded-lg p-3 space-y-2">
              <div className="font-semibold text-xs text-blue-800">
                Schritt 1: Warenkorb im GC-Shop befüllen
              </div>
              <div className="text-xs text-blue-700">
                Öffne den GC-Online-Shop, füge Artikel in den Warenkorb und
                klicke dort auf „IDS-Übergabe" oder „Warenkorb übergeben".
              </div>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700"
                onClick={() => window.open(gcShopUrl, "_blank")}
              >
                <span>🌐</span> GC-Online-Shop öffnen
              </Button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="font-semibold text-xs text-gray-700">
                Schritt 2: IDS-XML-URL einfügen
              </div>
              <div className="text-xs text-gray-500">
                Nach der IDS-Übergabe im Shop erhältst du eine URL. Kopiere sie
                hier rein:
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-7 text-xs flex-1 font-mono"
                  placeholder="https://www.gc-online.de/ids/warenkorb?token=..."
                  value={xmlUrl}
                  onChange={(e) => setXmlUrl(e.target.value)}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs shrink-0"
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
                <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                  {error}
                </div>
              )}
            </div>

            {articles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs">
                    {articles.length} Artikel im Warenkorb
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-[11px] text-blue-600 hover:underline"
                      onClick={() =>
                        setSelected(new Set(articles.map((_, i) => i)))
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
                <div className="border rounded-md divide-y max-h-[240px] overflow-y-auto">
                  {articles.map((a, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-3 px-3 py-2 text-xs cursor-pointer ${selected.has(i) ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 shrink-0"
                        checked={selected.has(i)}
                        onChange={(e) => {
                          const s = new Set(selected);
                          e.target.checked ? s.add(i) : s.delete(i);
                          setSelected(s);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {a.bezeichnung}
                        </div>
                        <div className="text-muted-foreground font-mono">
                          {a.artikelnummer}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono">
                          {a.menge} {a.einheit} × {fmtCurrency(a.einzelpreis)}
                        </div>
                        <div className="font-bold font-mono">
                          {fmtCurrency(a.gesamtpreis)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="text-xs text-right text-muted-foreground">
                  Gesamt:{" "}
                  <span className="font-bold font-mono">
                    {fmtCurrency(
                      articles
                        .filter((_, i) => selected.has(i))
                        .reduce((s, a) => s + a.gesamtpreis, 0),
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "suche" && (
          <div className="space-y-3 flex-1 overflow-y-auto">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              <div className="font-semibold mb-1">
                GC Direktsuche — in Entwicklung
              </div>
              <div>
                Die direkte Artikelsuche über die GC-API wird in einer nächsten
                Version verfügbar sein. Nutze bitte vorerst den Warenkorb-Import
                über den GC-Online-Shop.
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                className="h-7 text-xs flex-1"
                placeholder="Artikelbezeichnung oder -nummer suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled
              />
              <Button size="sm" className="h-7 text-xs" disabled>
                Suchen
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={selected.size === 0 || articles.length === 0}
            onClick={handleInsert}
          >
            {selected.size} Artikel übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
