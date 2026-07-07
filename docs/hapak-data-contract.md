# HAPAK Data Contract

Dieses Dokument ist die verbindliche Datenlandkarte fuer HAPAK-Importe. Es soll verhindern, dass sichtbare UI-Werte oder kumulierte Dokumentfelder als Wahrheit uebernommen werden.

## Grundsatz

HAPAK speichert viele Werte redundant. Sichtbare Dokumente, Projektbaum und Auswertungen sind nicht dieselbe Datenquelle.

Die App muss deshalb pro Fachbereich eine klare Quelle verwenden:

| Bereich | Primaere Quelle | Verbindung | Wichtigste Regel |
|---|---|---|---|
| Projekte | `Daten/DOKUMENT.DBF` Projektkopf | `NAME = PROJNAME` | sichtbare Projektnummer wird aus HAPAK-Projektschluessel abgeleitet; interner Schluessel bleibt `PROJNAME` |
| Dokumente | `Daten/DOKUMENT.DBF` | `NAME` | Dokumente sind Arbeitsobjekte, nicht zwingend Finanzwahrheit |
| Positionen | `Daten/<NAME>.DBF` | `DOKUMENT.NAME` | Positionen enthalten Kalkulationsstruktur, Jumbos, Titel, Texte und errechnete Zeilen |
| Rechnungsausgang | `Fibu/FIBUZWO.DBF` | `ART='RA'`, `RNR -> DOKUMENT.NAME`, `KTR -> PROJNAME` | fuer Projektumsatz nur Hauptzeilen `IDX=0`, nicht stornierte Zeilen |
| Rechnungseingang | `Fibu/FIBUZWO.DBF` | `ART='RE'`, `KTR -> PROJNAME` | Kosten kommen aus FIBU, Kostenart aus Konto-Feldern |
| Zahlungen, Skonto, offen | `Fibu/FIBUZWO.DBF` | `RE_ID` Gruppe, `IDX` Folgezeilen | Zahlungsstand kommt aus FIBU, nicht aus Dokumentstatus allein |
| Kunden/Lieferanten | `Adressen/ADRESSEN.DBF` | `KU_NR` | Kundennummer bleibt HAPAK-Nummer |
| Lohn/Zeit | `Lohn/LOHNBUCH.DBF` und Zeit-API | `KTR -> PROJNAME`, Personalnummer | Kosten = Stunden/Minuten mal EK-Satz; Storno ignorieren |
| SKR/Konten/Steuer | `Fibu/KONTO.DBF`, `Fibu/STEUERSATZ.DBF` | Kontonummer, Steuer-ID | Kontosystem ist Grundlage fuer SK03/SK04-Mapping |

## Schluessel

- `PROJNAME` / `KTR`: stabiler HAPAK-Projektschluessel, z. B. `PZZ25000008`.
- `project_number`: sichtbare Nummer in unserer App, z. B. `25-0008`.
- `projects.cost_center` und `projects.import_source_key`: muessen den HAPAK-Projektschluessel enthalten.
- `DOKUMENT.NAME`: stabiler HAPAK-Dokumentschluessel, z. B. `RZZ2600058`.
- `documents.document_number`: sichtbare Nummer, nicht eindeutig genug fuer Importlogik.
- `FIBUZWO.RE_ID + IDX`: Buchungsgruppe und Zeilenindex.

## Projektfinanzen

Projektfinanzen duerfen nicht aus `documents.net_total` oder `documents.gross_total` summiert werden.

Warum: HAPAK speichert Abschlagsrechnungen in `DOKUMENT.DBF` oft kumulativ. Addiert man diese Werte, entstehen Fantasiesummen.

Zulaessige Regel:

- Einnahmen: `FIBUZWO`/`fibu_buchungen` mit `ART='RA'`, `IDX=0`, `STORNOFLAG != 2`, `KTR = projects.cost_center/import_source_key`.
- Ausgangsrechnungen: `TYP='HR'`.
- Gutschriften: `TYP='HG'`, als Abzug mit `ABS(...)`.
- Zahlung, offen, Skonto, Minderung: aus denselben FIBU-Hauptzeilen bzw. deren Zahlungsfeldern.
- Eingangsrechnungen/Kosten: `ART='RE'`, `IDX=0`, `STORNOFLAG != 2`, Projekt-KTR.

## Dokumentimport

Dokumente bleiben bearbeitbar, aber Finanzsummen sind nicht automatisch wahr.

- `DOKUMENT.NETTO/MWST/BETRAG` wird fuer Dokumentanzeige und historische Rekonstruktion importiert.
- Bei Rechnungen wird der Finanzstatus aus FIBU synchronisiert.
- Leere freie Dokumente, die in HAPAK nur Ordner ersetzen, werden nicht als Arbeitsdokument gezeigt, sondern als Projektordner.
- Positionsdateien muessen mit FPT gelesen werden, sonst fehlen Langtexte und Kalkulationsdetails.

## Positionsdatenbanken

Jedes HAPAK-Dokument hat potentiell eine eigene Positionsdatenbank `Daten/<DOKUMENT.NAME>.DBF`.
Diese Datei ist fuer den Inhalt des Dokuments genauso wichtig wie `DOKUMENT.DBF`.

Zu importieren und fachlich zu verstehen sind mindestens:

- Titel, Untertitel, freie Texte, Floskeln, Summenzeilen und Abschluesse.
- Leistungs-, Material-, Lohn-, Fremdleistungs- und Jumbo-Positionen.
- Positionsnummern inklusive manuell abgeschalteter automatischer Nummerierung.
- Mengen, Mengeneinheiten und sichtbare Rundung.
- Langtexte/Memos aus der zugehoerigen FPT-Datei.
- Kalkulationsfelder fuer EK/VK, Lohnzeit, Material, Geraet, Fremdleistung, Zuschlaege, Steuer- und Erloeskonto.
- Flags fuer interne Positionen, Alternativ-/Bedarfspositionen, Pauschalpreis und Detailkalkulation.
- Jumbo-Eltern/Kinder-Beziehungen, auch wenn HAPAK Kinder im Ausdruck wahlweise ein- oder ausblendet.

Positionssummen duerfen nur aus den importierten Positionsdaten nach unseren zentralen Engine-Regeln rekonstruiert werden. Importierte HAPAK-Summenzeilen sind Hinweise oder historische Anzeige, aber keine unkontrollierte Wahrheit.

## Eingangsrechnungen und FIBU-Zusatzdaten

Eingangsrechnungen sind nicht nur normale Dokumente.

- `DOKUMENT.ID = "5"` kennzeichnet Eingangsrechnungen im Dokumentbestand.
- Finanztechnisch massgeblich ist `FIBUZWO.DBF` mit `ART='RE'`.
- `FIBUADD.DBF` muss mit `RE_ID/RNR` gegen `FIBUZWO` auditiert werden, bevor Zusatzfelder importiert werden.
- Kostenarten entstehen aus Konten, nicht aus UI-Titeln:
  - Material/Wareneingang typischerweise Kontenbereich `54xx`
  - Fremdleistungen typischerweise `59xx`
  - weitere Konten muessen explizit gemappt werden.
- Zahlungen, Skonto, Minderung, offene Betraege und Storno kommen aus FIBU-Buchungen.

## Jumbos und Kalkulation

Jumbos sind keine pauschalen Positionen, nur weil ein Einzelpreis sichtbar ist.

- Die Kalkulationsart ergibt sich aus den HAPAK-Positionsdaten.
- Detail-Kalkulation kann Material, Lohn, Geraet und Fremdleistung enthalten.
- HAPAK-Jumbos ohne sichtbare Kinder koennen trotzdem eine detaillierte Eltern-Kalkulation haben.
- Wenn Kosten auf dem Eltern-Jumbo liegen, duerfen keine synthetischen Kinder erfunden werden.
- Sichtbare Menge hat im Dokument maximal zwei Nachkommastellen; intern darf praeziser gerechnet werden.

## Noch zu vervollstaendigen

Diese Punkte muessen vor einem Vollimport je Tabelle mit Beispielen auditiert werden:

- vollstaendige Feldliste `DOKUMENT.DBF` inklusive Status-/Formular-/Kalkulationsflags
- vollstaendige Positions-DBF-Struktur je Positionsart
- FIBU-Zusatzdaten `FIBUADD.DBF`
- Konten- und Steuer-Mapping nach Zielkontenrahmen
- Lohnarten, Mitarbeiter, AG-Kosten und Zeit-API-Abgleich
- Material-, Leistungs- und Jumbo-Stammdaten
- Projektbaum-/Bezugsdokument-Regeln inklusive HAPAK-Ordnerersatz
