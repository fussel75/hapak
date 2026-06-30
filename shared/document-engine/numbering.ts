/**
 * Document Engine — Positionsnummerierung
 * 
 * Erzeugt HAPAK-konforme Nummerierung:
 * 1.       Titel
 * 1.1      Position
 * 1.2      Position
 * 1.2a)    Alternativposition
 * 1.2b)    Alternativposition
 * 1.3      Bedarfsposition (eigene Nummer)
 * 1.       Titelsumme
 * 2.       Titel
 * 2.1.     Untertitel (Gruppe)
 * 2.1.1    Position
 */

import type { DocumentItemData } from "./types";
import { isNumberedType } from "./position-types";

const ALPHA = "abcdefghijklmnopqrstuvwxyz";

/**
 * Berechnet die Positionsnummern für alle Items.
 * Gibt eine Map zurück: itemId → "1.2" (wobei itemId = _clientId oder String(id))
 * 
 * Alternativpositionen: Vorposition + a), b), c) ...
 * Bedarfspositionen: eigene normale Nummer
 */
export interface NumberingOptions {
  auto?: boolean;
  step?: number;
  start?: number;
}

export function buildPositionNumbers(
  items: DocumentItemData[],
  options?: NumberingOptions,
): Map<string, string> {
  const map = new Map<string, string>();
  const auto = options?.auto !== false;
  const step = options?.step || 1;
  const startAt = options?.start ?? 1;

  if (!auto) {
    for (const item of items) {
      const itemId = item._clientId || String(item.id || "");
      if (!itemId) continue;
      map.set(itemId, (item as any).manualPosNr || item.positionNumber || "");
    }
    return map;
  }

  let titleNum = startAt - step;
  let gruppeNum = 0;
  let posNum = startAt - step;
  let inGruppe = false;
  let lastNormalPosNumber = "";
  let altCounter = 0;

  for (const item of items) {
    const itemId = item._clientId || String(item.id || "");
    if (!itemId) continue;

    if (item._parentClientId) {
      map.set(itemId, "");
      continue;
    }

    if (item.type === "titel") {
      titleNum += step;
      gruppeNum = 0;
      posNum = 0;
      inGruppe = false;
      altCounter = 0;
      map.set(itemId, `${titleNum}.`);

    } else if (item.type === "gruppe") {
      if (titleNum >= startAt) {
        gruppeNum += step;
        posNum = 0;
        inGruppe = true;
        altCounter = 0;
        map.set(itemId, `${titleNum}.${gruppeNum}.`);
      } else {
        titleNum += step;
        gruppeNum = 0;
        posNum = 0;
        inGruppe = false;
        altCounter = 0;
        map.set(itemId, `${titleNum}.`);
      }

    } else if (item.type === "titelsumme") {
      altCounter = 0;
      if (inGruppe) {
        map.set(itemId, `${titleNum}.${gruppeNum}.`);
        inGruppe = false;
      } else {
        map.set(itemId, `${titleNum}.`);
      }

    } else if (!isNumberedType(item.type)) {
      map.set(itemId, "");

    } else if (item.positionFlag === "alternativ") {
      const letter = ALPHA[altCounter] || String(altCounter + 1);
      altCounter++;
      map.set(itemId, `${lastNormalPosNumber}${letter})`);

    } else {
      posNum += step;
      altCounter = 0;
      let num: string;
      if (titleNum >= startAt && inGruppe) {
        num = `${titleNum}.${gruppeNum}.${posNum}`;
      } else if (titleNum >= startAt) {
        num = `${titleNum}.${posNum}`;
      } else {
        num = `${posNum}.`;
      }
      lastNormalPosNumber = num;
      map.set(itemId, num);
    }
  }

  return map;
}

/**
 * Gibt den item-identifier zurück (für Maps etc.)
 */
export function getItemId(item: DocumentItemData): string {
  return item._clientId || String(item.id || "");
}
