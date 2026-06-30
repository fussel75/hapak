import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Undo,
  Redo,
  RemoveFormatting,
  ImagePlus,
  Table as TableIcon,
  Palette,
  Type,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import { useEffect, useCallback, useRef, useState } from "react";

function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (text.includes("<p>") || text.includes("<br>") || text.includes("<strong>") || text.includes("<ul>") || text.includes("<ol>") || text.includes("<table>")) {
    return text;
  }
  return text
    .split("\n")
    .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") || "<br>"}</p>`)
    .join("");
}

const FONT_SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24"];
const COLORS = [
  { label: "Schwarz", value: "#000000" },
  { label: "Dunkelgrau", value: "#4a4a4a" },
  { label: "Grau", value: "#9b9b9b" },
  { label: "Rot", value: "#d0021b" },
  { label: "Dunkelrot", value: "#8b0000" },
  { label: "Orange", value: "#f5a623" },
  { label: "Blau", value: "#0000ff" },
  { label: "Dunkelblau", value: "#003399" },
  { label: "Grün", value: "#417505" },
  { label: "Lila", value: "#7b2d8e" },
];

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({ active, disabled, onClick, children, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-blue-100 text-blue-700 border border-blue-300"
          : "hover:bg-gray-100 text-gray-600 border border-transparent"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={`toolbar-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />;
}

const FontSizeExtension = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize?.replace("pt", "") || null,
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}pt` };
        },
      },
    };
  },
});

interface VortextEditDialogProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onSave: (html: string) => void;
  workAreaWidthPt?: number;
}

export function VortextEditDialog({ open, onClose, value, onSave, workAreaWidthPt }: VortextEditDialogProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Underline,
      FontSizeExtension,
      Color,
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: plainTextToHtml(value),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[400px] p-4 outline-none focus:outline-none border rounded-b border-gray-200 bg-white overflow-y-auto",
        "data-testid": "vortext-rich-editor",
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith("image/")) {
              event.preventDefault();
              const file = items[i].getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const src = e.target?.result as string;
                  view.dispatch(view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src })
                  ));
                };
                reader.readAsDataURL(file);
              }
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && open) {
      editor.commands.setContent(plainTextToHtml(value));
      setTimeout(() => editor.commands.focus("end"), 100);
    }
  }, [open, value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setShowColorPicker(false);
      if (sizeRef.current && !sizeRef.current.contains(e.target as Node)) setShowFontSize(false);
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setShowTableMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSave = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    onSave(html);
    onClose();
  }, [editor, onSave, onClose]);

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [editor]);

  const setFontSize = useCallback((size: string) => {
    if (!editor) return;
    editor.chain().focus().setMark("textStyle", { fontSize: size }).run();
    setShowFontSize(false);
  }, [editor]);

  const setColor = useCallback((color: string) => {
    if (!editor) return;
    editor.chain().focus().setColor(color).run();
    setShowColorPicker(false);
  }, [editor]);

  const currentColor = editor?.getAttributes("textStyle")?.color || "#000000";
  const currentFontSize = editor?.getAttributes("textStyle")?.fontSize || "11";

  if (!editor) return null;

  const dialogWidthPx = 810;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[85vh] flex flex-col"
        style={dialogWidthPx ? { maxWidth: `${dialogWidthPx}px`, width: `${dialogWidthPx}px` } : { maxWidth: "56rem" }}
      >
        <DialogHeader>
          <DialogTitle>Vortext bearbeiten</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-0.5 px-2 py-1.5 border border-b-0 border-gray-200 rounded-t bg-gray-50 flex-wrap">
            <div className="relative" ref={sizeRef}>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-transparent hover:bg-gray-100 cursor-pointer"
                onClick={() => { setShowFontSize(!showFontSize); setShowColorPicker(false); setShowTableMenu(false); }}
                title="Schriftgröße"
                data-testid="toolbar-font-size"
              >
                <Type size={14} />
                <span className="font-mono min-w-[18px] text-center">{currentFontSize}</span>
              </button>
              {showFontSize && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 py-1 min-w-[60px]">
                  {FONT_SIZES.map((s) => (
                    <button
                      key={s}
                      className={`block w-full text-left px-3 py-1 text-xs hover:bg-blue-50 cursor-pointer ${s === currentFontSize ? "bg-blue-100 font-bold" : ""}`}
                      onClick={() => setFontSize(s)}
                      data-testid={`font-size-${s}`}
                    >
                      {s} pt
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" ref={colorRef}>
              <button
                type="button"
                className="flex items-center gap-1 px-1.5 py-1.5 rounded border border-transparent hover:bg-gray-100 cursor-pointer"
                onClick={() => { setShowColorPicker(!showColorPicker); setShowFontSize(false); setShowTableMenu(false); }}
                title="Schriftfarbe"
                data-testid="toolbar-font-color"
              >
                <Palette size={16} />
                <div className="w-4 h-1 rounded-sm" style={{ backgroundColor: currentColor }} />
              </button>
              {showColorPicker && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 p-2 grid grid-cols-5 gap-1 min-w-[140px]">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      className={`w-6 h-6 rounded border cursor-pointer hover:scale-110 transition-transform ${currentColor === c.value ? "ring-2 ring-blue-500" : "border-gray-300"}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setColor(c.value)}
                      title={c.label}
                      data-testid={`color-${c.label.toLowerCase()}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <ToolbarSeparator />

            <ToolbarButton
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Fett"
            >
              <Bold size={16} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Kursiv"
            >
              <Italic size={16} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("underline")}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title="Unterstrichen"
            >
              <UnderlineIcon size={16} />
            </ToolbarButton>

            <ToolbarSeparator />

            <ToolbarButton
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Aufzählung"
            >
              <List size={16} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Nummerierte Liste"
            >
              <ListOrdered size={16} />
            </ToolbarButton>

            <ToolbarSeparator />

            <div className="relative" ref={tableRef}>
              <ToolbarButton
                active={editor.isActive("table")}
                onClick={() => { setShowTableMenu(!showTableMenu); setShowColorPicker(false); setShowFontSize(false); }}
                title="Tabelle"
              >
                <TableIcon size={16} />
              </ToolbarButton>
              {showTableMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 py-1 min-w-[180px]">
                  <button
                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
                    onClick={() => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setShowTableMenu(false); }}
                    data-testid="insert-table"
                  >
                    <Plus size={14} /> Tabelle einfügen (3×3)
                  </button>
                  {editor.isActive("table") && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
                        onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }}
                      >
                        <Plus size={14} /> Spalte rechts
                      </button>
                      <button
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
                        onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false); }}
                      >
                        <Plus size={14} /> Zeile unten
                      </button>
                      <button
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
                        onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false); }}
                      >
                        <Minus size={14} /> Spalte löschen
                      </button>
                      <button
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
                        onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false); }}
                      >
                        <Minus size={14} /> Zeile löschen
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 cursor-pointer"
                        onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false); }}
                      >
                        <Trash2 size={14} /> Tabelle löschen
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <ToolbarButton
              onClick={handleImageUpload}
              title="Bild einfügen"
            >
              <ImagePlus size={16} />
            </ToolbarButton>

            <ToolbarSeparator />

            <ToolbarButton
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
              title="Formatierung entfernen"
            >
              <RemoveFormatting size={16} />
            </ToolbarButton>

            <ToolbarSeparator />

            <ToolbarButton
              disabled={!editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}
              title="Rückgängig"
            >
              <Undo size={16} />
            </ToolbarButton>
            <ToolbarButton
              disabled={!editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}
              title="Wiederholen"
            >
              <Redo size={16} />
            </ToolbarButton>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[55vh]">
            <EditorContent editor={editor} />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-image-upload"
        />

        <DialogFooter>
          <button
            className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
            onClick={onClose}
            data-testid="button-vortext-cancel"
          >
            Abbrechen
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={handleSave}
            data-testid="button-vortext-save"
          >
            Übernehmen
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
