/**
 * Document Engine — Template-Auflösung
 * 
 * Bestimmt welches Formular-Template verwendet wird (mit Fallback-Kette)
 * und normalisiert es in ein einheitliches Format.
 */

import type {
  FormTemplateData,
  CompanySettingsData,
  TemplateField,
  WorkAreaConfig,
  ResolvedTemplate,
} from "../types";

// ─── Default-Template (HAPAK-Stil, basierend auf FriStD-Bau Muster-PDF) ─────

const DEFAULT_PAGE1_FIELDS: TemplateField[] = [
  { id: "logo", x: 364, y: 17, w: 190, h: 60, typ: "Bild", inhalt: "[Firmenlogo]", aktiv: true, drucken: true },
  { id: "firmenname", x: 60, y: 20, w: 280, h: 16, typ: "Text", inhalt: "FriStD-Bau ZuB GmbH & Co.KG", font: "Arial Bold 11pt", farbe: "#1a202c", aktiv: true, drucken: true },
  { id: "firma_adresse", x: 60, y: 38, w: 280, h: 55, typ: "Text", inhalt: "Haldesdorfer Str. 44 · 22179 Hamburg\nTel: 040 - 38 67 45 65 · Fax: 040 - 38 67 45 66\npost@fristd-bau.com · St.-Nr.: 50/620/01754", font: "Arial 7pt", farbe: "#4a5568", aktiv: true, drucken: true },
  { id: "trennlinie", x: 60, y: 88, w: 475, h: 1, typ: "Text", inhalt: "", font: "Arial 6pt", farbe: "#999999", aktiv: true, drucken: true },
  { id: "absender", x: 60, y: 95, w: 280, h: 8, typ: "Text", inhalt: "FriStD-Bau ZuB GmbH & Co.KG · Haldesdorfer Str. 44 · 22179 Hamburg", font: "Arial 7pt", farbe: "#718096", aktiv: true, drucken: true },
  { id: "kundenadresse", x: 60, y: 110, w: 260, h: 60, typ: "Variabel", inhalt: "[Kundenadresse]", aktiv: true, drucken: true },
  { id: "projekt_nr", x: 395, y: 110, w: 165, h: 12, typ: "Variabel", inhalt: "Projekt-Nr.: [Projektnummer]", aktiv: true, drucken: true },
  { id: "kunden_nr", x: 395, y: 124, w: 165, h: 12, typ: "Variabel", inhalt: "Kunden-Nr.: [Kundennummer]", aktiv: true, drucken: true },
  { id: "ort_datum", x: 395, y: 138, w: 165, h: 12, typ: "Variabel", inhalt: "[Ort] [Datum]", aktiv: true, drucken: true },
  { id: "dok_titel", x: 395, y: 158, w: 165, h: 16, typ: "Variabel", inhalt: "[Dokumenttyp] [Dok.-Nr.]", font: "Arial Bold 14pt", aktiv: true, drucken: true },
  { id: "bauvorhaben", x: 60, y: 180, w: 500, h: 12, typ: "Variabel", inhalt: "Bauvorhaben: [Projektname]", aktiv: true, drucken: true },
  { id: "arbeitsbereich", x: 60, y: 200, w: 500, h: 550, typ: "Variabel", inhalt: "[Arbeitsbereich]", aktiv: true, drucken: true },
  { id: "fusszeile_links", x: 60, y: 790, w: 170, h: 25, typ: "Text", inhalt: "GF: Ronny Friedrich\nVollhafter: FriStD-Bau Verwaltung\nHRA 119618 AG Hamburg", font: "Arial 7pt", farbe: "#718096", aktiv: true, drucken: true },
  { id: "fusszeile_mitte", x: 230, y: 790, w: 180, h: 25, typ: "Text", inhalt: "Postbank Hamburg\nIBAN DE58 2001 0020 0637 5432 04\nBIC PBNKDEFFXXX", font: "Arial 7pt", farbe: "#718096", aktiv: true, drucken: true },
  { id: "fusszeile_rechts", x: 410, y: 790, w: 150, h: 25, typ: "Text", inhalt: "Haldesdorfer Str. 44\n22179 Hamburg\nTel: 040 - 38 67 45 65", font: "Arial 7pt", farbe: "#718096", ausrichtung: "rechts", aktiv: true, drucken: true },
];

const DEFAULT_PAGE2_FIELDS: TemplateField[] = [
  { id: "logo_p2", x: 444, y: 17, w: 110, h: 38, typ: "Bild", inhalt: "[Firmenlogo]", aktiv: true, drucken: true },
  { id: "firma_p2", x: 60, y: 25, w: 300, h: 12, typ: "Text", inhalt: "FriStD-Bau ZuB GmbH & Co.KG", font: "Arial 9pt", aktiv: true, drucken: true },
  { id: "datum_p2", x: 395, y: 25, w: 80, h: 12, typ: "Variabel", inhalt: "[Datum]", aktiv: true, drucken: true },
  { id: "blatt_p2", x: 480, y: 25, w: 80, h: 12, typ: "Variabel", inhalt: "Blatt [Seitenzahl]", aktiv: true, drucken: true },
  { id: "doktyp_p2", x: 60, y: 42, w: 200, h: 12, typ: "Variabel", inhalt: "[Dokumenttyp] [Dok.-Nr.]", aktiv: true, drucken: true },
  { id: "kundennr_p2", x: 395, y: 42, w: 165, h: 12, typ: "Variabel", inhalt: "Kunden-Nr.: [Kundennummer]", aktiv: true, drucken: true },
  { id: "arbeitsbereich_p2", x: 60, y: 62, w: 500, h: 700, typ: "Variabel", inhalt: "[Arbeitsbereich]", aktiv: true, drucken: true },
  { id: "fusszeile_links_p2", x: 60, y: 790, w: 170, h: 25, typ: "Text", inhalt: "GF: Ronny Friedrich\nVollhafter: FriStD-Bau Verwaltung\nHRA 119618 AG Hamburg", font: "Arial 7pt", farbe: "#718096", aktiv: true, drucken: true },
  { id: "fusszeile_mitte_p2", x: 230, y: 790, w: 180, h: 25, typ: "Text", inhalt: "Postbank Hamburg\nIBAN DE58 2001 0020 0637 5432 04\nBIC PBNKDEFFXXX", font: "Arial 7pt", farbe: "#718096", aktiv: true, drucken: true },
  { id: "fusszeile_rechts_p2", x: 410, y: 790, w: 150, h: 25, typ: "Text", inhalt: "Haldesdorfer Str. 44\n22179 Hamburg\nTel: 040 - 38 67 45 65", font: "Arial 7pt", farbe: "#718096", ausrichtung: "rechts", aktiv: true, drucken: true },
];

const DEFAULT_WORKAREA: WorkAreaConfig = {
  x: 60, y: 200, w: 500, h: 550,
  schriftart: "Arial 10pt",
  zeilenAbstand: 4,
  linienBreite: 0.5,
  spalten: [
    { name: "Pos.", breite: 35, ausrichtung: "links" },
    { name: "Menge", breite: 45, ausrichtung: "rechts" },
    { name: "ME", breite: 25, ausrichtung: "links" },
    { name: "Bezeichnung", breite: 250, ausrichtung: "links" },
    { name: "E-Preis", breite: 70, ausrichtung: "rechts" },
    { name: "G-Preis", breite: 70, ausrichtung: "rechts" },
  ],
  tabellenkopf: { hintergrund: "#F0F0F0", schriftart: "Arial Bold 9pt", rahmen: true },
};

// ─── Template-Auflösung ──────────────────────────────────────────────────────

function findWorkArea(fields: TemplateField[]): TemplateField | undefined {
  return fields.find(f =>
    f.id === "arbeitsbereich" ||
    f.id?.startsWith("arbeitsbereich") ||
    f.inhalt === "[Arbeitsbereich]" ||
    f.typ === "Arbeitsbereich"
  );
}

function findFooterY(fields: TemplateField[]): number {
  const footerFields = fields.filter(f =>
    f.aktiv !== false &&
    f.drucken !== false &&
    (f.id?.startsWith("fusszeile") || f.id?.startsWith("footer") || f.y > 750)
  );
  if (footerFields.length > 0) {
    return Math.min(...footerFields.map(f => f.y));
  }
  return 790; // Default Footer-Y
}

/**
 * Löst das Template auf — mit Fallback-Kette:
 * 1. Dokument-spezifisches Template (formTemplateId)
 * 2. Firmen-Default-Template (companySettings.defaultFormTemplateId)
 * 3. Hardcoded Default (HAPAK-Stil)
 */
export function resolveTemplate(
  template?: FormTemplateData | null,
  companySettings?: CompanySettingsData | null,
): ResolvedTemplate {
  const page1Fields: TemplateField[] =
    (template?.fields?.length ? template.fields : null) || DEFAULT_PAGE1_FIELDS;

  const page2Fields: TemplateField[] =
    (template?.fieldsPage2?.length ? template.fieldsPage2 : null) || DEFAULT_PAGE2_FIELDS;

  const workAreaConfig: WorkAreaConfig =
    (template?.workArea as WorkAreaConfig) || DEFAULT_WORKAREA;

  // Arbeitsbereich-Grenzen aus den Template-Feldern ermitteln
  const wa1 = findWorkArea(page1Fields);
  const wa2 = findWorkArea(page2Fields);

  const workAreaPage1 = {
    x: wa1?.x ?? workAreaConfig.x ?? 60,
    y: wa1?.y ?? workAreaConfig.y ?? 200,
    w: wa1?.w ?? workAreaConfig.w ?? 500,
    h: wa1?.h ?? workAreaConfig.h ?? 550,
  };

  const workAreaPage2 = {
    x: wa2?.x ?? 60,
    y: wa2?.y ?? 62,
    w: wa2?.w ?? 500,
    h: wa2?.h ?? 700,
  };

  return {
    page1Fields,
    page2Fields,
    workArea: workAreaConfig,
    workAreaPage1,
    workAreaPage2,
    footerYPage1: findFooterY(page1Fields),
    footerYPage2: findFooterY(page2Fields),
  };
}
