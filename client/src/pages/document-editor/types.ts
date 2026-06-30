import type { DocumentItem } from "@shared/schema";
import type { JumboPackage as SchemaJumboPackage } from "@shared/schema";

type NumericTextField =
  | "quantity"
  | "unitPrice"
  | "totalPrice"
  | "laborPrice"
  | "materialPrice"
  | "discountPercent"
  | "laborCost"
  | "equipmentCost"
  | "externalCost"
  | "laborMarkup"
  | "materialMarkup"
  | "equipmentMarkup"
  | "externalMarkup"
  | "laborTime"
  | "originalQuantity";

export type EditorItem = Omit<
  Partial<DocumentItem>,
  "type" | "afterTotals" | NumericTextField
> & {
  _clientId: string;
  _parentClientId?: string | null;
  type: string;
  quantity?: string | null;
  unitPrice?: string | null;
  totalPrice?: string | null;
  laborPrice?: string | null;
  materialPrice?: string | null;
  discountPercent?: string | null;
  laborCost?: string | null;
  equipmentCost?: string | null;
  externalCost?: string | null;
  laborMarkup?: number | string | null;
  materialMarkup?: number | string | null;
  equipmentMarkup?: number | string | null;
  externalMarkup?: number | string | null;
  laborTime?: string | null;
  materialCost?: string | null;
  articleNumber?: string | null;
  posNumber?: string | null;
  manualPosNr?: string | null;
  pageBreakBefore?: boolean;
  afterTotals?: boolean | null;
  originalQuantity?: string | null;
};

export type IdsArticle = {
  artikelnummer: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  gesamtpreis: number;
  lieferant: string;
};

export type Phrase = {
  id: number;
  number: string;
  name: string;
  type: string;
  documentType: string;
  text: string;
  active: boolean;
};

export type Material = {
  id: number;
  articleNumber: string;
  searchKey: string;
  name: string;
  unit: string;
  purchasePrice: string;
  salePrice1: string;
  salePrice2: string;
  salePrice3: string;
  group: string;
  taxRate: string;
  active: boolean;
};

export type JumboPackage = SchemaJumboPackage;
