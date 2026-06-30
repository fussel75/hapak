# FriStD-Bau ZuB - Angebots- und Rechnungsverwaltung

## Overview
This project is a web-based ERP, quote, and invoice management application for FriStD-Bau ZuB GmbH & Co.KG. It aims to modernize business processes for carpentry, timber construction, roofing, heating, plumbing, and heat pump services by replacing legacy desktop software. The system will streamline operations, enhance financial tracking, document management, and support 4-5 users across all essential ERP modules, providing a unified platform for efficient business operations. The application features a comprehensive, full German-language web UI.

## User Preferences
No specific user preferences were provided in the original document.

## System Architecture
The application is built with a modern web stack:
- **Frontend**: React, Vite, TailwindCSS, shadcn/ui, wouter.
- **Backend**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Passport.js (local strategy), scrypt, connect-pg-simple.
- **PDF Generation**: Puppeteer (Chromium HTML-to-PDF) with a 2-pass measure-then-paginate approach, using Liberation Sans fonts for consistent rendering.

**Key Architectural Decisions and Features:**
*   **Modular Design**: Organized into modules for Dashboard, Document & Project Management, Finance, HR & Time, Calculation, Organization, Warehouse & Materials, and Master Data.
*   **Document Editor**: Advanced editor supporting "Hapak-Stil Tabelle" for positions, auto-numbering, JUMBO sub-positions, a 4-category calculation dialog, drag & drop, configurable end-texts, WYSIWYG A4-page layout, keyboard navigation, slash-menu, and AI-powered text suggestions. Includes multi-document tab system.
*   **Dashboard**: Provides KPI cards, quick actions, and revenue analysis.
*   **Roles & Permissions**: Granular role-based access control with 7 predefined roles.
*   **UI/UX Design**: Features a dark gradient sidebar with cyan accent and a primary cyan/teal color scheme.
*   **Document Workflow**: Supports standard construction document progression (Quote → Order Confirmation → Advance Invoice(s) → Final Invoice) and various document types, including "Mitschnitt". Incorporates 14 Hapak-style position types.
*   **Master Data**: Centralized address management ("Adress-Stamm").
*   **Settings Page**: Administration interface for company data, bank details, tax data, calculation defaults, user management, and role/permission matrix.
*   **Form Designer**: Visual drag-and-drop A4 template editor ("Formulardesigner").
*   **Document Conversion**: Backend functionality for converting documents while adhering to HAPAK-compliant rules.
*   **Financial Accounting (FIBU)**: `fibu_buchungen` table as the single source of truth for all financial calculations, integrated with invoice processes, supporting various booking types, payment statuses, and settlement methods. Includes detailed API for transactions and statistics, sales & purchase ledgers, and FiBu reference data. FIBUZWO.DBF TYP=HR records contain the actual invoice amounts (non-cumulative), which are stored in documents as `fibu_netto`, `fibu_brutto`, `fibu_zahlung`, `fibu_skonto`, `fibu_offen`. These FIBU values are the authoritative source for invoice totals in project summaries (replacing the cumulative NETTO/ABSNETTO from DOKUMENT.DBF).
*   **Bank Module**: Bank account management under Finanzen → Bank, supporting CRUD for bank accounts with different bank types and cached balances/transaction history. Features SEPA transfer management with IBAN validation, approval workflow, and payment-to-invoice matching.
*   **HAPAK NAS Sync**: Full sync module with dry-run preview, connecting to Synology NAS to read HAPAK DBF/FPT files and sync Customers, Documents, Positions, FiBu-Buchungen, FiBu-Zusatzdaten, Reference data, Project-Document links, and Payment status. HAPAK data is authoritative. FLAGS field (C8 hex bitmask) is parsed for Alternativ/Bedarf recognition: Bit 6 (0x40) = Bedarf, Bit 1 (0x02) + Bit 19 (0x80000) = Alternativ. These positions are excluded from net totals.
*   **HAPAK Abschlagsrechnungen — kumulative Beträge**: HAPAK speichert Abschlagsrechnungen mit **kumulativen** Beträgen in der DB (netTotal/grossTotal), NICHT inkrementell. Der tatsächliche Rechnungsbetrag einer Abschlagsrechnung ist immer das **Delta** (Differenz der Items-Summen zur vorherigen Abschlagsrechnung in der Kette). Diese Delta-Berechnung muss überall verwendet werden: Auswahldialog, Verrechnungstabelle, Print-Ansicht, Zahlbetrag. Niemals die DB-Werte netTotal/grossTotal direkt als Rechnungsbetrag anzeigen.
*   **Retention Management**: Configurable security retention percentage on documents, displayed in UI and PDF output.
*   **Post-Calculation**: Comprehensive module for "Nachkalkulation" (post-calculation) with HAPAK-style Soll-Ist-Vergleich, providing project overviews and detailed drill-downs.
*   **Labor Calculation**: Integrated labor cost calculation in the calculation dialog showing self-cost, calculated sales rate, and time requirements.
*   **Display Modes**: Editor toolbar dropdown with HAPAK-typical display options (Full, Short List, Sums List, No Prices, Work Time List) affecting editor, PDF preview, and PDF export.
*   **AI Text Dialog**: AI text generation/optimization with 5 modes (generate, improve, shorten, technical, customer-friendly) and options for replacing or appending text.
*   **Print Preview**: Full-screen HTML live preview for documents in an A4 print layout, supporting PDF download, printing, and email stub generation, including multi-page layout with carry-over logic.

## External Dependencies
*   **PostgreSQL**: Primary database.
*   **Passport.js**: Authentication middleware.
*   **PDFKit**: Server-side PDF generation.
*   **Resend**: Email sending service.
*   **connect-pg-simple**: PostgreSQL-backed session store.
*   **Multi-Provider AI System**: Abstraction layer supporting Anthropic, OpenAI, Google, Perplexity, and Mistral.
*   **Zeiterfassungs-API (Partner-App)**: External time-tracking API for projects and time entries.
*   **NAS-Positions-Import**: Script to import document position data from HAPAK DBF files (CP1252 encoding), handling `TEXTDATA` for multi-line position texts and specific `ID` field parsing for position types.
*   **Hapak NAS Import**: Automated import of FRM form templates and LST list templates from legacy Hapak systems.
*   **HAPAK-Datenimport (all Modules)**: Comprehensive import of HAPAK data including services, trades, FIBU bookings, additional FIBU data, post-calculation data, and incoming invoices.
*   **NAS-Sync-Skript**: Automated 13-step sync from Synology NAS for new records, including documents, customers, FiBu bookings, reference data, Abschlag-Verrechnungen, and payment status. Kontakttyp-Erkennung via ADRESSEN.DBF `ID`-Feld (K=Kunde, L=Lieferant, I=Interessent, P=Personal). Skonto-Positionen werden als `skonto`-Items importiert. Vortexte → `before_work_text`, Nachtexte → `after_totals_text`. `parent_document_id` aus BEZUGNAME, `erloeskonto` aus KONTO, `created_at` aus ERSTELLDAT. RE-Buch erstellt fehlende Eingangsrechnungen aus FIBU-Daten. Lieferanten-Autocomplete im Eingangsrechnungs-Dialog.