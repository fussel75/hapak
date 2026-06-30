import { useRef, useCallback, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Superscript, Subscript, Paintbrush, Type, RemoveFormatting,
  ChevronDown, Palette, ImagePlus, Trash2,
} from "lucide-react";

const TEXT_COLORS = [
  { label: "Schwarz", value: "#000000" },
  { label: "Dunkelgrau", value: "#4B5563" },
  { label: "Grau", value: "#9CA3AF" },
  { label: "Rot", value: "#DC2626" },
  { label: "Dunkelrot", value: "#991B1B" },
  { label: "Orange", value: "#EA580C" },
  { label: "Gelb", value: "#CA8A04" },
  { label: "Grün", value: "#16A34A" },
  { label: "Dunkelgrün", value: "#166534" },
  { label: "Blau", value: "#2563EB" },
  { label: "Dunkelblau", value: "#1E3A8A" },
  { label: "Lila", value: "#7C3AED" },
];

const HIGHLIGHT_COLORS = [
  { label: "Keine", value: "transparent" },
  { label: "Gelb", value: "#FEF08A" },
  { label: "Grün", value: "#BBF7D0" },
  { label: "Blau", value: "#BFDBFE" },
  { label: "Rosa", value: "#FBCFE8" },
  { label: "Orange", value: "#FED7AA" },
  { label: "Lila", value: "#DDD6FE" },
  { label: "Rot", value: "#FECACA" },
];

const FONT_SIZES = [
  { label: "Klein", value: "1" },
  { label: "Normal", value: "3" },
  { label: "Groß", value: "5" },
  { label: "Sehr Groß", value: "7" },
];

const IMAGE_SIZES = [
  { label: "25%", value: 25 },
  { label: "50%", value: 50 },
  { label: "75%", value: 75 },
  { label: "100%", value: 100 },
];

function ColorPicker({
  colors,
  onSelect,
  icon,
  title,
}: {
  colors: { label: string; value: string }[];
  onSelect: (color: string) => void;
  icon: React.ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-0 h-6 px-1 rounded hover:bg-gray-200 text-gray-600"
        onMouseDown={(e) => { e.preventDefault(); setOpen(!open); }}
        title={title}
        data-testid={`button-${title.toLowerCase().replace(/\s/g, "-")}`}
      >
        {icon}
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-50 min-w-[140px]">
          <div className="text-[9px] text-gray-400 px-1 mb-1 font-semibold uppercase">{title}</div>
          <div className="grid grid-cols-4 gap-1">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: c.value === "transparent" ? "#fff" : c.value }}
                title={c.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(c.value);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FontSizePicker({ onSelect }: { onSelect: (size: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-0 h-6 px-1 rounded hover:bg-gray-200 text-gray-600"
        onMouseDown={(e) => { e.preventDefault(); setOpen(!open); }}
        title="Schriftgröße"
        data-testid="button-font-size"
      >
        <Type className="w-3.5 h-3.5" />
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 min-w-[100px]">
          {FONT_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              className="w-full text-left px-3 py-1 text-xs hover:bg-blue-50 hover:text-blue-700"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(s.value);
                setOpen(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  icon,
  title,
  active,
  onAction,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  onAction: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
        active ? "bg-blue-100 text-blue-700" : "hover:bg-gray-200 text-gray-600"
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onAction();
      }}
      title={title}
      data-testid={testId || `button-${title.toLowerCase().replace(/\s/g, "-")}`}
    >
      {icon}
    </button>
  );
}

function Separator() {
  return <div className="w-px h-4 bg-gray-300 mx-0.5" />;
}

async function uploadImageFile(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append("image", file);
  try {
    const res = await fetch("/api/uploads/image", { method: "POST", body: formData });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

function insertImageHtml(editorRef: React.RefObject<HTMLDivElement | null>, url: string, widthPercent: number = 100) {
  const editor = editorRef.current;
  if (!editor) return;
  editor.focus();
  const imgHtml = `<img src="${url}" style="max-width:${widthPercent}%;height:auto;display:block;margin:4px 0;" data-img-width="${widthPercent}" />`;
  document.execCommand("insertHTML", false, imgHtml);
}

function ImageResizePopover({
  img,
  onClose,
  onResize,
  onDelete,
}: {
  img: HTMLImageElement;
  onClose: () => void;
  onResize: (percent: number) => void;
  onDelete: () => void;
}) {
  const rect = img.getBoundingClientRect();
  const currentWidth = parseInt(img.getAttribute("data-img-width") || "100", 10);
  const [customValue, setCustomValue] = useState(String(currentWidth));
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) && e.target !== img) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, img]);

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-[10000]"
      style={{ top: rect.bottom + 4, left: rect.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] text-gray-500 font-semibold mb-1.5 uppercase">Bildgröße</div>
      <div className="flex items-center gap-1 mb-2">
        {IMAGE_SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`px-2 py-1 text-xs rounded border ${
              currentWidth === s.value
                ? "bg-blue-100 border-blue-300 text-blue-700"
                : "border-gray-200 hover:bg-gray-100"
            }`}
            onClick={() => {
              onResize(s.value);
              setCustomValue(String(s.value));
            }}
            data-testid={`btn-img-size-${s.value}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="10"
          max="100"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = Math.min(100, Math.max(10, parseInt(customValue) || 100));
              onResize(v);
              setCustomValue(String(v));
            }
          }}
          className="w-14 px-1.5 py-1 text-xs border border-gray-200 rounded text-center"
          data-testid="input-img-custom-size"
        />
        <span className="text-xs text-gray-500">%</span>
        <button
          type="button"
          className="ml-auto p-1 text-red-500 hover:bg-red-50 rounded"
          onClick={onDelete}
          title="Bild entfernen"
          data-testid="btn-img-delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function RichTextToolbar({
  editorRef,
  visible,
  onImageInsert,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  onImageInsert?: () => void;
}) {
  const [, forceUpdate] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exec = useCallback((cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    forceUpdate((v) => v + 1);
  }, [editorRef]);

  const isActive = useCallback((cmd: string) => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  }, []);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImageFile(file);
    if (url) {
      insertImageHtml(editorRef, url, 100);
      onImageInsert?.();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [editorRef, onImageInsert]);

  if (!visible) return null;

  return (
    <div
      className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 flex-wrap"
      onMouseDown={(e) => {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) e.preventDefault();
      }}
      data-testid="rich-text-toolbar"
    >
      <ToolbarButton
        icon={<Bold className="w-3.5 h-3.5" />}
        title="Fett"
        active={isActive("bold")}
        onAction={() => exec("bold")}
        testId="button-bold"
      />
      <ToolbarButton
        icon={<Italic className="w-3.5 h-3.5" />}
        title="Kursiv"
        active={isActive("italic")}
        onAction={() => exec("italic")}
        testId="button-italic"
      />
      <ToolbarButton
        icon={<Underline className="w-3.5 h-3.5" />}
        title="Unterstrichen"
        active={isActive("underline")}
        onAction={() => exec("underline")}
        testId="button-underline"
      />
      <ToolbarButton
        icon={<Strikethrough className="w-3.5 h-3.5" />}
        title="Durchgestrichen"
        active={isActive("strikeThrough")}
        onAction={() => exec("strikeThrough")}
        testId="button-strikethrough"
      />

      <Separator />

      <FontSizePicker onSelect={(size) => exec("fontSize", size)} />

      <Separator />

      <ColorPicker
        colors={TEXT_COLORS}
        onSelect={(color) => exec("foreColor", color)}
        icon={<Palette className="w-3.5 h-3.5" />}
        title="Textfarbe"
      />
      <ColorPicker
        colors={HIGHLIGHT_COLORS}
        onSelect={(color) => {
          if (color === "transparent") {
            exec("removeFormat");
          } else {
            exec("hiliteColor", color);
          }
        }}
        icon={<Paintbrush className="w-3.5 h-3.5" />}
        title="Hervorhebung"
      />

      <Separator />

      <ToolbarButton
        icon={<AlignLeft className="w-3.5 h-3.5" />}
        title="Linksbündig"
        active={isActive("justifyLeft")}
        onAction={() => exec("justifyLeft")}
      />
      <ToolbarButton
        icon={<AlignCenter className="w-3.5 h-3.5" />}
        title="Zentriert"
        active={isActive("justifyCenter")}
        onAction={() => exec("justifyCenter")}
      />
      <ToolbarButton
        icon={<AlignRight className="w-3.5 h-3.5" />}
        title="Rechtsbündig"
        active={isActive("justifyRight")}
        onAction={() => exec("justifyRight")}
      />

      <Separator />

      <ToolbarButton
        icon={<List className="w-3.5 h-3.5" />}
        title="Aufzählung"
        active={isActive("insertUnorderedList")}
        onAction={() => exec("insertUnorderedList")}
      />
      <ToolbarButton
        icon={<ListOrdered className="w-3.5 h-3.5" />}
        title="Nummerierte Liste"
        active={isActive("insertOrderedList")}
        onAction={() => exec("insertOrderedList")}
      />

      <Separator />

      <ToolbarButton
        icon={<Superscript className="w-3.5 h-3.5" />}
        title="Hochgestellt"
        active={isActive("superscript")}
        onAction={() => exec("superscript")}
      />
      <ToolbarButton
        icon={<Subscript className="w-3.5 h-3.5" />}
        title="Tiefgestellt"
        active={isActive("subscript")}
        onAction={() => exec("subscript")}
      />

      <Separator />

      <ToolbarButton
        icon={<RemoveFormatting className="w-3.5 h-3.5" />}
        title="Formatierung löschen"
        onAction={() => exec("removeFormat")}
        testId="button-clear-format"
      />

      <Separator />

      <ToolbarButton
        icon={<ImagePlus className="w-3.5 h-3.5" />}
        title="Bild einfügen"
        onAction={() => fileInputRef.current?.click()}
        testId="button-insert-image"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
        data-testid="input-image-upload"
      />
    </div>
  );
}

export function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (text.includes("<") && (text.includes("</") || text.includes("/>") || /<br\s*\/?>/i.test(text))) {
    return text;
  }
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

export function isHtmlContent(text: string): boolean {
  if (!text) return false;
  return /<[a-z][\s\S]*>/i.test(text);
}

export function RichTextCell({
  value,
  onChange,
  className,
  placeholder,
  onFocus,
  onBlur,
  onKeyDown,
  readOnly,
  testId,
  dataField,
  hideToolbar,
}: {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  readOnly?: boolean;
  testId?: string;
  dataField?: string;
  hideToolbar?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const lastValueRef = useRef(value);
  const isComposing = useRef(false);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (document.activeElement === ref.current) return;
    const html = plainTextToHtml(value);
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
      lastValueRef.current = value;
    }
  }, [value]);

  const triggerChange = useCallback(() => {
    if (!ref.current) return;
    const html = ref.current.innerHTML.replace(/\r\n?/g, "\n");
    const cleaned = html === "<br>" || html === "<div><br></div>" ? "" : html;
    if (cleaned !== lastValueRef.current) {
      lastValueRef.current = cleaned;
      onChange(cleaned);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (!ref.current || isComposing.current) return;
    triggerChange();
  }, [triggerChange]);

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    setSelectedImg(null);
    onBlur?.();
  }, [onBlur]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;
      const url = await uploadImageFile(file);
      if (url) {
        insertImageHtml(ref, url, 100);
        triggerChange();
      }
      return;
    }

    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    if (html) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      tmp.querySelectorAll("meta, script, link, style, iframe, object, embed, svg").forEach(el => el.remove());
      tmp.querySelectorAll("*").forEach(el => {
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value.trim().toLowerCase();
          if (name.startsWith("on")) el.removeAttribute(attr.name);
          if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
            el.removeAttribute(attr.name);
          }
        }
      });
      const allowedStyles = ["color", "background-color", "background", "font-size", "font-weight", "font-style", "text-decoration", "text-align", "max-width", "width", "height", "display", "margin"];
      tmp.querySelectorAll("[style]").forEach(el => {
        const s = (el as HTMLElement).style;
        const keep: string[] = [];
        for (const prop of allowedStyles) {
          const val = s.getPropertyValue(prop);
          if (val && !/url\s*\(|expression\s*\(/i.test(val)) keep.push(`${prop}:${val}`);
        }
        if (keep.length) {
          el.setAttribute("style", keep.join(";"));
        } else {
          el.removeAttribute("style");
        }
      });
      tmp.querySelectorAll("[class]").forEach(el => el.removeAttribute("class"));
      document.execCommand("insertHTML", false, tmp.innerHTML);
    } else if (plain) {
      document.execCommand("insertHTML", false, plainTextToHtml(plain));
    }
  }, [triggerChange]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      e.preventDefault();
      setSelectedImg(target as HTMLImageElement);
    } else {
      setSelectedImg(null);
    }
  }, []);

  const handleKeyDownInternal = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.key !== "Enter" || readOnly) return;
    e.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const newline = document.createTextNode("\n");
      range.insertNode(newline);
      range.setStartAfter(newline);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      document.execCommand("insertText", false, "\n");
    }
    requestAnimationFrame(triggerChange);
  }, [onKeyDown, readOnly, triggerChange]);

  const handleImageResize = useCallback((percent: number) => {
    if (!selectedImg || !ref.current) return;
    selectedImg.style.maxWidth = `${percent}%`;
    selectedImg.setAttribute("data-img-width", String(percent));
    triggerChange();
  }, [selectedImg, triggerChange]);

  const handleImageDelete = useCallback(() => {
    if (!selectedImg || !ref.current) return;
    selectedImg.remove();
    setSelectedImg(null);
    triggerChange();
  }, [selectedImg, triggerChange]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (focused && !readOnly && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setToolbarPos({ top: rect.top - 4, left: rect.left });
    } else {
      setToolbarPos(null);
    }
  }, [focused, readOnly]);

  useEffect(() => {
    if (!focused || readOnly) return;
    const onScroll = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setToolbarPos({ top: rect.top - 4, left: rect.left });
      }
    };
    const scrollEl = containerRef.current?.closest(".overflow-y-auto");
    scrollEl?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollEl?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [focused, readOnly]);

  return (
    <div ref={containerRef} className="relative">
      {focused && !readOnly && !hideToolbar && toolbarPos && createPortal(
        <div
          style={{ position: "fixed", top: toolbarPos.top, left: toolbarPos.left, transform: "translateY(-100%)", zIndex: 9999 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <RichTextToolbar editorRef={ref} visible={true} onImageInsert={triggerChange} />
        </div>,
        document.body,
      )}
      {selectedImg && !readOnly && (
        <ImageResizePopover
          img={selectedImg}
          onClose={() => setSelectedImg(null)}
          onResize={handleImageResize}
          onDelete={handleImageDelete}
        />
      )}
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        className={`outline-none min-h-[20px] ${className || ""} ${
          focused ? "border-gray-300 bg-white" : "border-transparent"
        } ${!value && !focused ? "text-gray-400" : ""}`}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDownInternal}
        onPaste={handlePaste}
        onClick={handleClick}
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
        data-placeholder={placeholder}
        data-testid={testId}
        data-field={dataField}
        style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}
      />
    </div>
  );
}
