/**
 * Document Engine - Sichtbarkeitsregeln
 *
 * Kompatibilitaets-Adapter fuer aeltere Imports. Die fachlichen Regeln liegen
 * zentral in position-types.ts.
 */

import type { DocumentItemData } from "./types";
import {
  countsForTotal,
  isClosingType,
  isPositionType,
  isStructuralType,
  isSubItem,
  isTextType,
} from "./position-types";

export { countsForTotal, isClosingType, isPositionType, isStructuralType, isSubItem, isTextType };

/** Soll diese Position im Ausdruck sichtbar sein? */
export function isVisibleInPrint(_item: DocumentItemData): boolean {
  return true;
}

/**
 * Filtert die Items fuer die Seitenumbruch-Berechnung.
 * Gibt nur Top-Level-Items zurueck (keine Jumbo-Kinder, kein Abschluss).
 */
export function getMainItems(
  items: DocumentItemData[],
  endTexteStartIdx: number,
): DocumentItemData[] {
  return items.filter((item, idx) => {
    if (idx >= endTexteStartIdx && isTextType(item.type)) return false;
    if (item._parentClientId) return false;
    if (isClosingType(item.type)) return false;
    return true;
  });
}

/**
 * Findet den Index ab dem die Nachtexte beginnen.
 */
export function findEndTexteStart(items: DocumentItemData[]): number {
  let lastAbschluss = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].type === "abschluss") {
      lastAbschluss = i;
      break;
    }
  }
  if (lastAbschluss >= 0) {
    for (let i = lastAbschluss + 1; i < items.length; i++) {
      if (isTextType(items[i].type)) return i;
    }
    return items.length;
  }

  if (items.length === 0) return items.length;
  let endStart = items.length;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it._parentClientId) continue;
    if (isTextType(it.type)) {
      endStart = i;
    } else {
      break;
    }
  }
  return endStart;
}
