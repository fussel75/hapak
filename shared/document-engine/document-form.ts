import type { Document } from "../schema";

export type DocumentEditorForm = {
  type: string;
  customerId: number;
  projectId: number;
  subject: string;
  date: string;
  validUntil: string;
  status: string;
  headerText: string;
  footerText: string;
  beforeWorkText: string;
  beforeTotalsText: string;
  afterTotalsText: string;
  taxRate: string;
  paymentTermDays: number;
  skontoDays: number;
  skontoPercent: string;
  retentionPercent: string;
  documentNumber: string;
  customTypeLabel: string | null;
  formTemplateId: number | null;
  hideNetto: boolean;
  hideMwst: boolean;
  hideGesamt: boolean;
  showLohnanteil: boolean;
  abschlagVerrechnungen: any[];
  erstellungsort: string;
  leistungsDatumVon: string;
  leistungsDatumBis: string;
  postausgangAm: string;
  wiedervorlageAm: string;
  kundenReferenz: string;
  leitwegId: string;
  bemerkungen: string;
  skontoBase: string;
  skontoImDokument: boolean;
  skontoNurMaterial: boolean;
  retentionDays: number;
  erloeskonto: string;
  steuerklasse: string;
  autoPositionNumbers: boolean;
  positionNumberStep: number;
  positionNumberStart: number;
  dezimalstellenMengen: number;
  dezimalstellenPreise: number;
  positionenEnthaltenUst: boolean;
  einzelpreiseInJumbo: boolean;
  mengenInJumbo: boolean;
  internpositionenVerbergen: boolean;
  kalkulationsschema: string;
  selbstkostenLohnsatz: string;
  kalkulierterLohnsatz: string;
  aufschlagMaterial: string;
  aufschlagGeraete: string;
  aufschlagFremdleistung: string;
  langtexteFormatiert: boolean;
  kurztexteAnzeigen: boolean;
  jumboListenAnzeigen: boolean;
  priceLevel: number;
  kupferpreisBeruecksichtigen: boolean;
  kupferNotation: string;
  par13b: boolean;
  formularfelder: Record<string, string>;
};

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSkontoBase(value: unknown): string {
  return value === "material" ? "material" : "gesamtsumme";
}

export function documentToEditorForm(record: Document): DocumentEditorForm {
  const doc = record as any;
  return {
    type: record.type,
    customerId: record.customerId,
    projectId: record.projectId ?? 0,
    subject: record.subject ?? "",
    date: text(record.date),
    validUntil: text(record.validUntil),
    status: record.status,
    headerText: record.headerText ?? "",
    footerText: record.footerText ?? "",
    beforeWorkText: record.beforeWorkText ?? "",
    beforeTotalsText: record.beforeTotalsText ?? "",
    afterTotalsText: record.afterTotalsText ?? "",
    taxRate: text(record.taxRate, "19.00"),
    paymentTermDays: record.paymentTermDays ?? 14,
    skontoDays: record.skontoDays ?? 0,
    skontoPercent: text(record.skontoPercent, "0.00"),
    retentionPercent: text(record.retentionPercent, "0"),
    documentNumber: record.documentNumber,
    customTypeLabel: record.customTypeLabel ?? null,
    formTemplateId: record.formTemplateId ?? null,
    hideNetto: record.hideNetto ?? false,
    hideMwst: record.hideMwst ?? false,
    hideGesamt: record.hideGesamt ?? false,
    showLohnanteil: record.showLohnanteil ?? false,
    abschlagVerrechnungen: doc.abschlagVerrechnungen ?? [],
    erstellungsort: doc.erstellungsort ?? "Hamburg",
    leistungsDatumVon: text(doc.leistungsDatumVon),
    leistungsDatumBis: text(doc.leistungsDatumBis),
    postausgangAm: text(doc.postausgangAm),
    wiedervorlageAm: text(doc.wiedervorlageAm),
    kundenReferenz: doc.kundenReferenz ?? "",
    leitwegId: doc.leitwegId ?? "",
    bemerkungen: doc.bemerkungen ?? "",
    skontoBase: normalizeSkontoBase(doc.skontoBase),
    skontoImDokument: doc.skontoImDokument ?? true,
    skontoNurMaterial: doc.skontoNurMaterial ?? false,
    retentionDays: doc.retentionDays ?? 0,
    erloeskonto: doc.erloeskonto ?? "4400",
    steuerklasse: doc.steuerklasse ?? "50",
    autoPositionNumbers: doc.autoPositionNumbers ?? true,
    positionNumberStep: doc.positionNumberStep ?? 1,
    positionNumberStart: doc.positionNumberStart ?? 1,
    dezimalstellenMengen: doc.dezimalstellenMengen ?? 2,
    dezimalstellenPreise: doc.dezimalstellenPreise ?? 2,
    positionenEnthaltenUst: doc.positionenEnthaltenUst ?? false,
    einzelpreiseInJumbo: doc.einzelpreiseInJumbo ?? true,
    mengenInJumbo: doc.mengenInJumbo ?? true,
    internpositionenVerbergen: doc.internpositionenVerbergen ?? true,
    kalkulationsschema: doc.kalkulationsschema ?? "spezielle Einstellung",
    selbstkostenLohnsatz: text(doc.selbstkostenLohnsatz, "32.00"),
    kalkulierterLohnsatz: text(doc.kalkulierterLohnsatz, "69.30"),
    aufschlagMaterial: text(doc.aufschlagMaterial, "30.00"),
    aufschlagGeraete: text(doc.aufschlagGeraete, "30.00"),
    aufschlagFremdleistung: text(doc.aufschlagFremdleistung, "30.00"),
    langtexteFormatiert: doc.langtexteFormatiert ?? true,
    kurztexteAnzeigen: doc.kurztexteAnzeigen ?? false,
    jumboListenAnzeigen: doc.jumboListenAnzeigen ?? true,
    priceLevel: doc.priceLevel ?? 1,
    kupferpreisBeruecksichtigen: doc.kupferpreisBeruecksichtigen ?? false,
    kupferNotation: text(doc.kupferNotation, "200.00"),
    par13b: doc.par13b ?? false,
    formularfelder: doc.formularfelder ?? {},
  };
}

export function buildDocumentSavePayload(options: {
  docForm: Record<string, any>;
  nextDocNumber?: string;
  netTotal: number;
  taxAmount: number;
  grossTotal: number;
  laborTotal: number;
  isAbschlagOrSchluss: boolean;
  previouslyInvoiced?: string;
}) {
  const { docForm } = options;
  return {
    ...docForm,
    documentNumber: docForm.documentNumber || options.nextDocNumber || "",
    customerId: docForm.customerId,
    projectId: docForm.projectId || null,
    validUntil: docForm.validUntil || null,
    netTotal: options.netTotal.toFixed(2),
    taxAmount: options.taxAmount.toFixed(2),
    grossTotal: options.grossTotal.toFixed(2),
    laborTotal: options.laborTotal.toFixed(2),
    skontoBase: normalizeSkontoBase(docForm.skontoBase),
    previouslyInvoiced: options.isAbschlagOrSchluss ? options.previouslyInvoiced || "0.00" : undefined,
  };
}

export function getCalculationInputsFromForm(docForm: Pick<DocumentEditorForm, "taxRate" | "skontoPercent" | "skontoDays" | "skontoNurMaterial">) {
  return {
    taxRate: numberValue(docForm.taxRate, 19),
    skontoPercent: numberValue(docForm.skontoPercent, 0),
    skontoDays: numberValue(docForm.skontoDays, 0),
    skontoNurMaterial: docForm.skontoNurMaterial === true,
  };
}
