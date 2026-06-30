function textToHtml(text: string): string {
  if (!text) return "";
  if (text.includes("<") && (text.includes("</") || text.includes("/>") || /<br\s*\/?>/i.test(text))) {
    return text;
  }
  return text
    .replace(/&nbsp;/g, "\x00NBSP\x00")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\x00NBSP\x00/g, "&nbsp;")
    .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;")
    .replace(/  /g, " &nbsp;")
    .replace(/\n/g, "<br>");
}

function normalizeToPlainText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export interface TextSplitStyles {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  padding: string;
}

export function splitTextByDom(
  text: string,
  widthPx: number,
  maxHeightPx: number,
  styles: TextSplitStyles,
): [string, string] {
  if (!text || maxHeightPx <= 0) return ["", text || ""];

  const div = document.createElement("div");
  Object.assign(div.style, {
    position: "absolute",
    visibility: "hidden",
    left: "-9999px",
    top: "0",
    width: `${widthPx}px`,
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    lineHeight: styles.lineHeight,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    padding: styles.padding,
    boxSizing: "border-box",
  });
  document.body.appendChild(div);

  try {
    div.innerHTML = textToHtml(text);
    if (div.getBoundingClientRect().height <= maxHeightPx) {
      return [text, ""];
    }

    const plain = normalizeToPlainText(text);
    const paragraphs = plain.split("\n");

    let pLo = 0;
    let pHi = paragraphs.length;
    while (pLo < pHi) {
      const mid = Math.ceil((pLo + pHi) / 2);
      div.innerHTML = textToHtml(paragraphs.slice(0, mid).join("\n"));
      if (div.getBoundingClientRect().height <= maxHeightPx) {
        pLo = mid;
      } else {
        pHi = mid - 1;
      }
    }

    if (pLo > 0) {
      return [paragraphs.slice(0, pLo).join("\n"), paragraphs.slice(pLo).join("\n")];
    }

    const overflowPara = paragraphs[0];
    const words = overflowPara.split(/(\s+)/);

    let wLo = 0;
    let wHi = words.length;
    while (wLo < wHi) {
      const wMid = Math.ceil((wLo + wHi) / 2);
      div.innerHTML = textToHtml(words.slice(0, wMid).join(""));
      if (div.getBoundingClientRect().height <= maxHeightPx) {
        wLo = wMid;
      } else {
        wHi = wMid - 1;
      }
    }

    if (wLo > 0) {
      const firstPart = words.slice(0, wLo).join("").trimEnd();
      const secondPart = [words.slice(wLo).join("").trimStart(), ...paragraphs.slice(1)].join("\n");
      return [firstPart, secondPart];
    }

    if (words.length > 1) {
      return [words[0], [words.slice(1).join(""), ...paragraphs.slice(1)].join("\n")];
    }
    return [paragraphs[0], paragraphs.slice(1).join("\n")];
  } finally {
    document.body.removeChild(div);
  }
}

export function getCombinedText(item: { title?: string | null; description?: string | null }): string {
  const title = item.title || "";
  const desc = item.description || "";
  if (desc) {
    return title.trim() ? title + "\n" + desc : desc;
  }
  return title;
}
