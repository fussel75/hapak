import type { CompanySettings, EditorSettings } from "../schema";

type EditorDocumentForm = {
  type: string;
  formTemplateId?: number | null;
  dezimalstellenMengen: number;
  dezimalstellenPreise: number;
  positionenEnthaltenUst: boolean;
  paymentTermDays: number;
  skontoPercent: string;
  skontoDays: number;
  autoPositionNumbers: boolean;
  positionNumberStep: number;
  positionNumberStart: number;
  selbstkostenLohnsatz: string;
  kalkulierterLohnsatz: string;
  aufschlagMaterial: string;
  aufschlagGeraete: string;
  aufschlagFremdleistung: string;
  kupferpreisBeruecksichtigen: boolean;
  kupferNotation: string;
  langtexteFormatiert: boolean;
  kurztexteAnzeigen: boolean;
  jumboListenAnzeigen: boolean;
  einzelpreiseInJumbo: boolean;
  mengenInJumbo: boolean;
  skontoNurMaterial: boolean;
};

function decimalToString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).replace(",", ".");
}

function parsePositiveId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getDocumentTypeDefaultFormTemplateId(
  editorSettings: Pick<EditorSettings, "dokumenttypen"> | null | undefined,
  documentType: string,
): number | null {
  const raw = editorSettings?.dokumenttypen?.[documentType]?.formTemplateId;
  return parsePositiveId(raw);
}

export function getEffectiveFormTemplateId(options: {
  documentFormTemplateId?: number | null;
  documentTypeDefaultFormTemplateId?: number | null;
  companyDefaultFormTemplateId?: CompanySettings["defaultFormTemplateId"] | null;
}): number | null {
  return (
    parsePositiveId(options.documentFormTemplateId) ||
    parsePositiveId(options.documentTypeDefaultFormTemplateId) ||
    parsePositiveId(options.companyDefaultFormTemplateId)
  );
}

export function getNewDocumentDefaultFormTemplateId(options: {
  editorSettings?: Pick<EditorSettings, "dokumenttypen"> | null;
  documentType: string;
  companyDefaultFormTemplateId?: CompanySettings["defaultFormTemplateId"] | null;
}): number | null {
  return getEffectiveFormTemplateId({
    documentTypeDefaultFormTemplateId: getDocumentTypeDefaultFormTemplateId(
      options.editorSettings,
      options.documentType,
    ),
    companyDefaultFormTemplateId: options.companyDefaultFormTemplateId,
  });
}

export function applyEditorSettingsToNewDocument<T extends EditorDocumentForm>(
  form: T,
  editorSettings: EditorSettings | null | undefined,
): T {
  if (!editorSettings) return form;

  const defaultSkonto = decimalToString(editorSettings.defaultSkonto);
  const selbstkostenLohnsatz = decimalToString(editorSettings.selbstkostenLohnsatz);
  const kalkulierterLohnsatz = decimalToString(editorSettings.kalkulierterLohnsatz1);
  const aufschlagMaterial = decimalToString(editorSettings.aufschlagMaterial1);
  const aufschlagGeraete = decimalToString(editorSettings.aufschlagGeraete);
  const aufschlagFremdleistung = decimalToString(editorSettings.aufschlagFremdleistung);
  const kupferNotation = decimalToString(editorSettings.kupferNotation);

  return {
    ...form,
    dezimalstellenMengen: editorSettings.dezimalstellenMengen ?? form.dezimalstellenMengen,
    dezimalstellenPreise: editorSettings.dezMaterialPreise ?? form.dezimalstellenPreise,
    positionenEnthaltenUst: editorSettings.preiseInklUst ?? form.positionenEnthaltenUst,
    paymentTermDays: editorSettings.defaultZahlungsziel ?? form.paymentTermDays,
    skontoPercent: defaultSkonto ?? form.skontoPercent,
    autoPositionNumbers: editorSettings.autoPositionNumbers ?? form.autoPositionNumbers,
    positionNumberStep: editorSettings.positionNumberStep ?? form.positionNumberStep,
    positionNumberStart: editorSettings.positionNumberStart ?? form.positionNumberStart,
    selbstkostenLohnsatz: selbstkostenLohnsatz ?? form.selbstkostenLohnsatz,
    kalkulierterLohnsatz: kalkulierterLohnsatz ?? form.kalkulierterLohnsatz,
    aufschlagMaterial: aufschlagMaterial ?? form.aufschlagMaterial,
    aufschlagGeraete: aufschlagGeraete ?? form.aufschlagGeraete,
    aufschlagFremdleistung: aufschlagFremdleistung ?? form.aufschlagFremdleistung,
    kupferpreisBeruecksichtigen: editorSettings.kupferBeruecksichtigen ?? form.kupferpreisBeruecksichtigen,
    kupferNotation: kupferNotation ?? form.kupferNotation,
    langtexteFormatiert: editorSettings.langtexteFormatiert ?? form.langtexteFormatiert,
    kurztexteAnzeigen: editorSettings.kurztexteVerwenden ?? form.kurztexteAnzeigen,
    jumboListenAnzeigen: editorSettings.jumboListenAnzeigen ?? form.jumboListenAnzeigen,
    einzelpreiseInJumbo: editorSettings.ePreiseInJumbo ?? form.einzelpreiseInJumbo,
    mengenInJumbo: editorSettings.mengenInJumbo ?? form.mengenInJumbo,
    skontoNurMaterial: editorSettings.skontoNurMaterial ?? form.skontoNurMaterial,
    skontoDays: editorSettings.defaultSkontoTage ?? form.skontoDays,
  };
}
