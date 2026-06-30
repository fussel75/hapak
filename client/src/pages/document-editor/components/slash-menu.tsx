import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  FileText,
  Heading,
  Layers,
  SeparatorHorizontal,
  Calculator,
  Sparkles,
  Type,
  BookOpen,
  Wrench,
  Package,
  ShieldQuestion,
  ArrowLeftRight,
} from "lucide-react";

export interface SlashMenuItem {
  id: string;
  label: string;
  shortcut: string;
  icon: typeof FileText;
  description: string;
  group: string;
}

const SLASH_ITEMS: SlashMenuItem[] = [
  { id: "leistung", label: "Position", shortcut: "/position", icon: FileText, description: "Normale Leistungsposition", group: "Positionen" },
  { id: "material", label: "Materialposition", shortcut: "/material", icon: Package, description: "Material aus dem Stamm einfuegen", group: "Positionen" },
  { id: "lohn", label: "Lohnposition", shortcut: "/lohn", icon: Wrench, description: "Lohnposition einfuegen", group: "Positionen" },
  { id: "bedarf", label: "Bedarfsposition", shortcut: "/bedarf", icon: ShieldQuestion, description: "Bedarfsposition (optional)", group: "Positionen" },
  { id: "alternative", label: "Alternativposition", shortcut: "/alternative", icon: ArrowLeftRight, description: "Alternative zur letzten Position", group: "Positionen" },
  { id: "jumbo", label: "Jumboposition", shortcut: "/jumbo", icon: Layers, description: "Sammelposition mit Unterpositionen", group: "Positionen" },
  { id: "manuell", label: "Manuelle Position", shortcut: "/man", icon: Wrench, description: "Freie Position ohne Preisberechnung", group: "Positionen" },
  { id: "titel", label: "Titel", shortcut: "/titel", icon: Heading, description: "Titelzeile als Gliederung", group: "Struktur" },
  { id: "freitext", label: "Freitext", shortcut: "/text", icon: Type, description: "Textblock ohne Bepreisung", group: "Struktur" },
  { id: "floskel", label: "Textbaustein", shortcut: "/floskel", icon: BookOpen, description: "Vorgefertigten Textbaustein einfügen", group: "Struktur" },
  { id: "trennlinie", label: "Trennlinie", shortcut: "/linie", icon: SeparatorHorizontal, description: "Horizontale Trennlinie", group: "Struktur" },
  { id: "zwischensumme", label: "Zwischensumme", shortcut: "/zs", icon: Calculator, description: "Zwischensumme bis hierher", group: "Summen" },
  { id: "ki", label: "KI-Positionstext", shortcut: "/ki", icon: Sparkles, description: "Text per KI generieren lassen", group: "KI" },
];

interface SlashMenuProps {
  visible: boolean;
  filter: string;
  anchorRect: DOMRect | null;
  onSelect: (item: SlashMenuItem) => void;
  onClose: () => void;
}

export const SlashMenu = memo(function SlashMenu({ visible, filter, anchorRect, onSelect, onClose }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const filtered = SLASH_ITEMS.filter((item) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.shortcut.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [visible, filtered, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (!visible) return;
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [visible, handleKeyDown]);

  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible, onClose]);

  if (!visible || filtered.length === 0) return null;

  const top = anchorRect ? anchorRect.bottom + 4 : 0;
  const left = anchorRect ? anchorRect.left : 0;

  let lastGroup = "";

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-[280px] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
      style={{ top: `${top}px`, left: `${left}px`, maxHeight: "320px" }}
      data-testid="slash-menu"
    >
      <div className="overflow-y-auto max-h-[316px]">
        {filtered.map((item, idx) => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          const Icon = item.icon;
          return (
            <div key={item.id}>
              {showGroup && (
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                  {item.group}
                </div>
              )}
              <button
                ref={(el) => { itemRefs.current[idx] = el; }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  idx === selectedIndex ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                }`}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                data-testid={`slash-item-${item.id}`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${idx === selectedIndex ? "text-blue-500" : "text-gray-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{item.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{item.shortcut}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">{item.description}</div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export { SLASH_ITEMS };
