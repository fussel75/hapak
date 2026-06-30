# FriStD-Bau ZuB - Stabilisierung und Produkt-Roadmap

Stand: 2026-06-24

## Aktueller Arbeitsstand

- `npm run test` ist gruen: 139 Regressionstests laufen durch.
- `npm run check` ist gruen: TypeScript kompiliert ohne Fehler.
- `npm run build` ist gruen: Produktionsbuild laeuft durch.
- `npm run smoke:browser` ist gruen: echter Browser prueft App-Shell, Login, Dokumentuebersicht, neue Dokumenttypen, Speichern/Neuladen, Projektbaum-Zuordnung, Dokument-Umwandlung mit Projektbaum-Sync, Projektseite, ein dynamisch vorhandenes Dokument im Editor, Anzeige-Modus, editierbare Textzellen, deutsche Mengeneingabe, mehrzeiligen Freitext und freie Jumbos.
- `npm run smoke:local` prueft die lokal laufende App gegen `/`, Login, Dokumente, Projekte, ein dynamisch vorhandenes Basisdokument, dessen Positionen, den PDF-Export sowie die importierte HAPAK-Rechnung `26-00058` gegen Jumbo-/Skonto-Regressionen inklusive Position `1.1.1` ohne kuenstliche Kinder.
- `npm run smoke:incoming-fibu` prueft den echten Laufzeitpfad manuelle Eingangsrechnung -> RE-/Fibu-Hauptsatz -> Fibu-Liste inklusive Testdaten-Cleanup.
- `npm run smoke:with-server` startet bei Bedarf selbst einen lokalen Development-Server, wartet auf `/api/health`, fuehrt die FIBU- und lokalen Smokes aus und raeumt den Server-Job danach wieder auf.
- `npm run dev:node24` startet die lokale App explizit mit der gebuendelten modernen Node-Version, damit Vite nicht mehr versehentlich ueber die alte globale Node 20.7.0 startet.
- `npm run hapak:analyze:2026 -- --source <lokaler HAPAK-Snapshot>` startet einen reinen Read-only-Dry-Run fuer HAPAK-DBF-Daten 2026 und erzeugt eine Importvorschau ohne Datenbank-Schreibzugriff.
- Testabgedeckt sind aktuell Dokumentberechnung, Skonto-Materialbasis, explizite Skonto-Blocklogik, interne Jumbo-Lohnpositionen, HAPAK-Jumbo-Importregeln, Freitext-Pagination, HTML-Sanitizing, Upload-Sicherheit, geschuetzte PDF-Bildausgabe, Editor-Default-Aufloesung, Dokument-Form-Mapping, deutsche Mengen-Eingabe, freie/manuelle Jumbos, HAPAK-aehnliche F2/F3/F4/F5-Shortcuts, die Dokumenttyp-Auswahl fuer neue Dokumente, Projektbaum-Synchronisation und Rechnungsausgangs-Cache-Kohärenz.
- Upload-Auslieferung ist authentifiziert und auf sichere Bildtypen begrenzt; serverseitige PDF-Erzeugung erhaelt einen zeitlich begrenzten Print-Asset-Token fuer geschuetzte Formularbilder.
- Formular-Voreinstellung fuer Dokumenttypen wird ueber eine testbare Shared-Logik aufgeloest.
- Bestehende Dokumente werden beim Laden ueber eine testbare Form-Abbildung normalisiert; explizite `false`- und `0`-Werte bleiben erhalten.
- Positionen bestehender Dokumente werden beim Laden mit den frisch geladenen Dokumentwerten berechnet, nicht mit altem Editor-State.
- Freie Jumbo-Positionen berechnen ihren Preis aus Unterpositionen; bewusst pauschal gesetzte Jumbo-Preise bleiben beim Laden erhalten.
- Die Schnittstelle Editor -> Vorschau/PDF erhaelt explizite Dokument- und Positions-Flags wie `false`, `pageBreakBefore`, `afterTotals`, `positionFlag` und `priceFollowsCost`.
- Neue Dokumente koennen aus der Dokumentuebersicht gezielt als Angebot, Rechnung, freies Dokument, Lieferschein usw. gestartet werden; die URL-Typen werden zentral normalisiert.
- Der Dokumenteditor speichert Positionen jetzt als einen Bulk-Payload; Jumbo-Kinder werden ueber `_clientId`/`_parentClientId` serverseitig in einer Transaktion auf echte Parent-IDs aufgeloest.
- Die zentrale Summen-Engine berechnet freie Jumbos vor Titel-/Zwischen-/Abschlusssummen ueber dieselbe Jumbo-Logik wie der Editor; bewusst fixe Jumbo-Pauschalpreise bleiben erhalten.
- Der Print-/Vorschau-Item-Pfad erhaelt unsaved `_clientId`/`_parentClientId`-Beziehungen und berechnet Skonto/Steuer mit den Dokumentwerten statt mit Defaults.
- HTML-Vorschau und PDF-Download erhalten jetzt dieselben zentralen Dokumentflags, Positionsnummerierungswerte und Item-Metadaten aus dem Preview-Payload.
- Der Printpfad nutzt die Nummerierungsoptionen des Dokuments (`autoPositionNumbers`, Start, Schrittweite) statt pauschal die Defaults anzunehmen.
- Netto/USt/Brutto im Printpfad werden ueber die zentrale Totals-Logik berechnet, nicht mehr ueber eine lokale Hand-Summe.
- Der normale PrintRenderer nutzt `computeDocumentBundle` jetzt als Quelle fuer Template-Aufloesung, Positionsnummern und Totals; nur die DOM-gemessene Pagination bleibt lokal.
- Die sichtbaren Print-Items stammen jetzt aus `computedBundle.computed.visibleItems`, damit auch gerenderte Zeilen die berechnete Engine-Version nutzen.
- Projekt-Dokumentbaum wird bei Dokument-Erstellung, Patch, Full-Save, Umwandlung und Loeschen synchronisiert; verwaiste Baumknoten werden beim Laden des Projektbaums bereinigt.
- Rechnungsausgangs-Uebernahme aktualisiert nach erfolgreichem Eintrag die Rechnungsbuch-, Zahlungsabgleich- und Register-Check-Caches; RA-Hauptsaetze synchronisieren Dokumentstatus, Zahlung, Skonto und offenen Betrag zurueck ins Dokument.
- Der Zahlungsabgleich nutzt offene RA-Hauptsaetze aus `fibu_buchungen` als fachliche Quelle, statt offene Rechnungen nur aus Dokumentfeldern abzuleiten.
- Zahlungszuordnungen schreiben Match-Betraege jetzt auf den RA-Hauptsatz und synchronisieren von dort ins Dokument; direkte `documents.paid_amount`-Updates im Zahlungsabgleich sind entfernt.
- Mahnungen synchronisieren ihre Mahnstufe und Mahngebuehr in den RA-Hauptsatz; offene Posten beruecksichtigen Mahnsperre und Mahnstufe aus Rechnungsbuch und Mahneintraegen.
- Projekt-Ertragsuebersicht und automatische Nachkalkulations-Kennzahlen nutzen Fibu-Hauptsaetze ohne Stornos als Quelle und zeigen bezahlte/offene Erloese und Kosten getrennt.
- Dashboard- und Kunden-Finanzkennzahlen nutzen RA-Hauptsaetze aus dem Rechnungsbuch; ueberfaellige Belege, Umsatzdiagramm und Kundenumsatz haengen nicht mehr an alten Dokument-Zahlfeldern.
- Rechnungsbuch-Statistiken verwenden ausschliesslich Fibu-Hauptsaetze; der alte Fallback auf Dokument-Zwischensummen ist entfernt.
- Adressbezuege zeigen Rechnungseingang jetzt aus RE-Hauptsaetzen und ergaenzen nur noch nicht gebuchte manuelle Eingangsrechnungen, damit Lieferantenhistorien nicht blind bleiben.
- Manuell erfasste Eingangsrechnungen koennen aus dem Rechnungseingang in das RE-/Fibu-System gebucht werden; Dubletten werden erkannt, Hauptsatz und optionale Zahlungszeile werden erzeugt und die UI springt danach auf den Fibu-Datensatz.
- Zahlungen fuer bereits in FIBU gebuchte manuelle Eingangsrechnungen werden nicht mehr lokal in `incoming_invoices` erfasst; der UI-Weg fuehrt zur FIBU-Buchung und der Server blockiert lokale Zahlungsupdates mit `409`.
- FIBU-Hauptsaetze werden beim Loeschen/Storno nicht mehr physisch aus `fibu_buchungen` entfernt; der aktive API-Pfad setzt `stornoflag = 2`, `stornodat`, `offen = 0` und synchronisiert verknuepfte Dokumente/Eingangsrechnungen auf `storniert`.
- FIBU-Zahlungen, Zahlungsbearbeitung, Verrechnung und generische FIBU-Patches blockieren stornierte Hauptsaetze; alte Dokument-Zahlungswege und Dokument-Saves koennen registrierte FIBU-Rechnungen nicht mehr als Schattenbuchhaltung an der FIBU vorbei fortschreiben.
- HAPAK-Import ist als sicherer Analysepfad vorbereitet: lokale DBF/FPT-Dateien werden mit CP1252/loose gelesen, Dokumente/FIBU/Projekte/Adressen/Lohn 2026 verknuepft und freie Dokumente als moegliche Ordner-Ersatzstruktur klassifiziert; der alte NAS-Sync enthaelt keine Klartext-Zugangsdaten mehr. Importierte Jumbos ohne echte Kinder werden nicht mehr pauschal mit erfundenen Lohnkindern aufgefuellt; externe Fremdleistungs-Jumbos bleiben als detaillierte Positionen ohne kuenstliche Unterpositionen erhalten.
- `/api/health` ist ein echter JSON-Healthcheck und kein zufaelliger Frontend-Fallback mehr.
- Skonto-Wording wird nicht mehr doppelt im Nachtext ausgegeben; Skonto erscheint als explizit eingefuegter Block. Bei deaktivierter Skonto-Anzeige reserviert die Pagination keinen leeren Skonto-Summenraum.
- Zwischensummen sind gegen Doppelzaehlung von Titelsummen und gegen falsche Abschnittsbildung nach vorherigen Zwischensummen abgesichert.
- Der Kontext-Einfuegeweg blockiert normale Positions- und Summenzeilen im Nachsummenbereich; dort sind nur Nachtext, Floskel, Trennlinie und Skonto vorgesehen.
- Nummernformatierung ist konsistent: Dokumentnummern `26-00001`, Projektnummern `26-0001`, Kundennummern ab `10000`.

## Fertigstellungs-Einschaetzung

Die App ist aktuell in der Stufe **stabilisierter Prototyp / interne Abnahme**, aber noch nicht in der Stufe **produktiver Tagesbetrieb ohne Bauchweh**.

Realistische Zielmarken:

- **Interne Arbeitsversion fuer kontrollierte Tests:** ca. 1-2 konzentrierte Arbeitswochen, wenn wir weiter die Kernablaeufe absichern statt neue Grossfunktionen anzufangen.
- **Pilotbetrieb mit echten, aber kontrollierten Dokumenten:** ca. 3-5 Arbeitswochen, wenn Dokumenteditor, Projektbaum, Formulare, Rechnungsausgang und PDF/Preview-Abgleich weiter gruen bleiben.
- **Breit produktiv fuer den Betrieb:** eher 2-3 Monate, weil dann auch Buchhaltung/SK03, Eingangs-/Ausgangsbuecher, Rollen/Rechte, Backups, Datenmigration, Fehlerbehandlung und Design/Bedienfluss belastbar sein muessen.

Nicht verhandelbare Abnahmekriterien fuer "fertig genug":

- Ein Angebot/Rechnung/Freies Dokument kann neu erstellt, gespeichert, geschlossen, wieder geladen, geaendert und als PDF erzeugt werden, ohne Daten- oder Layoutverlust.
- Projektzuordnung, Dokumentbaum, Nummernkreis und Kunde bleiben ueber Speichern/Reload/Loeschen konsistent.
- Freitext, Titel, Positionen, Jumbo-Unterpositionen, Summen, Skonto und Steuer stimmen in Editor, Vorschau und PDF ueberein.
- Formular-Voreinstellungen greifen fuer alle relevanten Dokumenttypen.
- Die wichtigsten Loesch-/Aenderungsaktionen nutzen App-Dialoge und keine nativen Browser-Prompts.
- `npm run test`, `npm run check`, `npm run build`, `npm run smoke:browser` sind vor jeder Abnahme gruen.

## Externe Bausteine - aktuelle Einordnung

- `pdfme/pdfme`: guter Kandidat fuer Formular-/PDF-Designer-Inspiration oder spaetere Teilintegration. MIT-Lizenz, TypeScript/React, WYSIWYG-Template-Designer und Generator. Nicht vorschnell in den Dokumenteditor kippen; zuerst als isolierten Prototyp pruefen.
- `idurar/idurar-erp-crm`: guter UI-/Modul-Referenzpunkt fuer Angebote, Rechnungen, Kunden und CRM. AGPL-3.0, daher eher ansehen/lernen, nicht direkt Code uebernehmen.
- `datadrivenconstruction/OpenConstructionERP`: interessante Bau-/BOQ-/Kalkulations-Referenz. AGPL-3.0 mit kommerzieller Lizenzoption, daher nur fachlich vergleichen, nicht direkt vermischen.

## Zielbild

Die Software soll nicht nur ein HAPAK-Nachbau sein, sondern eine moderne Handwerker-ERP-Arbeitsumgebung:

- echte Dokumentbearbeitung mit stabiler Vorschau wie im finalen PDF
- zuverlässige Projekt- und Dokumentstruktur
- sichere Nummernkreise, Kunden-, Projekt- und Beleglogik
- robuste Kalkulation fuer Material, Lohn, Fremdleistungen und Jumbos
- exportierbare, importierbare und verlässlich angewendete Formulare
- Automations-, API- und KI-faehige Architektur
- ruhiges, professionelles Layout fuer taegliche Arbeit statt Demo-Oberflaeche

## Harte Befunde

### 1. Code-Groesse und Kopplung

Aktuelle Hotspots:

- `client/src/pages/projects.tsx`: ca. 3070 Zeilen
- `client/src/pages/document-editor.tsx`: ca. 2937 Zeilen
- `client/src/pages/designer.tsx`: ca. 2263 Zeilen
- `server/routes.ts`: ca. 7435 Zeilen
- `server/pdf-generator.ts`: ca. 2219 Zeilen
- `shared/schema.ts`: ca. 2319 Zeilen

Das ist ein Stabilitaetsrisiko. Viele fachliche Entscheidungen, UI-Zustand, API-Aufrufe, Berechnung und Darstellung liegen zu dicht zusammen.

### 2. TypeScript ist wieder ein Grund-Sicherheitsnetz

`npm run check` ist aktuell gruen. Das ist ein wichtiger Fortschritt, aber noch kein Freifahrtschein:

- grosse Dateien enthalten weiterhin viele fachliche Verantwortlichkeiten
- einige Bereiche nutzen weiterhin `any`/lokale Mapping-Bruecken
- API-Routen, Dokumenteditor und PDF-Pfade muessen weiter in kleinere, testbare Einheiten zerlegt werden

Solange die Monolith-Dateien gross bleiben, ist TypeScript zwar hilfreich, aber nicht ausreichend.

### 3. Testschiene ist vorhanden, muss aber weiter wachsen

In `package.json` existieren jetzt `test`, `check`, `build`, `smoke:local`, `smoke:browser`, `verify` und `verify:full`.

Die Testschiene deckt zentrale Dokumenteditor-, Nummern-, Jumbo-, Formular-, Projektbaum-, Sicherheits- und Browserablaeufe ab. Sie muss aber noch um echte Datenbank-Integrationsfaelle, PDF-Vergleich und weitere Finanzablaeufe erweitert werden.

### 4. Dokumenteditor ist das Kernrisiko

Der Dokumenteditor steuert gleichzeitig:

- Dokumentdaten laden/speichern
- Positionen, Jumbos, Texte, Titel, Summen
- Nummerierung
- Kalkulation
- Formularauswahl
- Seitenumbruch
- A4-Vorschau
- Toolbar, Sidebar, Dialoge, Drag & Drop
- Konvertierungen
- Locks und Autosave

Das muss entkoppelt werden, sonst bleibt jede Verbesserung langsam und riskant.

### 5. Design/UX ist funktional, aber noch nicht produktreif

Aktuelle Stoerstellen:

- zu viele gleich gewichtete Navigationspunkte
- Sidebar wirkt wie eine Modulliste statt wie ein taegliches Arbeitscockpit
- Dokumenteditor hat starke Werkzeuge, aber noch keine ruhige visuelle Hierarchie
- wichtige Informationen konkurrieren rechts/oben/links gleichzeitig
- Einstellungen enthalten teilweise Optionen ohne gesichertes Verhalten
- viele Seiten wirken wie einzelne Replit-Prototypen statt wie ein zusammenhaengendes Produkt

## Arbeitsmodus ab jetzt

### Keine grossen neuen Funktionen ohne Sicherheitsnetz

Neue Features nur, wenn sie:

- ein konkretes Problem aus der Prioritaetenliste loesen
- reproduzierbar getestet werden koennen
- nicht weiter in die grossen Monolith-Dateien hineingepatcht werden

### Agenten sinnvoll parallel einsetzen

Mehrere Agenten ja, aber nur mit klar getrennten Aufgaben:

- Agent A: HAPAK-Sollverhalten aus Hilfe/Screenshots extrahieren
- Agent B: Dokumenteditor-Architektur auditieren
- Agent C: Testfaelle und Regressionen aufbauen
- Agent D: Designsystem und UI-Redesign vorbereiten
- Hauptintegration: kontrollierte Umsetzung und Review

Keine parallelen Schreibzugriffe auf dieselben Dateien.

## Phase 0 - Arbeitsfaehigkeit herstellen

Ziel: Die App muss jederzeit startbar, pruefbar und reproduzierbar sein.

Aufgaben:

1. Devserver-Start unter Windows stabilisieren. **Status: weitgehend erledigt, aber Prozess-Neustart bleibt manuell zu beachten.**
2. `npm run check` in Kategorien aufteilen und erste rote Kernfehler beheben. **Status: erledigt, check ist gruen.**
3. Ein minimales Testscript einfuehren. **Status: erledigt und erweitert.**
4. Eine kleine Demo-Datenbasis fest definieren. **Status: vorhanden, muss fuer Abnahme noch strenger dokumentiert werden.**
5. Eine Smoke-Test-Liste fuer die wichtigsten Seiten erstellen. **Status: erledigt, Browser-Smoke vorhanden.**

Definition of Done:

- App startet lokal reproduzierbar. **Erfuellt mit aktuellem Startscript, solange das Serverfenster offen bleibt.**
- Dokument 1 laedt ohne Runtime Error. **Erfuellt im Browser-Smoke.**
- `npm run check` ist mindestens fuer die Kern-Engine gruen oder separat pruefbar. **Erfuellt fuer das Gesamtprojekt.**
- Smoke-Test kann in unter 2 Minuten ausgefuehrt werden. **Erfuellt.**

## Phase 1 - Dokumenteditor stabilisieren

Ziel: Dokumentarbeit muss vertrauenswuerdig werden.

Prioritaeten:

1. Gemeinsames Item-Datenmodell schaffen.
2. `EditorItem` und `DocumentItemData` vereinheitlichen oder sauber mappen.
3. Berechnung aus UI-Komponenten herausziehen.
4. Pagination als reine Engine absichern.
5. PDF und Editor sollen dieselbe Bundle-/Layout-Quelle verwenden.
6. Freitext, Titel, Positionen, Jumbos und Summen als Regressionstests abdecken.

Definition of Done:

- Nummerierung, Summen, Jumbos und Freitext sind testbar.
- Editor und PDF weichen nicht unkontrolliert voneinander ab.
- Dokument laden/speichern/neu laden veraendert keine Daten unbeabsichtigt.

## Phase 2 - Designsystem und neues Bediengefuehl

Ziel: Die App soll wie ein hochwertiges Arbeitswerkzeug wirken.

Richtung:

- ruhige, dichte ERP-Oberflaeche statt dekorativer Demo-Look
- klare Modulgruppen: Arbeit, Projekte, Finanzen, Stammdaten, Verwaltung
- Dokumenteditor als zentrale Werkbank mit Fokus auf A4-Arbeitsbereich
- weniger optische Lautstaerke, mehr Orientierung
- bessere Zustandsanzeigen: gespeichert, Entwurf, Fehler, Projektbezug, Formular
- moderne Schnellaktionen statt ueberladener Menues

Konkrete erste Design-Aufgaben:

1. Navigation neu gewichten.
2. Dokumenteditor-Topbar vereinfachen.
3. Rechte Sidebar in klarere Panels gliedern.
4. Projektuebersicht als echtes Arbeitscockpit neu denken.
5. Einstellungen entschlacken: nur Optionen anzeigen, die wirklich wirken.

## Phase 3 - Tests als Beschleuniger

Ziel: Schneller werden durch automatisches Vertrauen.

Erste Regressionen:

- Angebot neu erstellen: Nummer `26-00001`-Logik
- Kunde ab `10000`
- Projekt ab `26-0001`
- Dokument wird Projektbaum zugeordnet
- Formular-Voreinstellung wird beim neuen Dokument angewendet
- Dokumenttyp-spezifische Formular-Voreinstellung wird in Editor, Server-Preview und PDF gleich aufgeloest
- Formular-Designer speichert Dokumenttypen intern als stabile Keys und zeigt nur Labels an
- Freitext mit 1, 2, 6, 10 Zeilen
- Manuelle Seitenumbrueche werden in `document_items.page_break_before` gespeichert
- Jumbo-/Material-Kalkulationsdaten behalten `material_cost` und `article_number` ueber Save/Reload/Preview
- Jumbo berechnet aus Unterpositionen
- Jumbo-Pauschalpreis nur als bewusste Uebersteuerung
- Speichern, Neuladen, PDF erzeugen

## Phase 4 - Moderne Faehigkeiten

Erst wenn Phase 0 bis 2 stabil sind:

- API-Schicht dokumentieren
- Automationen fuer Angebote, Rechnungen, Belege
- KI-Unterstuetzung fuer Textvorschlaege, Kalkulationspruefung, Belegerkennung
- Schnittstellen fuer Einkauf, Lieferanten, GAEB/IDS/UGL, Buchhaltung
- Rechte/Rollen und Audit-Log

## Sofort naechste Schritte

1. Dokumenteditor weiter als Kernprodukt absichern: Speichern/Reload/PDF fuer Angebot, Rechnung, freies Dokument und Lieferschein.
2. PDF-/Preview-Abgleich verbessern: gleiche Formularlogik, gleiche Positionen, gleiche Summen, keine Logo-/Fallback-Altlasten.
3. Rechnungsausgang und Projektbaum als zusammenhaengenden Ablauf testen: Projekt -> Angebot -> Auftragsbestaetigung -> Rechnung.
4. Einstellungen systematisch einordnen: wirkt, wirkt teilweise, wirkt nicht; nicht wirksame Optionen entweder anbinden oder ausblenden.
5. Designsystem gezielt angehen, sobald die Dokumentwerkbank in den Kernablaeufen stabil bleibt: Navigation, Topbar, Inspector, mobile/tablet Layout.
