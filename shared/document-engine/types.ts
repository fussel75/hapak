/**
 * Document Engine — Zentrale Typdefinitionen
 * 
 * Diese Typen werden sowohl vom React-Editor als auch vom PDF-Generator genutzt.
 * Keine UI-Abhängigkeiten, keine React-Importe.
 */

// ─── Input-Bundle ─────────────────────────────────────────────────────────────

export interface DocumentBundle {
  document: DocumentData;
  items: DocumentItemData[];
  customer?: CustomerData;
  project?: ProjectData;
  companySettings?: CompanySettingsData;
  template?: FormTemplateData;
}

export interface DocumentData {
  id?: number;
  documentNumber: string;
  type: string;
  customerId: number;
  projectId?: number | null;
  parentDocumentId?: number | null;
  subject?: string | null;
  title?: string | null;
  date: string;
  validUntil?: string | null;
  status: string;
  headerText?: string | null;
  footerText?: string | null;
  beforeWorkText?: string | null;
  beforeTotalsText?: string | null;
  afterTotalsText?: string | null;
  netTotal?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
  grossTotal?: string | null;
  laborTotal?: string | null;
  previouslyInvoiced?: string | null;
  abschlagNumber?: number | null;
  paymentTermDays?: number | null;
  skontoDays?: number | null;
  skontoPercent?: string | null;
  skontoBase?: string | null;
  skontoImDokument?: boolean | null;
  skontoNurMaterial?: boolean | null;
  retentionPercent?: string | null;
  paidAmount?: string | null;
  formTemplateId?: number | null;
  hideNetto?: boolean | null;
  hideMwst?: boolean | null;
  hideGesamt?: boolean | null;
  showLohnanteil?: boolean | null;
}

export interface DocumentItemData {
  id?: number;
  documentId?: number;
  positionNumber?: string;
  type: string;
  title?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: string | null;
  unitPrice?: string | null;
  totalPrice?: string | null;
  laborPrice?: string | null;
  materialPrice?: string | null;
  materialCost?: string | null;
  parentItemId?: number | null;
  sortOrder?: number | null;
  positionFlag?: string | null;
  flagLabel?: string | null;
  laborCost?: string | null;
  equipmentCost?: string | null;
  externalCost?: string | null;
  laborMarkup?: number | string | null;
  materialMarkup?: number | string | null;
  equipmentMarkup?: number | string | null;
  externalMarkup?: number | string | null;
  laborTime?: string | null;
  priceFollowsCost?: boolean | null;
  pageBreakBefore?: boolean;
  originalQuantity?: string | null;
  afterTotals?: boolean | null;
  discountPercent?: string | null;
  discountBase?: string | null;
  articleNumber?: string | null;
  posNumber?: string | null;
  manualPosNr?: string | null;
  fontBold?: boolean | null;
  fontItalic?: boolean | null;
  fontUnderline?: boolean | null;
  fontSize?: number | null;
  fontColor?: string | null;
  _clientId?: string;
  _parentClientId?: string | null;
}

export interface CustomerData {
  id?: number;
  customerNumber?: string;
  salutation?: string | null;
  name: string;
  name2?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
}

export interface ProjectData {
  id?: number;
  projectNumber?: string;
  name: string;
  description?: string | null;
}

export interface CompanySettingsData {
  companyName?: string;
  companyName2?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  website?: string | null;
  taxId?: string | null;
  vatId?: string | null;
  managingDirector?: string | null;
  bankName?: string | null;
  iban?: string | null;
  bic?: string | null;
  logoUrl?: string | null;
  materialMarkupPercent?: string;
  defaultFormTemplateId?: number | null;
}

export interface FormTemplateData {
  id?: number;
  name: string;
  type?: string;
  fields?: TemplateField[];
  fieldsPage2?: TemplateField[];
  workArea?: WorkAreaConfig | null;
}

export interface TemplateField {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  typ: string; // "Bild" | "Text" | "Variabel" | "Arbeitsbereich"
  inhalt: string;
  aktiv?: boolean;
  drucken?: boolean;
  font?: string;
  farbe?: string;
  ausrichtung?: string;
  imageUrl?: string;
}

export interface EndsummeConfig {
  schriftart?: string;
  schriftartGesamt?: string;
  labelNetto?: string;
  labelMwst?: string;
  labelGesamt?: string;
  labelLohn?: string;
  linienBreite?: number;
  linienBreiteGesamt?: number;
  abstandZeilen?: number;
}

export interface WorkAreaConfig {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  schriftart?: string;
  zeilenAbstand?: number;
  linienBreite?: number;
  spalten: WorkAreaColumn[];
  tabellenkopf?: {
    hintergrund?: string;
    schriftart?: string;
    rahmen?: boolean;
  };
  endsumme?: EndsummeConfig;
}

export interface WorkAreaColumn {
  name: string;
  breite: number;
  ausrichtung: string;
}

// ─── Computed Output ──────────────────────────────────────────────────────────

export interface ComputedDocumentBundle {
  source: DocumentBundle;
  computed: {
    visibleItems: ComputedItem[];
    numbering: Map<string, string>; // itemId → "1.2"
    totals: DocumentTotals;
  };
  template: ResolvedTemplate;
  layout: LayoutResult;
}

export interface ComputedItem extends DocumentItemData {
  computedTotalPrice: number;
  computedUnitPrice: number;
  computedQuantity: number;
  isVisible: boolean;
  isAlternativ: boolean;
  isBedarf: boolean;
  posNumber: string;
  children?: ComputedItem[]; // Jumbo-Unterpositionen
}

export interface DocumentTotals {
  netTotal: number;
  taxRate: number;
  taxAmount: number;
  grossTotal: number;
  laborTotal: number;
  materialTotal: number;
  equipmentTotal: number;
  externalTotal: number;
  skontoPercent: number;
  skontoAmount: number;
  previouslyInvoiced: number;
  payableAmount: number;
}

export interface ResolvedTemplate {
  fields?: TemplateField[];
  fieldsPage2?: TemplateField[];
  page1Fields: TemplateField[];
  page2Fields: TemplateField[];
  workArea: WorkAreaConfig;
  workAreaPage1: { x: number; y: number; w: number; h: number };
  workAreaPage2: { x: number; y: number; w: number; h: number };
  footerYPage1: number;
  footerYPage2: number;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export type LayoutBlockType =
  | "tableHeader"
  | "positionRow"
  | "titleRow"
  | "titleSumRow"
  | "subtotalRow"
  | "textRow"
  | "jumboRow"
  | "jumboChildRow"
  | "abschlussBlock"
  | "skontoRow"
  | "carryForward"
  | "headerText"
  | "footerText"
  | "beforeWorkTextBlock"
  | "beforeTotalsTextBlock"
  | "afterTotalsTextBlock"
  | "summaryBlock";

export interface LayoutBlock {
  type: LayoutBlockType;
  itemIndex?: number;
  itemId?: string;
  estimatedHeight: number;
  keepWithNext?: boolean;
  data?: Record<string, any>;
  splitPart?: "top" | "bottom";
  splitClipHeight?: number;
  splitOffsetHeight?: number;
  splitAfterLines?: number;
  charsPerLine?: number;
  splitPartIndex?: number;
}

export interface PageModel {
  pageNumber: number;
  isFirstPage: boolean;
  blocks: LayoutBlock[];
  carryForwardIn: number;
  carryForwardOut: number;
  remainingHeight?: number;
  isAfterTotals?: boolean;
}

export interface LayoutResult {
  pages: PageModel[];
  totalPages: number;
}
