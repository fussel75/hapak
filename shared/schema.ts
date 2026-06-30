import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, boolean, timestamp, decimal, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  role: text("role").notNull().default("mitarbeiter"),
  branch: text("branch"),
  active: boolean("active").notNull().default(true),
  personalNr: text("personal_nr"),
  phone: text("phone"),
  mobile: text("mobile"),
  street: text("street"),
  zip: text("zip"),
  city: text("city"),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  tradeId: integer("trade_id"),
  notes: text("notes"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const contactTypeEnum = ["kunde", "interessent", "lieferant", "personal", "sonstige"] as const;
export type ContactType = typeof contactTypeEnum[number];

export const contactTypeLabels: Record<string, string> = {
  kunde: "Kunde",
  interessent: "Interessent",
  lieferant: "Lieferant",
  personal: "Personal",
  sonstige: "Sonstige",
};

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  contactType: text("contact_type").notNull().default("kunde"),
  customerNumber: text("customer_number").notNull().unique(),
  searchKey: text("search_key").notNull(),
  salutation: text("salutation"),
  name: text("name").notNull(),
  name2: text("name2"),
  street: text("street"),
  zip: text("zip"),
  city: text("city"),
  country: text("country"),
  phone: text("phone"),
  fax: text("fax"),
  mobile: text("mobile"),
  email: text("email"),
  website: text("website"),
  isBusiness: boolean("is_business").notNull().default(true),
  taxId: text("tax_id"),
  iban: text("iban"),
  bic: text("bic"),
  bank: text("bank"),
  paymentTermDays: integer("payment_term_days").default(14),
  skontoDays: integer("skonto_days").default(0),
  skontoPercent: decimal("skonto_percent", { precision: 5, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0.00"),
  notes: text("notes"),
  colorCode: text("color_code"),
  alertText: text("alert_text"),
  ourCustomerNumber: text("our_customer_number"),
  supplierDiscount: decimal("supplier_discount", { precision: 5, scale: 2 }),
  vacationDaysPerYear: integer("vacation_days_per_year"),
  employeeNumber: text("employee_number"),
  birthDate: date("birth_date"),
  entryDate: date("entry_date"),
  exitDate: date("exit_date"),
  deliveryStreet: text("delivery_street"),
  deliveryZip: text("delivery_zip"),
  deliveryCity: text("delivery_city"),
  invoiceStreet: text("invoice_street"),
  invoiceZip: text("invoice_zip"),
  invoiceCity: text("invoice_city"),
  branche: text("branche"),
  typ: text("typ"),
  accountHolder: text("account_holder"),
  grossInvoicing: boolean("gross_invoicing").notNull().default(false),
  noReminder: boolean("no_reminder").notNull().default(false),
  revenueAccount: text("revenue_account"),
  representativeId: integer("representative_id"),
  referrerId: integer("referrer_id"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true }).extend({
  contactType: z.enum(contactTypeEnum).default("kunde"),
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const contactPersons = pgTable("contact_persons", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  salutation: text("salutation"),
  firstName: text("first_name"),
  lastName: text("last_name").notNull(),
  position: text("position"),
  department: text("department"),
  phone: text("phone"),
  mobile: text("mobile"),
  fax: text("fax"),
  email: text("email"),
  isPrimary: boolean("is_primary").notNull().default(false),
  website: text("website"),
  birthDate: date("birth_date"),
  briefAnrede: text("brief_anrede"),
});

export const insertContactPersonSchema = createInsertSchema(contactPersons).omit({ id: true });
export type InsertContactPerson = z.infer<typeof insertContactPersonSchema>;
export type ContactPerson = typeof contactPersons.$inferSelect;

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  projectNumber: text("project_number").notNull(),
  customerId: integer("customer_id").notNull(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  description: text("description"),
  street: text("street"),
  zip: text("zip"),
  city: text("city"),
  branch: text("branch"),
  status: text("status").notNull().default("aktiv"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: decimal("budget", { precision: 14, scale: 2 }),
  notes: text("notes"),
  costCenter: text("cost_center"),
  importSource: text("import_source"),
  importSourceKey: text("import_source_key").unique(),
  revenueAccount: text("revenue_account"),
  representativeId: integer("representative_id"),
  referrerId: integer("referrer_id"),
  reminderDate: date("reminder_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type DocumentType = "angebot" | "auftragsbestaetigung" | "abschlagsrechnung" | "teilrechnung" | "rechnung" | "gutschrift" | "lieferschein" | "freies_dokument" | "mitschnitt";

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  documentNumber: text("document_number").notNull(),
  type: text("type").notNull(),
  customerId: integer("customer_id").notNull(),
  projectId: integer("project_id"),
  parentDocumentId: integer("parent_document_id"),
  subject: text("subject"),
  date: date("date").notNull(),
  validUntil: date("valid_until"),
  status: text("status").notNull().default("entwurf"),
  headerText: text("header_text"),
  footerText: text("footer_text"),
  beforeWorkText: text("before_work_text"),
  beforeTotalsText: text("before_totals_text"),
  afterTotalsText: text("after_totals_text"),
  netTotal: decimal("net_total", { precision: 12, scale: 2 }).default("0.00"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("19.00"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"),
  grossTotal: decimal("gross_total", { precision: 12, scale: 2 }).default("0.00"),
  laborTotal: decimal("labor_total", { precision: 12, scale: 2 }).default("0.00"),
  laborVkTotal: decimal("labor_vk_total", { precision: 12, scale: 2 }).default("0.00"),
  laborEkTotal: decimal("labor_ek_total", { precision: 12, scale: 2 }).default("0.00"),
  materialVkTotal: decimal("material_vk_total", { precision: 12, scale: 2 }).default("0.00"),
  materialEkTotal: decimal("material_ek_total", { precision: 12, scale: 2 }).default("0.00"),
  fremdVkTotal: decimal("fremd_vk_total", { precision: 12, scale: 2 }).default("0.00"),
  fremdEkTotal: decimal("fremd_ek_total", { precision: 12, scale: 2 }).default("0.00"),
  totalTimeMinutes: decimal("total_time_minutes", { precision: 12, scale: 2 }).default("0.00"),
  skontoBetrag: decimal("skonto_betrag", { precision: 12, scale: 2 }).default("0.00"),
  previouslyInvoiced: decimal("previously_invoiced", { precision: 12, scale: 2 }).default("0.00"),
  abschlagNumber: integer("abschlag_number"),
  paymentTermDays: integer("payment_term_days").default(14),
  skontoDays: integer("skonto_days").default(0),
  skontoPercent: decimal("skonto_percent", { precision: 5, scale: 2 }).default("0"),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  paidDate: date("paid_date"),
  retentionPercent: decimal("retention_percent", { precision: 5, scale: 2 }).default("0"),
  customTypeLabel: text("custom_type_label"),
  formTemplateId: integer("form_template_id"),
  hideNetto: boolean("hide_netto").default(false),
  hideMwst: boolean("hide_mwst").default(false),
  hideGesamt: boolean("hide_gesamt").default(false),
  showLohnanteil: boolean("show_lohnanteil").default(false),
  abschlagVerrechnungen: jsonb("abschlag_verrechnungen").$type<any[]>().default([]),
  erstellungsort: text("erstellungsort").default("Hamburg"),
  leistungsDatumVon: date("leistungs_datum_von"),
  leistungsDatumBis: date("leistungs_datum_bis"),
  postausgangAm: date("postausgang_am"),
  wiedervorlageAm: date("wiedervorlage_am"),
  kundenReferenz: text("kunden_referenz"),
  leitwegId: text("leitweg_id"),
  bemerkungen: text("bemerkungen"),
  importSource: text("import_source"),
  importSourceKey: text("import_source_key").unique(),
  skontoBase: text("skonto_base").default("gesamtsumme"),
  skontoImDokument: boolean("skonto_im_dokument").default(true),
  skontoNurMaterial: boolean("skonto_nur_material").default(false),
  retentionDays: integer("retention_days").default(0),
  fibuNetto: decimal("fibu_netto", { precision: 12, scale: 2 }),
  fibuBrutto: decimal("fibu_brutto", { precision: 12, scale: 2 }),
  fibuZahlung: decimal("fibu_zahlung", { precision: 12, scale: 2 }),
  fibuSkonto: decimal("fibu_skonto", { precision: 12, scale: 2 }),
  fibuOffen: decimal("fibu_offen", { precision: 12, scale: 2 }),
  erloeskonto: text("erloeskonto").default("4400"),
  steuerklasse: text("steuerklasse").default("50"),
  autoPositionNumbers: boolean("auto_position_numbers").default(true),
  positionNumberStep: integer("position_number_step").default(1),
  positionNumberStart: integer("position_number_start").default(1),
  dezimalstellenMengen: integer("dezimalstellen_mengen").default(2),
  dezimalstellenPreise: integer("dezimalstellen_preise").default(2),
  positionenEnthaltenUst: boolean("positionen_enthalten_ust").default(false),
  einzelpreiseInJumbo: boolean("einzelpreise_in_jumbo").default(true),
  mengenInJumbo: boolean("mengen_in_jumbo").default(true),
  internpositionenVerbergen: boolean("internpositionen_verbergen").default(true),
  kalkulationsschema: text("kalkulationsschema").default("spezielle Einstellung"),
  selbstkostenLohnsatz: decimal("selbstkosten_lohnsatz", { precision: 8, scale: 2 }).default("32.00"),
  kalkulierterLohnsatz: decimal("kalkulierter_lohnsatz", { precision: 8, scale: 2 }).default("69.30"),
  aufschlagMaterial: decimal("aufschlag_material", { precision: 5, scale: 2 }).default("30.00"),
  aufschlagGeraete: decimal("aufschlag_geraete", { precision: 5, scale: 2 }).default("30.00"),
  aufschlagFremdleistung: decimal("aufschlag_fremdleistung", { precision: 5, scale: 2 }).default("30.00"),
  langtexteFormatiert: boolean("langtexte_formatiert").default(true),
  kurztexteAnzeigen: boolean("kurztexte_anzeigen").default(false),
  jumboListenAnzeigen: boolean("jumbo_listen_anzeigen").default(true),
  priceLevel: integer("price_level").default(1),
  kupferpreisBeruecksichtigen: boolean("kupferpreis_beruecksichtigen").default(false),
  kupferNotation: decimal("kupfer_notation", { precision: 8, scale: 2 }).default("200.00"),
  formularfelder: jsonb("formularfelder").$type<Record<string, string>>().default({}),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export const documentItems = pgTable("document_items", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  positionNumber: text("position_number").notNull(),
  type: text("type").notNull().default("position"),
  articleNumber: text("article_number"),
  title: text("title"),
  description: text("description"),
  unit: text("unit"),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).default("0.000"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).default("0.00"),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).default("0.00"),
  laborPrice: decimal("labor_price", { precision: 12, scale: 2 }).default("0.00"),
  materialPrice: decimal("material_price", { precision: 12, scale: 2 }).default("0.00"),
  materialCost: decimal("material_cost", { precision: 12, scale: 2 }).default("0.00"),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  discountBase: text("discount_base"),
  parentItemId: integer("parent_item_id"),
  sortOrder: integer("sort_order").default(0),
  positionFlag: text("position_flag").default("normal"),
  flagLabel: text("flag_label"),
  laborCost: decimal("labor_cost", { precision: 12, scale: 2 }).default("0.00"),
  equipmentCost: decimal("equipment_cost", { precision: 12, scale: 2 }).default("0.00"),
  externalCost: decimal("external_cost", { precision: 12, scale: 2 }).default("0.00"),
  laborMarkup: decimal("labor_markup", { precision: 5, scale: 2 }),
  materialMarkup: decimal("material_markup", { precision: 5, scale: 2 }),
  equipmentMarkup: decimal("equipment_markup", { precision: 5, scale: 2 }),
  externalMarkup: decimal("external_markup", { precision: 5, scale: 2 }),
  laborTime: decimal("labor_time", { precision: 8, scale: 2 }).default("0.00"),
  priceFollowsCost: boolean("price_follows_cost").default(false),
  fontBold: boolean("font_bold").default(false),
  fontItalic: boolean("font_italic").default(false),
  fontUnderline: boolean("font_underline").default(false),
  fontSize: integer("font_size"),
  fontColor: text("font_color"),
  originalQuantity: decimal("original_quantity", { precision: 12, scale: 3 }),
  pageBreakBefore: boolean("page_break_before").default(false),
  afterTotals: boolean("after_totals").default(false),
});

export const insertDocumentItemSchema = createInsertSchema(documentItems).omit({ id: true });
export type InsertDocumentItem = z.infer<typeof insertDocumentItemSchema>;
export type DocumentItem = typeof documentItems.$inferSelect;

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  articleNumber: text("article_number").notNull(),
  searchKey: text("search_key"),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit").notNull().default("Stk"),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }).default("0.00"),
  sellPrice: decimal("sell_price", { precision: 12, scale: 2 }).default("0.00"),
  salePrice1: decimal("sale_price_1", { precision: 12, scale: 2 }).default("0.00"),
  salePrice2: decimal("sale_price_2", { precision: 12, scale: 2 }).default("0.00"),
  salePrice3: decimal("sale_price_3", { precision: 12, scale: 2 }).default("0.00"),
  laborCostEk: decimal("labor_cost_ek", { precision: 10, scale: 2 }),
  laborCostVk1: decimal("labor_cost_vk1", { precision: 10, scale: 2 }),
  laborTime: decimal("labor_time", { precision: 12, scale: 2 }),
  supplier: text("supplier"),
  category: text("category"),
  group: text("group_name"),
  taxRate: text("tax_rate"),
  active: boolean("active").notNull().default(true),
  inStock: boolean("in_stock").notNull().default(false),
  isFixedPrice: boolean("is_fixed_price").notNull().default(false),
});

export const insertMaterialSchema = createInsertSchema(materials).omit({ id: true });
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materials.$inferSelect;

export const laborRates = pgTable("labor_rates", {
  id: serial("id").primaryKey(),
  laborNumber: text("labor_number"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  grossWage: decimal("gross_wage", { precision: 10, scale: 2 }),
  socialCostsPercent: decimal("social_costs_percent", { precision: 5, scale: 2 }).default("29.00"),
  overheadPerHour: decimal("overhead_per_hour", { precision: 10, scale: 2 }).default("0.00"),
  profitPercent: decimal("profit_percent", { precision: 5, scale: 2 }).default("10.00"),
  calculatedRate: decimal("calculated_rate", { precision: 10, scale: 2 }),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  purchasePrice: decimal("purchase_price", { precision: 10, scale: 2 }),
  salePrice1: decimal("sale_price1", { precision: 10, scale: 2 }),
  salePrice2: decimal("sale_price2", { precision: 10, scale: 2 }),
  salePrice3: decimal("sale_price3", { precision: 10, scale: 2 }),
  costType: text("cost_type"),
  revenueAccount: text("revenue_account"),
});

export const insertLaborRateSchema = createInsertSchema(laborRates).omit({ id: true });
export type InsertLaborRate = z.infer<typeof insertLaborRateSchema>;
export type LaborRate = typeof laborRates.$inferSelect;

export const textTemplates = pgTable("text_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  documentType: text("document_type"),
  content: text("content").notNull(),
});

export const insertTextTemplateSchema = createInsertSchema(textTemplates).omit({ id: true });
export type InsertTextTemplate = z.infer<typeof insertTextTemplateSchema>;
export type TextTemplate = typeof textTemplates.$inferSelect;

export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  companyName2: text("company_name2"),
  street: text("street"),
  zip: text("zip"),
  city: text("city"),
  phone: text("phone"),
  fax: text("fax"),
  email: text("email"),
  website: text("website"),
  taxId: text("tax_id"),
  vatId: text("vat_id"),
  tradeRegister: text("trade_register"),
  managingDirector: text("managing_director"),
  bankName: text("bank_name"),
  iban: text("iban"),
  bic: text("bic"),
  logoUrl: text("logo_url"),
  materialMarkupPercent: decimal("material_markup_percent", { precision: 5, scale: 2 }).default("30.00"),
  subcontractorMarkupPercent: decimal("subcontractor_markup_percent", { precision: 5, scale: 2 }).default("30.00"),
  defaultFormTemplateId: integer("default_form_template_id"),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({ id: true });
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;

export const editorSettings = pgTable("editor_settings", {
  id: serial("id").primaryKey(),
  showToolbar: boolean("show_toolbar").default(true),
  showStatusLine: boolean("show_status_line").default(true),
  showFormatBar: boolean("show_format_bar").default(true),
  showTabRuler: boolean("show_tab_ruler").default(false),
  showFormSelect: boolean("show_form_select").default(true),
  showHelpers: boolean("show_helpers").default(false),
  showTipBox: boolean("show_tip_box").default(false),
  showMouseInfo: boolean("show_mouse_info").default(true),
  tabInTexts: boolean("tab_in_texts").default(true),
  confirmDeleteLines: boolean("confirm_delete_lines").default(true),
  noNettoSingleTax: boolean("no_netto_single_tax").default(true),
  dezimalstellenMengen: integer("dezimalstellen_mengen").default(2),
  showDecimals: boolean("show_decimals").default(true),
  mengeneinheitenAenderbar: boolean("mengeneinheiten_aenderbar").default(true),
  showMengeneinheitenListe: boolean("show_mengeneinheiten_liste").default(true),
  showBezugsDokTyp: boolean("show_bezugs_dok_typ").default(true),
  dndExplorerStyle: boolean("dnd_explorer_style").default(true),
  altPosGesamtpreis: text("alt_pos_gesamtpreis").default("kursiv"),
  autoSaveEnabled: boolean("auto_save_enabled").default(false),
  autoSaveMinutes: integer("auto_save_minutes").default(2),
  zoomPercent: integer("zoom_percent").default(100),
  zoomMode: text("zoom_mode").default("fensterbreite"),
  aufmasseAnzeigen: boolean("aufmasse_anzeigen").default(true),
  kupferBeruecksichtigen: boolean("kupfer_beruecksichtigen").default(false),
  kupferNotation: decimal("kupfer_notation", { precision: 8, scale: 2 }).default("200"),
  kupferMaterialAufschlag: boolean("kupfer_material_aufschlag").default(false),
  stdMeMaterial: text("std_me_material").default("m²"),
  stdMeLeistung: text("std_me_leistung").default("m²"),
  stdMeJumbo: text("std_me_jumbo").default("Stk"),
  selbstkostenLohnsatz: decimal("selbstkosten_lohnsatz", { precision: 8, scale: 2 }).default("29.00"),
  aufschlagMaterial1: decimal("aufschlag_material_1", { precision: 5, scale: 2 }).default("30.00"),
  aufschlagMaterial2: decimal("aufschlag_material_2", { precision: 5, scale: 2 }).default("25.00"),
  aufschlagMaterial3: decimal("aufschlag_material_3", { precision: 5, scale: 2 }).default("21.00"),
  kalkulierterLohnsatz1: decimal("kalkulierter_lohnsatz_1", { precision: 8, scale: 2 }).default("66.30"),
  kalkulierterLohnsatz2: decimal("kalkulierter_lohnsatz_2", { precision: 8, scale: 2 }).default("62.50"),
  kalkulierterLohnsatz3: decimal("kalkulierter_lohnsatz_3", { precision: 8, scale: 2 }).default("58.50"),
  aufschlagGeraete: decimal("aufschlag_geraete", { precision: 5, scale: 2 }).default("30.00"),
  aufschlagFremdleistung: decimal("aufschlag_fremdleistung", { precision: 5, scale: 2 }).default("30.00"),
  preisbildungModus: text("preisbildung_modus").default("standard"),
  preisbildungSchema: text("preisbildung_schema").default("Beispiel"),
  materialMehrfach: boolean("material_mehrfach").default(true),
  leistungsMehrfach: boolean("leistungs_mehrfach").default(true),
  jumboMehrfach: boolean("jumbo_mehrfach").default(true),
  floskelMehrfach: boolean("floskel_mehrfach").default(false),
  kalkUebersichtZeigen: boolean("kalk_uebersicht_zeigen").default(false),
  mehrfachauswahlDokumente: boolean("mehrfachauswahl_dokumente").default(false),
  defaultRabatt: decimal("default_rabatt", { precision: 5, scale: 2 }).default("0.00"),
  defaultSkonto: decimal("default_skonto", { precision: 5, scale: 2 }).default("2.00"),
  defaultSkontoTage: integer("default_skonto_tage").default(7),
  defaultZahlungsziel: integer("default_zahlungsziel").default(14),
  defaultZahlungserinnerung: integer("default_zahlungserinnerung").default(14),
  defaultMahnung: integer("default_mahnung").default(14),
  skontoNurMaterial: boolean("skonto_nur_material").default(false),
  autoPositionNumbers: boolean("auto_position_numbers").default(true),
  positionNumberStep: integer("position_number_step").default(1),
  positionNumberStart: integer("position_number_start").default(1),
  preiseInklUst: boolean("preise_inkl_ust").default(false),
  eigenschaftenNeuanlage: boolean("eigenschaften_neuanlage").default(false),
  langtexteFormatiert: boolean("langtexte_formatiert").default(true),
  kurztexteVerwenden: boolean("kurztexte_verwenden").default(false),
  jumboListenAnzeigen: boolean("jumbo_listen_anzeigen").default(true),
  jumboKleinerSchrift: boolean("jumbo_kleiner_schrift").default(false),
  mengenInJumbo: boolean("mengen_in_jumbo").default(true),
  ePreiseInJumbo: boolean("e_preise_in_jumbo").default(true),
  titelsummenAutoEinfuegen: boolean("titelsummen_auto_einfuegen").default(false),
  dezMaterialPreise: integer("dez_material_preise").default(2),
  dezLeistungsPreise: integer("dez_leistungs_preise").default(2),
  dezJumboPreise: integer("dez_jumbo_preise").default(2),
  vkPreisNachEk: boolean("vk_preis_nach_ek").default(true),
  gleichartigeAktualisieren: boolean("gleichartige_aktualisieren").default(true),
  dokKalkSchema: text("dok_kalk_schema").default("STANDARD90"),
  posKalkSchema: text("pos_kalk_schema").default("STANDARD90"),
  statusmarkierungenPositionen: boolean("statusmarkierungen_positionen").default(false),
  druckMarkerPruefen: boolean("druck_marker_pruefen").default(true),
  schliessenMarkerPruefen: boolean("schliessen_marker_pruefen").default(true),
  warnungAufschlagUnter: decimal("warnung_aufschlag_unter", { precision: 5, scale: 2 }).default("10.00"),
  alarmAufschlagUnter: decimal("alarm_aufschlag_unter", { precision: 5, scale: 2 }).default("0.00"),
  par13bKonto: text("par13b_konto").default("4337"),
  par13bText: text("par13b_text").default("Erlöse aus Leistungen nach §13b UStG"),
  standardtexte: jsonb("standardtexte").$type<Record<string, string>>().default({}),
  formularfelderDefaults: jsonb("formularfelder_defaults").$type<Record<string, string>>().default({}),
  dokumenttypen: jsonb("dokumenttypen").$type<Record<string, any>>().default({}),
});

export const insertEditorSettingsSchema = createInsertSchema(editorSettings).omit({ id: true });
export type InsertEditorSettings = z.infer<typeof insertEditorSettingsSchema>;
export type EditorSettings = typeof editorSettings.$inferSelect;

export const AI_PROVIDERS = ["anthropic", "openai", "google", "perplexity", "mistral"] as const;
export type AiProvider = typeof AI_PROVIDERS[number];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
  perplexity: "Perplexity",
  mistral: "Mistral",
};

export const AI_MODELS: Record<AiProvider, { value: string; label: string; tier: "fast" | "standard" }[]> = {
  anthropic: [
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (schnell)", tier: "fast" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4 (standard)", tier: "standard" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini (schnell)", tier: "fast" },
    { value: "gpt-4o", label: "GPT-4o (standard)", tier: "standard" },
  ],
  google: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (schnell)", tier: "fast" },
    { value: "gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro (standard)", tier: "standard" },
  ],
  perplexity: [
    { value: "sonar", label: "Sonar (schnell)", tier: "fast" },
    { value: "sonar-pro", label: "Sonar Pro (standard)", tier: "standard" },
  ],
  mistral: [
    { value: "mistral-small-latest", label: "Mistral Small (schnell)", tier: "fast" },
    { value: "mistral-large-latest", label: "Mistral Large (standard)", tier: "standard" },
  ],
};

export const aiSettings = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  activeProvider: text("active_provider").notNull().default("anthropic"),
  fastModel: text("fast_model").notNull().default("claude-haiku-4-5"),
  standardModel: text("standard_model").notNull().default("claude-sonnet-4-6"),
  anthropicApiKey: text("anthropic_api_key"),
  openaiApiKey: text("openai_api_key"),
  googleApiKey: text("google_api_key"),
  perplexityApiKey: text("perplexity_api_key"),
  mistralApiKey: text("mistral_api_key"),
});

export const insertAiSettingsSchema = createInsertSchema(aiSettings).omit({ id: true });
export type InsertAiSettings = z.infer<typeof insertAiSettingsSchema>;
export type AiSettings = typeof aiSettings.$inferSelect;

export const incomingInvoices = pgTable("incoming_invoices", {
  id: serial("id").primaryKey(),
  lfdNr: integer("lfd_nr"),
  supplier: text("supplier").notNull(),
  supplierNumber: text("supplier_number"),
  invoiceNumber: text("invoice_number"),
  documentId: integer("document_id"),
  documentNumber: text("document_number"),
  date: date("date").notNull(),
  dueDate: date("due_date"),
  netTotal: decimal("net_total", { precision: 12, scale: 2 }).default("0.00"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("19.00"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"),
  grossTotal: decimal("gross_total", { precision: 12, scale: 2 }).default("0.00"),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  paidDate: date("paid_date"),
  status: text("status").notNull().default("offen"),
  projectId: integer("project_id"),
  projectNumber: text("project_number"),
  costAccount: text("cost_account"),
  costCenter: text("cost_center"),
  subject: text("subject"),
  notes: text("notes"),
  bookingDate: date("booking_date"),
  pdfPath: text("pdf_path"),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }),
  discountDate: date("discount_date"),
  paymentMethod: text("payment_method"),
  bankAccount: text("bank_account"),
  invoiceType: text("invoice_type").default("rechnung"),
  reverseCharge: boolean("reverse_charge").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIncomingInvoiceSchema = createInsertSchema(incomingInvoices).omit({ id: true, createdAt: true });
export type InsertIncomingInvoice = z.infer<typeof insertIncomingInvoiceSchema>;
export type IncomingInvoice = typeof incomingInvoices.$inferSelect;

export const documentAttachments = pgTable("document_attachments", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id"),
  fibuReId: integer("fibu_re_id"),
  fibuIdx: integer("fibu_idx"),
  incomingInvoiceId: integer("incoming_invoice_id"),
  documentId: integer("document_id"),
  projectId: integer("project_id"),
  source: text("source").notNull().default("manual"),
  importSource: text("import_source"),
  importSourceKey: text("import_source_key").unique(),
  originalFilename: text("original_filename").notNull(),
  storedFilename: text("stored_filename"),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  sha256: text("sha256"),
  title: text("title"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDocumentAttachmentSchema = createInsertSchema(documentAttachments).omit({ id: true, createdAt: true });
export type InsertDocumentAttachment = z.infer<typeof insertDocumentAttachmentSchema>;
export type DocumentAttachment = typeof documentAttachments.$inferSelect;

export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  projectId: integer("project_id"),
  date: date("date").notNull(),
  wageType: text("wage_type").notNull().default("Arbeit"),
  hoursFrom: text("hours_from"),
  hoursTo: text("hours_to"),
  hours: decimal("hours", { precision: 6, scale: 2 }).notNull(),
  breakMinutes: integer("break_minutes").default(0),
  notes: text("notes"),
  costCenter: text("cost_center"),
  week: integer("week"),
  month: integer("month"),
  year: integer("year"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, createdAt: true });
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;

export const hourlyRateCalculations = pgTable("hourly_rate_calculations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  weeklyHours: decimal("weekly_hours", { precision: 6, scale: 2 }).default("40.00"),
  socialCostsPercent: decimal("social_costs_percent", { precision: 5, scale: 2 }).default("29.00"),
  freeDays: integer("free_days").default(49),
  freeDayHours: decimal("free_day_hours", { precision: 6, scale: 2 }).default("8.00"),
  unproductivePercent: decimal("unproductive_percent", { precision: 5, scale: 2 }).default("15.00"),
  materialCosts: decimal("material_costs", { precision: 12, scale: 2 }).default("29740.00"),
  personnelCosts: decimal("personnel_costs", { precision: 12, scale: 2 }).default("147000.00"),
  fixedCosts: decimal("fixed_costs", { precision: 12, scale: 2 }).default("70000.00"),
  fixedIncome: decimal("fixed_income", { precision: 12, scale: 2 }).default("31000.00"),
  costIncrease: decimal("cost_increase", { precision: 5, scale: 2 }).default("3.00"),
  productiveEmployees: integer("productive_employees").default(3),
  plannedRevenue: decimal("planned_revenue", { precision: 14, scale: 2 }).default("300000.00"),
  plannedProfitPercent: decimal("planned_profit_percent", { precision: 5, scale: 2 }).default("5.00"),
  resultProductiveHours: decimal("result_productive_hours", { precision: 10, scale: 2 }),
  resultHourlySurcharge: decimal("result_hourly_surcharge", { precision: 5, scale: 2 }),
  resultFixCostsPerHour: decimal("result_fix_costs_per_hour", { precision: 10, scale: 2 }),
  resultCostCoveringRate: decimal("result_cost_covering_rate", { precision: 10, scale: 2 }),
  resultCalculatedRate: decimal("result_calculated_rate", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHourlyRateCalcSchema = createInsertSchema(hourlyRateCalculations).omit({ id: true, createdAt: true });
export type InsertHourlyRateCalc = z.infer<typeof insertHourlyRateCalcSchema>;
export type HourlyRateCalc = typeof hourlyRateCalculations.$inferSelect;

export const resourcePlans = pgTable("resource_plans", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  hoursPerDay: decimal("hours_per_day", { precision: 4, scale: 1 }).default("8.0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertResourcePlanSchema = createInsertSchema(resourcePlans).omit({ id: true, createdAt: true });
export type InsertResourcePlan = z.infer<typeof insertResourcePlanSchema>;
export type ResourcePlan = typeof resourcePlans.$inferSelect;

export const orderDispositions = pgTable("order_dispositions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  status: text("status").notNull().default("geplant"),
  priority: integer("priority").default(2),
  startDate: date("start_date"),
  endDate: date("end_date"),
  notes: text("notes"),
  assignedTo: integer("assigned_to"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrderDispositionSchema = createInsertSchema(orderDispositions).omit({ id: true, createdAt: true });
export type InsertOrderDisposition = z.infer<typeof insertOrderDispositionSchema>;
export type OrderDisposition = typeof orderDispositions.$inferSelect;

export const calculationSheets = pgTable("calculation_sheets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  projectId: integer("project_id"),
  documentId: integer("document_id"),
  rows: jsonb("rows").default([]),
  columns: jsonb("columns").default([]),
  totals: jsonb("totals").default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCalcSheetSchema = createInsertSchema(calculationSheets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCalcSheet = z.infer<typeof insertCalcSheetSchema>;
export type CalcSheet = typeof calculationSheets.$inferSelect;

export const dunningEntries = pgTable("dunning_entries", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  level: integer("level").notNull().default(1),
  date: date("date").notNull(),
  dueDate: date("due_date"),
  fee: decimal("fee", { precision: 8, scale: 2 }).default("0.00"),
  text: text("text"),
  status: text("status").notNull().default("erstellt"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDunningSchema = createInsertSchema(dunningEntries).omit({ id: true, createdAt: true });
export type InsertDunning = z.infer<typeof insertDunningSchema>;
export type Dunning = typeof dunningEntries.$inferSelect;

export const postCalculations = pgTable("post_calculations", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  documentId: integer("document_id"),
  plannedLabor: decimal("planned_labor", { precision: 12, scale: 2 }).default("0.00"),
  actualLabor: decimal("actual_labor", { precision: 12, scale: 2 }).default("0.00"),
  plannedMaterial: decimal("planned_material", { precision: 12, scale: 2 }).default("0.00"),
  actualMaterial: decimal("actual_material", { precision: 12, scale: 2 }).default("0.00"),
  plannedExternal: decimal("planned_external", { precision: 12, scale: 2 }).default("0.00"),
  actualExternal: decimal("actual_external", { precision: 12, scale: 2 }).default("0.00"),
  plannedEquipment: decimal("planned_equipment", { precision: 12, scale: 2 }).default("0.00"),
  actualEquipment: decimal("actual_equipment", { precision: 12, scale: 2 }).default("0.00"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPostCalcSchema = createInsertSchema(postCalculations).omit({ id: true, createdAt: true });
export type InsertPostCalc = z.infer<typeof insertPostCalcSchema>;
export type PostCalc = typeof postCalculations.$inferSelect;

export const documentTypeLabels: Record<string, string> = {
  angebot: "Angebot",
  auftragsbestaetigung: "Auftragsbestätigung",
  abschlagsrechnung: "Abschlagsrechnung",
  teilrechnung: "Teilrechnung",
  rechnung: "Rechnung",
  gutschrift: "Gutschrift",
  lieferschein: "Lieferschein",
  freies_dokument: "Freies Dokument",
  mitschnitt: "Mitschnitt",
  nachkalkulation: "Nachkalkulation",
};

export const documentStatusLabels: Record<string, string> = {
  entwurf: "Entwurf",
  gesendet: "Gesendet",
  abgelehnt: "Abgelehnt",
  beauftragt: "Beauftragt",
  teilbezahlt: "Teilbezahlt",
  bezahlt: "Bezahlt",
  storniert: "Storniert",
  archiviert: "Archiviert",
};

export const positionTypes: Record<string, string> = {
  titel: "Titel (Blocküberschrift)",
  leistung: "Leistungs-Position",
  material: "Material-Position",
  jumbo: "Jumbo-Position",
  lohn: "Lohnposition",
  manuell: "manuelle Position (frei)",
  titelsumme: "Titelsumme (Blocksumme)",
  untertitel: "Untertitel",
  zuschlag: "Zuschlag/Abschlag",
  abschluss: "Abschluss (Netto, USt., Brutto)",
  zwischensumme: "Zwischensumme",
  freitext: "freier Text",
  floskel: "Floskel",
  skonto: "Skonto",
};

export const wageTypes = ["Arbeit", "Urlaub", "Krank", "Fahrzeit", "Überstunden", "Abbummeln", "Feiertag", "Sonstiges"];

export const unitOptions = ["Stk", "m", "m²", "m³", "Std", "Wo", "pau", "kg", "l", "lfm", "Satz", "Tag", "Mon"];

export const branchOptions = ["Zimmerei", "Holzbau", "Dachdeckerei", "Heizung/Sanitär/Wärmepumpen"];

export const projectStatusLabels: Record<string, string> = {
  aktiv: "Aktiv",
  abgeschlossen: "Abgeschlossen",
  pausiert: "Pausiert",
  storniert: "Storniert",
};

export const dispositionStatusLabels: Record<string, string> = {
  geplant: "Geplant",
  in_arbeit: "In Arbeit",
  abgeschlossen: "Abgeschlossen",
  pausiert: "Pausiert",
};

export const invoiceStatusLabels: Record<string, string> = {
  offen: "Offen",
  teilbezahlt: "Teilbezahlt",
  bezahlt: "Bezahlt",
  ueberfaellig: "Überfällig",
};

export const bwaReports = pgTable("bwa_reports", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  period: text("period").notNull(),
  umsatzerloese: decimal("umsatzerloese", { precision: 14, scale: 2 }).default("0.00"),
  bestandsveraenderung: decimal("bestandsveraenderung", { precision: 14, scale: 2 }).default("0.00"),
  aktivierteEigenleistungen: decimal("aktivierte_eigenleistungen", { precision: 14, scale: 2 }).default("0.00"),
  gesamtleistung: decimal("gesamtleistung", { precision: 14, scale: 2 }).default("0.00"),
  materialWareneinkauf: decimal("material_wareneinkauf", { precision: 14, scale: 2 }).default("0.00"),
  rohertrag: decimal("rohertrag", { precision: 14, scale: 2 }).default("0.00"),
  soBetrieblicheErloese: decimal("so_betriebliche_erloese", { precision: 14, scale: 2 }).default("0.00"),
  betrieblichRohertrag: decimal("betrieblich_rohertrag", { precision: 14, scale: 2 }).default("0.00"),
  personalkosten: decimal("personalkosten", { precision: 14, scale: 2 }).default("0.00"),
  raumkosten: decimal("raumkosten", { precision: 14, scale: 2 }).default("0.00"),
  betrieblicheSteuern: decimal("betriebliche_steuern", { precision: 14, scale: 2 }).default("0.00"),
  versicherungenBeitraege: decimal("versicherungen_beitraege", { precision: 14, scale: 2 }).default("0.00"),
  besondereKosten: decimal("besondere_kosten", { precision: 14, scale: 2 }).default("0.00"),
  fahrzeugkosten: decimal("fahrzeugkosten", { precision: 14, scale: 2 }).default("0.00"),
  werbeReisekosten: decimal("werbe_reisekosten", { precision: 14, scale: 2 }).default("0.00"),
  kostenWarenabgabe: decimal("kosten_warenabgabe", { precision: 14, scale: 2 }).default("0.00"),
  abschreibungen: decimal("abschreibungen", { precision: 14, scale: 2 }).default("0.00"),
  reparaturInstandhaltung: decimal("reparatur_instandhaltung", { precision: 14, scale: 2 }).default("0.00"),
  sonstigeKosten: decimal("sonstige_kosten", { precision: 14, scale: 2 }).default("0.00"),
  gesamtkosten: decimal("gesamtkosten", { precision: 14, scale: 2 }).default("0.00"),
  betriebsergebnis: decimal("betriebsergebnis", { precision: 14, scale: 2 }).default("0.00"),
  zinsaufwand: decimal("zinsaufwand", { precision: 14, scale: 2 }).default("0.00"),
  neutralerAufwand: decimal("neutraler_aufwand", { precision: 14, scale: 2 }).default("0.00"),
  zinsertraege: decimal("zinsertraege", { precision: 14, scale: 2 }).default("0.00"),
  sonstigerNeutralerErtrag: decimal("sonstiger_neutraler_ertrag", { precision: 14, scale: 2 }).default("0.00"),
  neutralerErtrag: decimal("neutraler_ertrag", { precision: 14, scale: 2 }).default("0.00"),
  ergebnisVorSteuern: decimal("ergebnis_vor_steuern", { precision: 14, scale: 2 }).default("0.00"),
  steuernEinkommenErtrag: decimal("steuern_einkommen_ertrag", { precision: 14, scale: 2 }).default("0.00"),
  vorlaeufigesErgebnis: decimal("vorlaeufiges_ergebnis", { precision: 14, scale: 2 }).default("0.00"),
  sourceFile: text("source_file"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBwaReportSchema = createInsertSchema(bwaReports).omit({ id: true, createdAt: true });
export type InsertBwaReport = z.infer<typeof insertBwaReportSchema>;
export type BwaReport = typeof bwaReports.$inferSelect;

export const bankTypeEnum = ["deutsche_bank", "postbank", "finom", "sonstige"] as const;
export type BankType = typeof bankTypeEnum[number];

export const bankTypeLabels: Record<BankType, string> = {
  deutsche_bank: "Deutsche Bank",
  postbank: "Postbank",
  finom: "Finom",
  sonstige: "Sonstige",
};

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  bankName: text("bank_name").notNull(),
  bankType: text("bank_type").notNull().default("sonstige"),
  iban: text("iban").notNull(),
  bic: text("bic"),
  accountHolder: text("account_holder"),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  apiConfig: jsonb("api_config").$type<Record<string, string>>().default({}),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({ id: true });
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccounts.$inferSelect;

export const bankCachedBalances = pgTable("bank_cached_balances", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  balance: decimal("balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  availableBalance: decimal("available_balance", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("EUR"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});

export const insertBankCachedBalanceSchema = createInsertSchema(bankCachedBalances).omit({ id: true, fetchedAt: true });
export type InsertBankCachedBalance = z.infer<typeof insertBankCachedBalanceSchema>;
export type BankCachedBalance = typeof bankCachedBalances.$inferSelect;

export const bankCachedTransactions = pgTable("bank_cached_transactions", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  externalId: text("external_id"),
  bookingDate: date("booking_date").notNull(),
  valueDate: date("value_date"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  purpose: text("purpose"),
  counterpartName: text("counterpart_name"),
  counterpartIban: text("counterpart_iban"),
  counterpartBic: text("counterpart_bic"),
  transactionType: text("transaction_type"),
  creditorId: text("creditor_id"),
  mandateReference: text("mandate_reference"),
  endToEndReference: text("end_to_end_reference"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});

export const insertBankCachedTransactionSchema = createInsertSchema(bankCachedTransactions).omit({ id: true, fetchedAt: true });
export type InsertBankCachedTransaction = z.infer<typeof insertBankCachedTransactionSchema>;
export type BankCachedTransaction = typeof bankCachedTransactions.$inferSelect;

export const documentNumberFormats = pgTable("document_number_formats", {
  id: serial("id").primaryKey(),
  documentType: text("document_type").notNull().unique(),
  formatPattern: text("format_pattern").notNull().default("jj-nnnnn"),
  separateCreditNotes: boolean("separate_credit_notes").notNull().default(false),
});

export const insertDocumentNumberFormatSchema = createInsertSchema(documentNumberFormats).omit({ id: true });
export type InsertDocumentNumberFormat = z.infer<typeof insertDocumentNumberFormatSchema>;
export type DocumentNumberFormat = typeof documentNumberFormats.$inferSelect;

export const numberFormatGroups: Record<string, string> = {
  angebot: "angebot",
  auftragsbestaetigung: "auftragsbestaetigung",
  rechnung: "rechnung",
  abschlagsrechnung: "rechnung",
  gutschrift: "rechnung",
  lieferschein: "lieferschein",
  freies_dokument: "freies_dokument",
  freiesdokument: "freies_dokument",
  mitschnitt: "mitschnitt",
  nachkalkulation: "nachkalkulation",
  teilrechnung: "rechnung",
};

export const numberFormatLabels: Record<string, string> = {
  angebot: "Angebote",
  auftragsbestaetigung: "Auftragsbestätigungen",
  rechnung: "Rechnungen / Gutschriften",
  lieferschein: "Lieferscheine",
  freies_dokument: "freie Dokumente",
  mitschnitt: "Mitschnitte",
  nachkalkulation: "Nachkalkulationen",
};

export function formatDocumentNumberFromPattern(pattern: string, year: number, month: number, seq: number): string {
  const nCount = (pattern.match(/n/g) || []).length;
  const jCount = (pattern.match(/j/g) || []).length;
  const mCount = (pattern.match(/m/g) || []).length;
  const yearStr = jCount >= 4 ? year.toString().padStart(4, "0") : (year % 100).toString().padStart(2, "0");
  const monthStr = month.toString().padStart(mCount || 2, "0");
  const seqStr = seq.toString().padStart(nCount || 5, "0");
  let result = "";
  let jIdx = 0, nIdx = 0, mIdx = 0;
  for (const ch of pattern) {
    if (ch === "j") result += yearStr[jIdx++] || "";
    else if (ch === "n") result += seqStr[nIdx++] || "";
    else if (ch === "m") result += monthStr[mIdx++] || "";
    else if (ch === "b") result += "";
    else result += ch;
  }
  return result;
}

const HAPAK_ZZ_RE = /^[ABGPRX]ZZ(\d{2})(\d+)$/;
const HAPAK_OLD_RE = /^[ABGPRX]([A-Y])(\d+)$/;
const HAPAK_YEAR_MAP: Record<string, number> = {};
"ABCDEFGHIJKLMNOPQRSTUVWXY".split("").forEach((ch, i) => { HAPAK_YEAR_MAP[ch] = 2000 + i; });

export function isHapakImportNumber(docNumber: string): boolean {
  return HAPAK_ZZ_RE.test(docNumber) || HAPAK_OLD_RE.test(docNumber);
}

export function parseHapakNumber(docNumber: string): { year2: string; seq: number } | null {
  const zzMatch = docNumber.match(HAPAK_ZZ_RE);
  if (zzMatch) return { year2: zzMatch[1], seq: parseInt(zzMatch[2]) || 0 };
  const oldMatch = docNumber.match(HAPAK_OLD_RE);
  if (oldMatch) {
    const yr = HAPAK_YEAR_MAP[oldMatch[1]];
    if (yr !== undefined) return { year2: (yr % 100).toString().padStart(2, "0"), seq: parseInt(oldMatch[2]) || 0 };
  }
  return null;
}

export function parseDocumentNumberSeq(docNumber: string, _pattern?: string): number {
  const hapak = parseHapakNumber(docNumber);
  if (hapak) return hapak.seq;
  const digits = docNumber.replace(/[^0-9]/g, "");
  if (digits.length <= 2) return 0;
  const seqPart = digits.slice(2);
  return parseInt(seqPart) || 0;
}

export function displayDocumentNumber(docNumber: string): string {
  const hapak = parseHapakNumber(docNumber);
  if (hapak) {
    return `${hapak.year2}-${hapak.seq.toString().padStart(5, "0")}`;
  }
  return docNumber;
}

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  sortOrder: integer("sort_order").notNull().default(0),
  gewerkNr: text("gewerk_nr"),
});

export const insertTradeSchema = createInsertSchema(trades).omit({ id: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export const defaultTrades = [
  { name: "Zimmerei", color: "#f59e0b", sortOrder: 1 },
  { name: "Holzbau", color: "#22c55e", sortOrder: 2 },
  { name: "Dachdeckerei", color: "#3b82f6", sortOrder: 3 },
  { name: "Heizung/Sanitär/Wärmepumpen", color: "#ef4444", sortOrder: 4 },
];

export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertUnitSchema = createInsertSchema(units).omit({ id: true });
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type UnitType = typeof units.$inferSelect;

export const cashBookEntries = pgTable("cash_book_entries", {
  id: serial("id").primaryKey(),
  lfdNr: integer("lfd_nr").notNull(),
  date: date("date").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  subject: text("subject").notNull(),
  cashAccount: text("cash_account").notNull().default("1000"),
  contraAccount: text("contra_account"),
  income: decimal("income", { precision: 12, scale: 2 }).default("0.00"),
  expense: decimal("expense", { precision: 12, scale: 2 }).default("0.00"),
  taxRate: text("tax_rate"),
  projectId: integer("project_id"),
  address: text("address"),
  notes: text("notes"),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCashBookEntrySchema = createInsertSchema(cashBookEntries).omit({ id: true, createdAt: true });
export type InsertCashBookEntry = z.infer<typeof insertCashBookEntrySchema>;
export type CashBookEntry = typeof cashBookEntries.$inferSelect;

export const phrases = pgTable("phrases", {
  id: serial("id").primaryKey(),
  number: text("number").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("Vortext"),
  documentType: text("document_type"),
  text: text("text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPhraseSchema = createInsertSchema(phrases).omit({ id: true, createdAt: true });
export type InsertPhrase = z.infer<typeof insertPhraseSchema>;
export type Phrase = typeof phrases.$inferSelect;

export const phraseTypes = ["Vortext", "Nachtext"];
export const phraseDocumentTypes = ["Angebot", "Auftragsbestätigung", "Rechnung", "Mahnung", "Wartung", "Bestellung", "Allgemein"];

export const cashAccountOptions = [
  { code: "1000", name: "Kasse" },
  { code: "1001", name: "Portokasse" },
];

export const followUps = pgTable("follow_ups", {
  id: serial("id").primaryKey(),
  dueDate: date("due_date").notNull(),
  subject: text("subject").notNull(),
  customerId: integer("customer_id"),
  documentId: integer("document_id"),
  documentNumber: text("document_number"),
  type: text("type").notNull().default("Allgemein"),
  assignedTo: integer("assigned_to"),
  assignedToName: text("assigned_to_name"),
  status: text("status").notNull().default("offen"),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertFollowUpSchema = createInsertSchema(followUps).omit({ id: true, createdAt: true, completedAt: true });
export type InsertFollowUp = z.infer<typeof insertFollowUpSchema>;
export type FollowUp = typeof followUps.$inferSelect;

export const followUpStatuses = ["offen", "erledigt", "überfällig"];
export const followUpTypes = ["Angebot", "Rechnung", "Mahnung", "Wartung", "Bestellung", "Arbeitsauftrag", "Projekt", "Allgemein"];

export const mailLog = pgTable("mail_log", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  direction: text("direction").notNull().default("Ausgang"),
  recipientSender: text("recipient_sender").notNull(),
  subject: text("subject").notNull(),
  documentType: text("document_type"),
  documentNumber: text("document_number"),
  sendMethod: text("send_method"),
  assignedTo: integer("assigned_to"),
  assignedToName: text("assigned_to_name"),
  followUpDate: date("follow_up_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMailLogSchema = createInsertSchema(mailLog).omit({ id: true, createdAt: true });
export type InsertMailLog = z.infer<typeof insertMailLogSchema>;
export type MailLogEntry = typeof mailLog.$inferSelect;

export const mailDirections = ["Eingang", "Ausgang"];
export const sendMethods = ["E-Mail", "E-Mail (PDF)", "Brief", "Fax", "Persönlich", "Einschreiben"];

export const customerHistory = pgTable("customer_history", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  date: date("date").notNull(),
  type: text("type").notNull().default("Notiz"),
  subject: text("subject").notNull(),
  contactPerson: text("contact_person"),
  assignedTo: integer("assigned_to"),
  assignedToName: text("assigned_to_name"),
  completed: boolean("completed").notNull().default(false),
  followUpDate: date("follow_up_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerHistorySchema = createInsertSchema(customerHistory).omit({ id: true, createdAt: true });
export type InsertCustomerHistory = z.infer<typeof insertCustomerHistorySchema>;
export type CustomerHistoryEntry = typeof customerHistory.$inferSelect;

export const historyEventTypes = ["Anruf", "Email", "Besuch", "Notiz", "Reklamation", "Fax", "Brief"];

export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  contractNumber: text("contract_number").notNull(),
  hapakNr: text("hapak_nr"),
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  customerNumber: text("customer_number"),
  invoiceRecipient: text("invoice_recipient"),
  monteur: text("monteur"),
  subject: text("subject").notNull(),
  searchKey: text("search_key"),
  category: text("category").notNull().default("Wartungsvertrag"),
  contractType: text("contract_type"),
  cycle: text("cycle").default("jährlich"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  conclusionDate: date("conclusion_date"),
  cancellationDate: date("cancellation_date"),
  intervalMonths: integer("interval_months").default(12),
  nextDate: date("next_date"),
  nextDatePlanned: date("next_date_planned"),
  lastOrderNr: text("last_order_nr"),
  lastOrderDate: date("last_order_date"),
  lastInvoiceNr: text("last_invoice_nr"),
  lastInvoiceDate: date("last_invoice_date"),
  beginPhrase: text("begin_phrase"),
  endPhrase: text("end_phrase"),
  paymentType: text("payment_type"),
  followUpDate: date("follow_up_date"),
  positionsCopied: boolean("positions_copied").default(false),
  status: text("status").notNull().default("aktiv"),
  projectNumber: text("project_number"),
  account: text("account"),
  costCenter: text("cost_center"),
  preText: text("pre_text"),
  postText: text("post_text"),
  notes: text("notes"),
  description: text("description"),
  zusatz1: text("zusatz_1"), zusatz2: text("zusatz_2"), zusatz3: text("zusatz_3"), zusatz4: text("zusatz_4"),
  zusatz5: text("zusatz_5"), zusatz6: text("zusatz_6"), zusatz7: text("zusatz_7"), zusatz8: text("zusatz_8"),
  zusatz9: text("zusatz_9"), zusatz10: text("zusatz_10"), zusatz11: text("zusatz_11"), zusatz12: text("zusatz_12"),
  zusatz13: text("zusatz_13"), zusatz14: text("zusatz_14"), zusatz15: text("zusatz_15"), zusatz16: text("zusatz_16"),
  changedBy: text("changed_by"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
  facilities: jsonb("facilities").$type<any[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

export const contractStatuses = ["aktiv", "gekündigt", "abgelaufen", "geplant"];
export const contractCategories = ["Wartungsvertrag", "Vollwartungsvertrag", "Servicevertrag", "Mietvertrag", "Rahmenvertrag"];

export const constructionDiary = pgTable("construction_diary", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id"),
  projectNumber: text("project_number").notNull(),
  projectName: text("project_name"),
  date: date("date").notNull(),
  weather: text("weather"),
  note: text("note"),
  positions: jsonb("positions").$type<any[]>().default([]),
  personnel: jsonb("personnel").$type<any[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConstructionDiarySchema = createInsertSchema(constructionDiary).omit({ id: true, createdAt: true });
export type InsertConstructionDiary = z.infer<typeof insertConstructionDiarySchema>;
export type ConstructionDiaryEntry = typeof constructionDiary.$inferSelect;

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeNumber: text("employee_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  type: text("type").notNull().default("Monteur"),
  trade: text("trade"),
  color: text("color").default("#3182CE"),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).default("0"),
  hourlyRateSale: decimal("hourly_rate_sale", { precision: 10, scale: 2 }).default("0"),
  monthlyHours: decimal("monthly_hours", { precision: 10, scale: 2 }).default("173.33"),
  agAufschlagPercent: decimal("ag_aufschlag_percent", { precision: 5, scale: 2 }).default("28.00"),
  kvAgPercent: decimal("kv_ag_percent", { precision: 5, scale: 2 }).default("7.30"),
  kvZusatzbeitragPercent: decimal("kv_zusatzbeitrag_percent", { precision: 5, scale: 2 }).default("0.80"),
  rvAgPercent: decimal("rv_ag_percent", { precision: 5, scale: 2 }).default("9.30"),
  avAgPercent: decimal("av_ag_percent", { precision: 5, scale: 2 }).default("1.30"),
  pvAgPercent: decimal("pv_ag_percent", { precision: 5, scale: 2 }).default("1.70"),
  u1Percent: decimal("u1_percent", { precision: 5, scale: 2 }).default("2.50"),
  u2Percent: decimal("u2_percent", { precision: 5, scale: 2 }).default("0.50"),
  insolvenzPercent: decimal("insolvenz_percent", { precision: 5, scale: 2 }).default("0.06"),
  bgPercent: decimal("bg_percent", { precision: 5, scale: 2 }).default("5.00"),
  additionalMonthly: decimal("additional_monthly", { precision: 10, scale: 2 }).default("0"),
  workerIdExternal: text("worker_id_external"),
  healthInsurance: text("health_insurance"),
  entryDate: date("entry_date"),
  exitDate: date("exit_date"),
  phone: text("phone"),
  email: text("email"),
  qualification: text("qualification"),
  ausbildung: text("ausbildung"),
  lohngruppe: text("lohngruppe"),
  tarifstufe: text("tarifstufe"),
  vehicle: text("vehicle"),
  vacationDays: integer("vacation_days").default(30),
  vacationTaken: integer("vacation_taken").default(0),
  overtimeHours: decimal("overtime_hours", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export const employeeTypes = ["Monteur", "Meister", "Azubi", "Büro", "Bauleiter", "Geschäftsführer"];

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  timeFrom: text("time_from"),
  timeTo: text("time_to"),
  subject: text("subject").notNull(),
  type: text("type").notNull().default("Termin"),
  employeeId: integer("employee_id"),
  employeeName: text("employee_name"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  projectNumber: text("project_number"),
  orderNumber: text("order_number"),
  completed: boolean("completed").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointments.$inferSelect;

export const appointmentTypes = ["Termin", "Arbeitsauftrag", "Wartung", "Besprechung", "Berufsschule"];

export const serialNumbers = pgTable("serial_numbers", {
  id: serial("id").primaryKey(),
  serialNumber: text("serial_number").notNull(),
  materialId: integer("material_id"),
  materialNumber: text("material_number"),
  materialName: text("material_name"),
  entryDate: date("entry_date"),
  location: text("location"),
  incomingInvoice: text("incoming_invoice"),
  deliveryNote: text("delivery_note"),
  supplier: text("supplier"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  saleDocument: text("sale_document"),
  saleDate: date("sale_date"),
  history: jsonb("history").$type<any[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSerialNumberSchema = createInsertSchema(serialNumbers).omit({ id: true, createdAt: true });
export type InsertSerialNumber = z.infer<typeof insertSerialNumberSchema>;
export type SerialNumber = typeof serialNumbers.$inferSelect;

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  serviceNumber: text("service_number").notNull(),
  searchKey: text("search_key"),
  shortText: text("short_text").notNull(),
  unit: text("unit").default("Stk"),
  trade: text("trade").default("SHK"),
  posNr: integer("pos_nr").default(0),
  laborTime: decimal("labor_time", { precision: 10, scale: 4 }).default("0"),
  laborRate: decimal("labor_rate", { precision: 10, scale: 2 }).default("0"),
  laborPrice: decimal("labor_price", { precision: 10, scale: 2 }).default("0"),
  laborRateEk: decimal("labor_rate_ek", { precision: 7, scale: 2 }).default("0"),
  laborRate1: decimal("labor_rate1", { precision: 7, scale: 2 }).default("0"),
  laborRate2: decimal("labor_rate2", { precision: 7, scale: 2 }).default("0"),
  laborRate3: decimal("labor_rate3", { precision: 7, scale: 2 }).default("0"),
  materialCost: decimal("material_cost", { precision: 10, scale: 2 }).default("0"),
  materialVk1: decimal("material_vk1", { precision: 12, scale: 5 }).default("0"),
  materialVk2: decimal("material_vk2", { precision: 12, scale: 5 }).default("0"),
  materialVk3: decimal("material_vk3", { precision: 12, scale: 5 }).default("0"),
  pauschal1: decimal("pauschal1", { precision: 12, scale: 5 }).default("0"),
  listPrice: decimal("list_price", { precision: 12, scale: 5 }).default("0"),
  equipmentCost: decimal("equipment_cost", { precision: 10, scale: 2 }).default("0"),
  equipmentEk: decimal("equipment_ek", { precision: 12, scale: 5 }).default("0"),
  equipmentVk: decimal("equipment_vk", { precision: 12, scale: 5 }).default("0"),
  externalCost: decimal("external_cost", { precision: 10, scale: 2 }).default("0"),
  externalEk: decimal("external_ek", { precision: 12, scale: 5 }).default("0"),
  externalVk: decimal("external_vk", { precision: 12, scale: 5 }).default("0"),
  copperCode: text("copper_code"),
  copperWeight: decimal("copper_weight", { precision: 8, scale: 3 }).default("0"),
  weight: decimal("weight", { precision: 8, scale: 3 }).default("0"),
  surface: decimal("surface", { precision: 10, scale: 6 }).default("0"),
  volume: decimal("volume", { precision: 10, scale: 6 }).default("0"),
  costType: integer("cost_type").default(0),
  taxClass: text("tax_class"),
  fixedPrice: boolean("fixed_price").default(false),
  metalId: text("metal_id"),
  markup: decimal("markup", { precision: 10, scale: 2 }).default("65"),
  revenueAccount: text("revenue_account").default("8400"),
  group: text("group_name"),
  status: text("status").notNull().default("aktiv"),
  bomItems: jsonb("bom_items").$type<any[]>().default([]),
  longText: text("long_text"),
  posData: text("pos_data"),
  laborData: text("labor_data"),
  priceHist: text("price_hist"),
  meldung: text("meldung"),
  createdDate: date("created_date"),
  lastWanted: date("last_wanted"),
  changedBy: text("changed_by"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertServiceSchema = createInsertSchema(services).omit({ id: true, createdAt: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof services.$inferSelect;

export const jumboPackages = pgTable("jumbo_packages", {
  id: serial("id").primaryKey(),
  jumboNumber: text("jumbo_number").notNull(),
  searchKey: text("search_key"),
  shortText: text("short_text").notNull(),
  unit: text("unit").default("psch"),
  description: text("description"),
  items: jsonb("items").$type<any[]>().default([]),
  laborTotal: decimal("labor_total", { precision: 10, scale: 2 }).default("0"),
  materialTotal: decimal("material_total", { precision: 10, scale: 2 }).default("0"),
  equipmentTotal: decimal("equipment_total", { precision: 10, scale: 2 }).default("0"),
  externalTotal: decimal("external_total", { precision: 10, scale: 2 }).default("0"),
  totalEk: decimal("total_ek", { precision: 10, scale: 2 }).default("0"),
  markup: decimal("markup", { precision: 10, scale: 2 }).default("45"),
  salePrice: decimal("sale_price", { precision: 10, scale: 2 }).default("0"),
  revenueAccount: text("revenue_account").default("8400"),
  group: text("group_name"),
  status: text("status").notNull().default("aktiv"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJumboPackageSchema = createInsertSchema(jumboPackages).omit({ id: true, createdAt: true });
export type InsertJumboPackage = z.infer<typeof insertJumboPackageSchema>;
export type JumboPackage = typeof jumboPackages.$inferSelect;

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  accountNumber: text("account_number").notNull(),
  name: text("name").notNull(),
  category: integer("category").default(0),
  class: integer("class").default(0),
  taxKey: text("tax_key"),
  datevKey: text("datev_key"),
  skontoAccount: text("skonto_account"),
  isGroup: boolean("is_group").default(false),
  active: boolean("active").default(true),
});

export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;

export const taxRates = pgTable("tax_rates", {
  id: serial("id").primaryKey(),
  matchKey: text("match_key").notNull(),
  name: text("name").notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).default("0"),
  datevKey: text("datev_key"),
  accountNumber: text("account_number"),
  active: boolean("active").default(true),
});

export const insertTaxRateSchema = createInsertSchema(taxRates).omit({ id: true });
export type InsertTaxRate = z.infer<typeof insertTaxRateSchema>;
export type TaxRate = typeof taxRates.$inferSelect;

export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  type: text("type").notNull().default("frei"),
  documentRef: text("document_ref"),
  debitAccount: text("debit_account").notNull(),
  creditAccount: text("credit_account").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  taxRate: text("tax_rate"),
  description: text("description").notNull(),
  address: text("address"),
  projectNumber: text("project_number"),
  reId: integer("re_id"),
  idx: integer("idx").default(0),
  serialNumber: text("serial_number"),
  period: text("period"),
  bookingType: text("booking_type"),
  subType: text("sub_type"),
  code: integer("code").default(0),
  invoiceNumber: text("invoice_number"),
  addressNumber: text("address_number"),
  addressSearch: text("address_search"),
  subject: text("subject"),
  documentDate: date("document_date"),
  invoiceDate: date("invoice_date"),
  entryDate: date("entry_date"),
  dueDate: date("due_date"),
  paymentDate: date("payment_date"),
  discountDate: date("discount_date"),
  dunningDate: date("dunning_date"),
  netAmount: decimal("net_amount", { precision: 12, scale: 2 }).default("0"),
  grossAmount: decimal("gross_amount", { precision: 12, scale: 2 }).default("0"),
  paymentAmount: decimal("payment_amount", { precision: 12, scale: 2 }).default("0"),
  openAmount: decimal("open_amount", { precision: 12, scale: 2 }).default("0"),
  retention: decimal("retention", { precision: 12, scale: 2 }).default("0"),
  reduction: decimal("reduction", { precision: 12, scale: 2 }).default("0"),
  creditNote: decimal("credit_note", { precision: 12, scale: 2 }).default("0"),
  taxKey: text("tax_key"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  taxPercent: decimal("tax_percent", { precision: 6, scale: 2 }).default("0"),
  revenueAccount: text("revenue_account"),
  counterAccount: text("counter_account"),
  discountAccount: text("discount_account"),
  reductionAccount: text("reduction_account"),
  costCenter: text("cost_center"),
  costCarrier: text("cost_carrier"),
  discountPercent: decimal("discount_percent", { precision: 12, scale: 7 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  isPaid: integer("is_paid").default(0),
  isDunned: integer("is_dunned").default(0),
  isCancelled: integer("is_cancelled").default(0),
  isEuro: boolean("is_euro").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({ id: true, createdAt: true });
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

export const ledgerTypes = ["RA", "RE", "KB", "frei"];

export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  type: text("type").notNull().default("Zugang"),
  materialId: integer("material_id"),
  materialNumber: text("material_number"),
  materialName: text("material_name"),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  location: text("location"),
  projectNumber: text("project_number"),
  orderNumber: text("order_number"),
  employeeName: text("employee_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovements).omit({ id: true, createdAt: true });
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  supplier: text("supplier").notNull(),
  orderDate: date("order_date").notNull(),
  deliveryDate: date("delivery_date"),
  projectNumber: text("project_number"),
  status: text("status").notNull().default("offen"),
  items: jsonb("items").$type<any[]>().default([]),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

export const purchaseOrderStatuses = ["offen", "bestellt", "teilgeliefert", "geliefert", "storniert"];

export const measurements = pgTable("measurements", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id"),
  documentNumber: text("document_number"),
  projectNumber: text("project_number"),
  title: text("title").notNull(),
  room: text("room"),
  formula: text("formula"),
  length: decimal("length", { precision: 10, scale: 3 }),
  width: decimal("width", { precision: 10, scale: 3 }),
  height: decimal("height", { precision: 10, scale: 3 }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }),
  result: decimal("result", { precision: 10, scale: 3 }),
  unit: text("unit").default("m²"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMeasurementSchema = createInsertSchema(measurements).omit({ id: true, createdAt: true });
export type InsertMeasurement = z.infer<typeof insertMeasurementSchema>;
export type Measurement = typeof measurements.$inferSelect;

export const formTemplates = pgTable("form_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("Dokument"),
  description: text("description"),
  status: text("status").notNull().default("aktiv"),
  printer: text("printer"),
  fields: jsonb("fields").$type<any[]>().default([]),
  fieldsPage2: jsonb("fields_page2").$type<any[]>().default([]),
  workArea: jsonb("work_area"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFormTemplateSchema = createInsertSchema(formTemplates).omit({ id: true, createdAt: true });
export type InsertFormTemplate = z.infer<typeof insertFormTemplateSchema>;
export type FormTemplate = typeof formTemplates.$inferSelect;

export const listTemplates = pgTable("list_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  baseTable: text("base_table").notNull(),
  description: text("description"),
  columns: jsonb("columns").$type<any[]>().default([]),
  filters: jsonb("filters").$type<any[]>().default([]),
  sorting: jsonb("sorting"),
  status: text("status").notNull().default("aktiv"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertListTemplateSchema = createInsertSchema(listTemplates).omit({ id: true, createdAt: true });
export type InsertListTemplate = z.infer<typeof insertListTemplateSchema>;
export type ListTemplate = typeof listTemplates.$inferSelect;

export const defaultUnits = [
  { code: "Std", name: "Stunde", sortOrder: 1 },
  { code: "m", name: "Meter", sortOrder: 2 },
  { code: "m²", name: "Quadratmeter", sortOrder: 3 },
  { code: "m³", name: "Kubikmeter", sortOrder: 4 },
  { code: "lfm", name: "Laufmeter", sortOrder: 5 },
  { code: "Stk", name: "Stück", sortOrder: 6 },
  { code: "Pkg", name: "Packung", sortOrder: 7 },
  { code: "kg", name: "Kilogramm", sortOrder: 8 },
  { code: "t", name: "Tonne", sortOrder: 9 },
  { code: "Tag", name: "Tag", sortOrder: 10 },
  { code: "Wo", name: "Woche", sortOrder: 11 },
  { code: "Geb", name: "Gebinde", sortOrder: 12 },
  { code: "pau", name: "Pauschal", sortOrder: 13 },
  { code: "l", name: "Liter", sortOrder: 14 },
  { code: "Rolle", name: "Rolle", sortOrder: 15 },
  { code: "Bund", name: "Bund", sortOrder: 16 },
];

export const projectDocumentTree = pgTable("project_document_tree", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  documentId: integer("document_id"),
  parentId: integer("parent_id"),
  nodeType: text("node_type").notNull().default("document"),
  folderName: text("folder_name"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertProjectDocumentTreeSchema = createInsertSchema(projectDocumentTree).omit({ id: true });
export type InsertProjectDocumentTree = z.infer<typeof insertProjectDocumentTreeSchema>;
export type ProjectDocumentTreeNode = typeof projectDocumentTree.$inferSelect;

export const fibuBuchungen = pgTable("fibu_buchungen", {
  id: serial("id").primaryKey(),
  reId: integer("re_id").notNull(),
  idx: integer("idx").notNull().default(0),
  lfdNr: text("lfd_nr"),
  periode: text("periode"),
  art: text("art").notNull(),
  typ: text("typ"),
  kennung: integer("kennung"),
  rnr: text("rnr").notNull(),
  adrNr: text("adr_nr"),
  adrSuch: text("adr_such"),
  betreff: text("betreff"),
  belegdat: date("belegdat"),
  rechdat: date("rechdat"),
  erfasstdat: date("erfasstdat"),
  faelligdat: date("faelligdat"),
  zahldat: date("zahldat"),
  skontodat: date("skontodat"),
  stornodat: date("stornodat"),
  bezugidx: integer("bezugidx"),
  betrag: decimal("betrag", { precision: 15, scale: 2 }).default("0"),
  zahlung: decimal("zahlung", { precision: 15, scale: 2 }).default("0"),
  netto: decimal("netto", { precision: 15, scale: 2 }).default("0"),
  brutto: decimal("brutto", { precision: 15, scale: 2 }).default("0"),
  einbehalt: decimal("einbehalt", { precision: 15, scale: 2 }).default("0"),
  minderung: decimal("minderung", { precision: 15, scale: 2 }).default("0"),
  offen: decimal("offen", { precision: 15, scale: 2 }).default("0"),
  gutschrift: decimal("gutschrift", { precision: 15, scale: 2 }).default("0"),
  kuerzung: decimal("kuerzung", { precision: 15, scale: 2 }).default("0"),
  skProzent: decimal("sk_prozent", { precision: 6, scale: 2 }).default("0"),
  skBetrag: decimal("sk_betrag", { precision: 15, scale: 2 }).default("0"),
  skBasis: decimal("sk_basis", { precision: 15, scale: 2 }).default("0"),
  mahnGeb: decimal("mahn_geb", { precision: 10, scale: 2 }).default("0"),
  kontoB: text("konto_b"),
  kontoG: text("konto_g"),
  kontoS: text("konto_s"),
  kontoM: text("konto_m"),
  kst: text("kst"),
  ktr: text("ktr"),
  bezahlflag: integer("bezahlflag").default(0),
  stornoflag: integer("stornoflag").default(0),
  mahnflag: integer("mahnflag").default(0),
  mahnen: boolean("mahnen").default(true),
  auszug: text("auszug"),
  documentId: integer("document_id"),
});

export const insertFibuBuchungSchema = createInsertSchema(fibuBuchungen).omit({ id: true });
export type InsertFibuBuchung = z.infer<typeof insertFibuBuchungSchema>;
export type FibuBuchung = typeof fibuBuchungen.$inferSelect;

export const balanceSheetItems = pgTable("balance_sheet_items", {
  id: serial("id").primaryKey(),
  bpNr: integer("bp_nr").notNull(),
  description: text("description").notNull(),
});

export const insertBalanceSheetItemSchema = createInsertSchema(balanceSheetItems).omit({ id: true });
export type InsertBalanceSheetItem = z.infer<typeof insertBalanceSheetItemSchema>;
export type BalanceSheetItem = typeof balanceSheetItems.$inferSelect;

export const incomeStatementItems = pgTable("income_statement_items", {
  id: serial("id").primaryKey(),
  nr: integer("nr").notNull(),
  description: text("description").notNull(),
});

export const insertIncomeStatementItemSchema = createInsertSchema(incomeStatementItems).omit({ id: true });
export type InsertIncomeStatementItem = z.infer<typeof insertIncomeStatementItemSchema>;
export type IncomeStatementItem = typeof incomeStatementItems.$inferSelect;

export const hourlyRateConfig = pgTable("hourly_rate_config", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull(),
  description: text("description"),
  stdWoche: decimal("std_woche", { precision: 5, scale: 2 }),
  erstattung: integer("erstattung"),
  anwesend: decimal("anwesend", { precision: 5, scale: 2 }),
  stdJahr: integer("std_jahr"),
  zusatz: integer("zusatz"),
  fehltage: integer("fehltage"),
  personen: integer("personen"),
  upProzent: decimal("up_prozent", { precision: 6, scale: 2 }),
  uGehalt: decimal("u_gehalt", { precision: 10, scale: 2 }),
  lnk: decimal("lnk", { precision: 10, scale: 2 }),
  faktor: decimal("faktor", { precision: 10, scale: 2 }),
  ycostChef: decimal("ycost_chef", { precision: 10, scale: 2 }),
  ycostPers: decimal("ycost_pers", { precision: 10, scale: 2 }),
  ycostSach: decimal("ycost_sach", { precision: 10, scale: 2 }),
  ycostFix: decimal("ycost_fix", { precision: 10, scale: 2 }),
  przSachk: decimal("prz_sachk", { precision: 6, scale: 2 }),
  lkStd: decimal("lk_std", { precision: 7, scale: 2 }),
  fea: decimal("fea", { precision: 10, scale: 2 }),
  gewinn: decimal("gewinn", { precision: 10, scale: 2 }),
  umsatz: decimal("umsatz", { precision: 10, scale: 2 }),
  stdSatz: decimal("std_satz", { precision: 10, scale: 2 }),
  aktuell: boolean("aktuell").default(false),
  xpCost: decimal("xp_cost", { precision: 10, scale: 2 }),
});

export const insertHourlyRateConfigSchema = createInsertSchema(hourlyRateConfig).omit({ id: true });
export type InsertHourlyRateConfig = z.infer<typeof insertHourlyRateConfigSchema>;
export type HourlyRateConfig = typeof hourlyRateConfig.$inferSelect;

export const positionHistory = pgTable("position_history", {
  id: serial("id").primaryKey(),
  docNr: text("doc_nr").notNull(),
  lineId: integer("line_id"),
  docDate: text("doc_date"),
  customerNr: text("customer_nr"),
  endCustomer: text("end_customer"),
  flags: text("flags"),
  posNr: text("pos_nr"),
  quantity: decimal("quantity", { precision: 14, scale: 5 }),
  unit: text("unit"),
  itemId: text("item_id"),
  supplierTrade: text("supplier_trade"),
  articleNr: text("article_nr"),
  jumbLineId: integer("jumb_line_id"),
  shortText: text("short_text"),
  laborTime: decimal("labor_time", { precision: 14, scale: 5 }),
  laborCostEk: decimal("labor_cost_ek", { precision: 10, scale: 2 }),
  laborCostVk: decimal("labor_cost_vk", { precision: 10, scale: 2 }),
  materialEk: decimal("material_ek", { precision: 14, scale: 5 }),
  materialVk: decimal("material_vk", { precision: 14, scale: 5 }),
  equipmentEk: decimal("equipment_ek", { precision: 14, scale: 5 }),
  equipmentVk: decimal("equipment_vk", { precision: 14, scale: 5 }),
  externalEk: decimal("external_ek", { precision: 14, scale: 5 }),
  externalVk: decimal("external_vk", { precision: 14, scale: 5 }),
  flatRate: decimal("flat_rate", { precision: 14, scale: 5 }),
  setUnitPrice: boolean("set_unit_price").default(false),
  unitPrice: decimal("unit_price", { precision: 14, scale: 5 }),
  discountRate: decimal("discount_rate", { precision: 8, scale: 2 }),
  discountValue: decimal("discount_value", { precision: 14, scale: 5 }),
  isEuro: boolean("is_euro").default(true),
  mainGroup: text("main_group"),
  subGroup: text("sub_group"),
  costType: integer("cost_type"),
  revenueAccount: text("revenue_account"),
  costCenter: text("cost_center"),
  tariff: text("tariff"),
  historyType: text("history_type").notNull().default("normal"),
});

export const insertPositionHistorySchema = createInsertSchema(positionHistory).omit({ id: true });
export type InsertPositionHistory = z.infer<typeof insertPositionHistorySchema>;
export type PositionHistory = typeof positionHistory.$inferSelect;

export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  itemId: text("item_id"),
  supplierTrade: text("supplier_trade"),
  articleNr: text("article_nr"),
  docDate: text("doc_date"),
  docName: text("doc_name"),
  posNr: text("pos_nr"),
  quantity: decimal("quantity", { precision: 14, scale: 5 }),
  unit: text("unit"),
  unitPrice: decimal("unit_price", { precision: 14, scale: 5 }),
  discountRate: decimal("discount_rate", { precision: 8, scale: 2 }),
  customerNr: text("customer_nr"),
  endCustomer: text("end_customer"),
  lineId: integer("line_id"),
  jumbLineId: integer("jumb_line_id"),
  flags: text("flags"),
});

export const insertPriceHistorySchema = createInsertSchema(priceHistory).omit({ id: true });
export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
export type PriceHistory = typeof priceHistory.$inferSelect;

export const documentLinks = pgTable("document_links", {
  id: serial("id").primaryKey(),
  docId: text("doc_id"),
  docName: text("doc_name"),
  partnerId: text("partner_id"),
  guid: text("guid"),
  crc: text("crc"),
});

export const insertDocumentLinkSchema = createInsertSchema(documentLinks).omit({ id: true });
export type InsertDocumentLink = z.infer<typeof insertDocumentLinkSchema>;
export type DocumentLink = typeof documentLinks.$inferSelect;

export const projectAddresses = pgTable("project_addresses", {
  id: serial("id").primaryKey(),
  projectName: text("project_name"),
  functionRole: text("function_role"),
  addressNr: text("address_nr"),
  contactNr: text("contact_nr"),
});

export const insertProjectAddressSchema = createInsertSchema(projectAddresses).omit({ id: true });
export type InsertProjectAddress = z.infer<typeof insertProjectAddressSchema>;
export type ProjectAddress = typeof projectAddresses.$inferSelect;

export const statusEvents = pgTable("status_events", {
  id: serial("id").primaryKey(),
  event: text("event"),
  statProject: text("stat_project"),
  docType: text("doc_type"),
  statDoc: text("stat_doc"),
  newDocType: text("new_doc_type"),
  newStatProject: text("new_stat_project"),
  fnNewStatProject: text("fn_new_stat_project"),
  newStatDoc: text("new_stat_doc"),
  fnNewStatDoc: text("fn_new_stat_doc"),
  newStatNewDoc: text("new_stat_new_doc"),
  fnNewStatNewDoc: text("fn_new_stat_new_doc"),
  description: text("description"),
});

export const insertStatusEventSchema = createInsertSchema(statusEvents).omit({ id: true });
export type InsertStatusEvent = z.infer<typeof insertStatusEventSchema>;
export type StatusEvent = typeof statusEvents.$inferSelect;

export const fibuKonten = pgTable("fibu_konten", {
  id: serial("id").primaryKey(),
  kontoNr: integer("konto_nr").notNull(),
  kategorie: integer("kategorie").default(0),
  klasse: integer("klasse").default(0),
  bezeichnung: text("bezeichnung").notNull(),
  strId: text("str_id"),
  ustvakz: text("ustvakz"),
  bpNr: integer("bp_nr").default(0),
  guv: integer("guv"),
  skontoKto: integer("skonto_kto"),
  minderKto: integer("minder_kto"),
});

export const insertFibuKontoSchema = createInsertSchema(fibuKonten).omit({ id: true });
export type InsertFibuKonto = z.infer<typeof insertFibuKontoSchema>;
export type FibuKonto = typeof fibuKonten.$inferSelect;

export const fibuBankkonten = pgTable("fibu_bankkonten", {
  id: serial("id").primaryKey(),
  kontoNr: integer("konto_nr").notNull().unique(),
  bezeichnung: text("bezeichnung").notNull(),
  kontoNr2: text("konto_nr2"),
  blz: text("blz"),
  inhaber: text("inhaber"),
  iban: text("iban"),
  bic: text("bic"),
  stand: decimal("stand", { precision: 15, scale: 2 }).default("0"),
});

export const insertFibuBankkontoSchema = createInsertSchema(fibuBankkonten).omit({ id: true });
export type InsertFibuBankkonto = z.infer<typeof insertFibuBankkontoSchema>;
export type FibuBankkonto = typeof fibuBankkonten.$inferSelect;

export const fibuSteuersaetze = pgTable("fibu_steuersaetze", {
  id: serial("id").primaryKey(),
  strId: integer("str_id").notNull().unique(),
  match: text("match").notNull(),
  bezeichnung: text("bezeichnung").notNull(),
  prozent: decimal("prozent", { precision: 6, scale: 2 }),
  kntNr: text("knt_nr"),
  kontoDatev: text("konto_datev"),
  vstKto: text("vst_kto"),
  ustKto: text("ust_kto"),
  vstPrz: decimal("vst_prz", { precision: 6, scale: 2 }),
  ustPrz: decimal("ust_prz", { precision: 6, scale: 2 }),
  flags: text("flags"),
});

export const insertFibuSteuersatzSchema = createInsertSchema(fibuSteuersaetze).omit({ id: true });
export type InsertFibuSteuersatz = z.infer<typeof insertFibuSteuersatzSchema>;
export type FibuSteuersatz = typeof fibuSteuersaetze.$inferSelect;

export const fibuTextvorgaben = pgTable("fibu_textvorgaben", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  konto: text("konto"),
  konto2: text("konto2"),
  adrNr: text("adr_nr"),
  betrag: decimal("betrag", { precision: 12, scale: 2 }),
  belegNr: text("beleg_nr"),
  kst: text("kst"),
});

export const insertFibuTextvorgabeSchema = createInsertSchema(fibuTextvorgaben).omit({ id: true });
export type InsertFibuTextvorgabe = z.infer<typeof insertFibuTextvorgabeSchema>;
export type FibuTextvorgabe = typeof fibuTextvorgaben.$inferSelect;

export const workOrders = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  searchKey: text("search_key"),
  customerNumber: text("customer_number"),
  customerId: integer("customer_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  invoiceRecipient: text("invoice_recipient"),
  monteur: text("monteur"),
  monteurId: text("monteur_id"),
  projectNumber: text("project_number"),
  contractNumber: text("contract_number"),
  plantNumber: text("plant_number"),
  orderType: text("order_type"),
  receivedDate: date("received_date"),
  issuedBy: text("issued_by"),
  scheduledDate: date("scheduled_date"),
  scheduledTime: text("scheduled_time"),
  endDate: date("end_date"),
  endTime: text("end_time"),
  subject: text("subject"),
  workLocationName: text("work_location_name"),
  workLocationStreet: text("work_location_street"),
  workLocationZip: text("work_location_zip"),
  workLocationCity: text("work_location_city"),
  property: text("property"),
  workLocation: text("work_location"),
  isWarranty: boolean("is_warranty").default(false),
  status: integer("status").default(0),
  completed: boolean("completed").default(false),
  account: text("account"),
  costCenter: text("cost_center"),
  derivedFrom: text("derived_from"),
  invoiceNumber: text("invoice_number"),
  deliveryNoteNumber: text("delivery_note_number"),
  beginPhrase: text("begin_phrase"),
  endPhrase: text("end_phrase"),
  followUpDate: date("follow_up_date"),
  contactPersonNr: integer("contact_person_nr"),
  tenantNr: integer("tenant_nr"),
  travelTime: integer("travel_time").default(0),
  zusatz1: text("zusatz_1"), zusatz2: text("zusatz_2"), zusatz3: text("zusatz_3"), zusatz4: text("zusatz_4"),
  zusatz5: text("zusatz_5"), zusatz6: text("zusatz_6"), zusatz7: text("zusatz_7"), zusatz8: text("zusatz_8"),
  zusatz9: text("zusatz_9"), zusatz10: text("zusatz_10"), zusatz11: text("zusatz_11"), zusatz12: text("zusatz_12"),
  zusatz13: text("zusatz_13"), zusatz14: text("zusatz_14"), zusatz15: text("zusatz_15"), zusatz16: text("zusatz_16"),
  createdBy: text("created_by"),
  changedBy: text("changed_by"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
  notes: text("notes"),
  description: text("description"),
  positions: jsonb("positions").$type<any[]>().default([]),
  personnel: jsonb("personnel").$type<any[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({ id: true, createdAt: true });
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrder = typeof workOrders.$inferSelect;

export const plants = pgTable("plants", {
  id: serial("id").primaryKey(),
  plantNumber: text("plant_number").notNull(),
  searchKey: text("search_key"),
  customerNumber: text("customer_number"),
  customerId: integer("customer_id"),
  invoiceRecipient: text("invoice_recipient"),
  monteur: text("monteur"),
  projectNumber: text("project_number"),
  contractNumber: text("contract_number"),
  plantType: text("plant_type"),
  materialIndex: text("material_index"),
  designation: text("designation").notNull(),
  serialNumber: text("serial_number"),
  locationName: text("location_name"),
  locationStreet: text("location_street"),
  locationHouseNr: text("location_house_nr"),
  locationZip: text("location_zip"),
  locationCity: text("location_city"),
  property: text("property"),
  standort: text("standort"),
  manufactureDate: date("manufacture_date"),
  commissioningDate: date("commissioning_date"),
  tuevDate: date("tuev_date"),
  salePrice: decimal("sale_price", { precision: 9, scale: 2 }).default("0"),
  depreciationCycle: integer("depreciation_cycle").default(0),
  lastServiceDate: date("last_service_date"),
  intervalMonths: integer("interval_months").default(12),
  nextServiceDate: date("next_service_date"),
  plannedServiceDate: date("planned_service_date"),
  account: text("account"),
  costCenter: text("cost_center"),
  lastOrderNr: text("last_order_nr"),
  lastOrderDate: date("last_order_date"),
  lastInvoiceNr: text("last_invoice_nr"),
  lastInvoiceDate: date("last_invoice_date"),
  beginPhrase: text("begin_phrase"),
  endPhrase: text("end_phrase"),
  positionsCopied: boolean("positions_copied").default(false),
  zusatz1: text("zusatz_1"), zusatz2: text("zusatz_2"), zusatz3: text("zusatz_3"), zusatz4: text("zusatz_4"),
  zusatz5: text("zusatz_5"), zusatz6: text("zusatz_6"), zusatz7: text("zusatz_7"), zusatz8: text("zusatz_8"),
  zusatz9: text("zusatz_9"), zusatz10: text("zusatz_10"), zusatz11: text("zusatz_11"), zusatz12: text("zusatz_12"),
  zusatz13: text("zusatz_13"), zusatz14: text("zusatz_14"), zusatz15: text("zusatz_15"), zusatz16: text("zusatz_16"),
  externalDoc: text("external_doc"),
  contactPersonNr: integer("contact_person_nr"),
  tenantNr: integer("tenant_nr"),
  inactive: boolean("inactive").default(false),
  changedBy: text("changed_by"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
  notes: text("notes"),
  description: text("description"),
  measurements: jsonb("measurements").$type<any[]>().default([]),
  positions: jsonb("positions").$type<any[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlantSchema = createInsertSchema(plants).omit({ id: true, createdAt: true });
export type InsertPlant = z.infer<typeof insertPlantSchema>;
export type Plant = typeof plants.$inferSelect;

export const plantTypes = pgTable("plant_types", {
  id: serial("id").primaryKey(),
  typeCode: text("type_code").notNull(),
  designation: text("designation").notNull(),
  firstNumber: text("first_number"),
  intervalMonths: integer("interval_months").default(12),
  beginPhrase: text("begin_phrase"),
  endPhrase: text("end_phrase"),
  measurementSizes: text("measurement_sizes"),
  measurementUnits: text("measurement_units"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
});

export const insertPlantTypeSchema = createInsertSchema(plantTypes).omit({ id: true });
export type InsertPlantType = z.infer<typeof insertPlantTypeSchema>;
export type PlantType = typeof plantTypes.$inferSelect;

export const contractTypes = pgTable("contract_types", {
  id: serial("id").primaryKey(),
  typeCode: text("type_code").notNull(),
  designation: text("designation").notNull(),
  firstNumber: text("first_number"),
  intervalMonths: integer("interval_months").default(12),
  beginPhrase: text("begin_phrase"),
  endPhrase: text("end_phrase"),
  paymentType: text("payment_type"),
  description: text("description"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
});

export const insertContractTypeSchema = createInsertSchema(contractTypes).omit({ id: true });
export type InsertContractType = z.infer<typeof insertContractTypeSchema>;
export type ContractType = typeof contractTypes.$inferSelect;

export const stockItems = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  locationCode: text("location_code"),
  supplierCode: text("supplier_code"),
  itemNumber: text("item_number").notNull(),
  searchKey: text("search_key"),
  shortText: text("short_text"),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).default("0"),
  unit: text("unit"),
  packagingUnit: text("packaging_unit"),
  unitsPerPack: decimal("units_per_pack", { precision: 8, scale: 2 }).default("0"),
  usePackUnit: boolean("use_pack_unit").default(false),
  orderPrice: decimal("order_price", { precision: 12, scale: 5 }).default("0"),
  employeeId: text("employee_id"),
  documentNr: text("document_nr"),
  projectNr: text("project_nr"),
  lineId: integer("line_id"),
  orderDate: date("order_date"),
  deliveryDate: date("delivery_date"),
  orderNr: text("order_nr"),
  orderedAt: date("ordered_at"),
  weight: decimal("weight", { precision: 8, scale: 3 }).default("0"),
  dinWeight: decimal("din_weight", { precision: 8, scale: 3 }).default("0"),
  surface: decimal("surface", { precision: 10, scale: 6 }).default("0"),
  volume: decimal("volume", { precision: 10, scale: 6 }).default("0"),
  createdDate: date("created_date"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
  changedBy: text("changed_by"),
  txData: text("tx_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStockItemSchema = createInsertSchema(stockItems).omit({ id: true, createdAt: true });
export type InsertStockItem = z.infer<typeof insertStockItemSchema>;
export type StockItem = typeof stockItems.$inferSelect;

export const stockLocations = pgTable("stock_locations", {
  id: serial("id").primaryKey(),
  locationCode: text("location_code").notNull(),
  designation: text("designation").notNull(),
  address: text("address"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
});

export const insertStockLocationSchema = createInsertSchema(stockLocations).omit({ id: true });
export type InsertStockLocation = z.infer<typeof insertStockLocationSchema>;
export type StockLocation = typeof stockLocations.$inferSelect;

export const stockHistory = pgTable("stock_history", {
  id: serial("id").primaryKey(),
  locationCode: text("location_code"),
  supplierCode: text("supplier_code"),
  itemNumber: text("item_number"),
  category: text("category"),
  movementType: text("movement_type"),
  movementId: text("movement_id"),
  detailCode: integer("detail_code").default(0),
  unit: text("unit"),
  oldValue: decimal("old_value", { precision: 12, scale: 5 }).default("0"),
  midEk: decimal("mid_ek", { precision: 12, scale: 5 }).default("0"),
  newValue: decimal("new_value", { precision: 12, scale: 5 }).default("0"),
  quantity: decimal("quantity", { precision: 12, scale: 5 }).default("0"),
  price: decimal("price", { precision: 12, scale: 5 }).default("0"),
  documentNr: text("document_nr"),
  projectNr: text("project_nr"),
  employeeId: text("employee_id"),
  lineId: integer("line_id"),
  referenceNr: text("reference_nr"),
  movementDate: date("movement_date"),
  notes: text("notes"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStockHistorySchema = createInsertSchema(stockHistory).omit({ id: true, createdAt: true });
export type InsertStockHistory = z.infer<typeof insertStockHistorySchema>;
export type StockHistoryEntry = typeof stockHistory.$inferSelect;

export const postCalculationItems = pgTable("post_calculation_items", {
  id: serial("id").primaryKey(),
  projectNumber: text("project_number"),
  postCalculationId: integer("post_calculation_id"),
  itemId: text("item_id"),
  itemType: text("item_type"),
  sourceId: integer("source_id").default(0),
  sourceIndex: integer("source_index").default(0),
  code: integer("code").default(0),
  documentNr: text("document_nr"),
  lineId: integer("line_id").default(0),
  lfdNr: text("lfd_nr"),
  receiptNr: text("receipt_nr"),
  addressNr: text("address_nr"),
  sourceType: text("source_type"),
  supplierCode: text("supplier_code"),
  itemNumber: text("item_number"),
  employeeNr: text("employee_nr"),
  wageType: text("wage_type"),
  receiptDate: date("receipt_date"),
  quantity: decimal("quantity", { precision: 12, scale: 5 }).default("0"),
  unit: text("unit"),
  laborTime: decimal("labor_time", { precision: 9, scale: 2 }).default("0"),
  materialEk: decimal("material_ek", { precision: 12, scale: 2 }).default("0"),
  equipmentEk: decimal("equipment_ek", { precision: 12, scale: 2 }).default("0"),
  externalEk: decimal("external_ek", { precision: 12, scale: 2 }).default("0"),
  otherEk: decimal("other_ek", { precision: 12, scale: 2 }).default("0"),
  copperEk: decimal("copper_ek", { precision: 12, scale: 2 }).default("0"),
  laborRateEk: decimal("labor_rate_ek", { precision: 7, scale: 2 }).default("0"),
  factor: decimal("factor", { precision: 6, scale: 2 }).default("0"),
  surcharge: decimal("surcharge", { precision: 12, scale: 2 }).default("0"),
  isOneTime: boolean("is_one_time").default(false),
  laborEk: decimal("labor_ek", { precision: 12, scale: 2 }).default("0"),
  laborFlat: decimal("labor_flat", { precision: 12, scale: 2 }).default("0"),
  copperCode: decimal("copper_code", { precision: 7, scale: 3 }).default("0"),
  copperWeight: decimal("copper_weight", { precision: 8, scale: 3 }).default("0"),
  amount: decimal("amount", { precision: 12, scale: 2 }).default("0"),
  totalVk: decimal("total_vk", { precision: 12, scale: 2 }).default("0"),
  flatRate: decimal("flat_rate", { precision: 12, scale: 2 }).default("0"),
  description: text("description"),
  account: text("account"),
  costCenter: text("cost_center"),
  costType: integer("cost_type").default(0),
  calcDate: date("calc_date"),
  pctLabor: decimal("pct_labor", { precision: 7, scale: 2 }).default("0"),
  pctMaterial: decimal("pct_material", { precision: 7, scale: 2 }).default("0"),
  pctEquipment: decimal("pct_equipment", { precision: 7, scale: 2 }).default("0"),
  pctExternal: decimal("pct_external", { precision: 7, scale: 2 }).default("0"),
  pctOther: decimal("pct_other", { precision: 7, scale: 2 }).default("0"),
  pctTotal: decimal("pct_total", { precision: 7, scale: 2 }).default("0"),
  lineFlags: text("line_flags"),
  addFlags: text("add_flags"),
  posNr: text("pos_nr"),
  hierarchyLevel: integer("hierarchy_level").default(0),
  parentLineId: integer("parent_line_id").default(0),
  docIndex: integer("doc_index").default(0),
  secIndex: integer("sec_index").default(0),
  excluded: boolean("excluded").default(false),
  nakaId: integer("naka_id").default(0),
  materialVk: decimal("material_vk", { precision: 12, scale: 2 }).default("0"),
  equipmentVk: decimal("equipment_vk", { precision: 12, scale: 2 }).default("0"),
  externalVk: decimal("external_vk", { precision: 12, scale: 2 }).default("0"),
  otherVk: decimal("other_vk", { precision: 12, scale: 2 }).default("0"),
  copperVk: decimal("copper_vk", { precision: 12, scale: 2 }).default("0"),
  laborRateVk: decimal("labor_rate_vk", { precision: 7, scale: 2 }).default("0"),
  laborVk: decimal("labor_vk", { precision: 12, scale: 2 }).default("0"),
  istLaborTime: decimal("ist_labor_time", { precision: 12, scale: 2 }).default("0"),
  istMaterial: decimal("ist_material", { precision: 12, scale: 2 }).default("0"),
  istEquipment: decimal("ist_equipment", { precision: 12, scale: 2 }).default("0"),
  istExternal: decimal("ist_external", { precision: 12, scale: 2 }).default("0"),
  istOther: decimal("ist_other", { precision: 12, scale: 2 }).default("0"),
  istLabor: decimal("ist_labor", { precision: 12, scale: 2 }).default("0"),
  istTotal: decimal("ist_total", { precision: 12, scale: 2 }).default("0"),
  istQuantity: decimal("ist_quantity", { precision: 12, scale: 5 }).default("0"),
  secUnit: text("sec_unit"),
  secUnitFactor: decimal("sec_unit_factor", { precision: 10, scale: 6 }).default("0"),
  orgUnit: text("org_unit"),
  useSecUnit: boolean("use_sec_unit").default(false),
  createdDate: date("created_date"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPostCalculationItemSchema = createInsertSchema(postCalculationItems).omit({ id: true, createdAt: true });
export type InsertPostCalculationItem = z.infer<typeof insertPostCalculationItemSchema>;
export type PostCalculationItem = typeof postCalculationItems.$inferSelect;

export const fibuAdd = pgTable("fibu_add", {
  id: serial("id").primaryKey(),
  reId: integer("re_id").notNull(),
  idx: integer("idx").notNull().default(0),
  rnr: text("rnr"),
  adrNr: text("adr_nr"),
  typ: integer("typ").default(0),
  kostenart: integer("kostenart").default(0),
  zusatz1: text("zusatz_1"),
  zusatz2: text("zusatz_2"),
  zusatz3: text("zusatz_3"),
  datum1: date("datum_1"),
  datum2: date("datum_2"),
  betrag1: decimal("betrag_1", { precision: 12, scale: 2 }),
  betrag2: decimal("betrag_2", { precision: 12, scale: 2 }),
  menge1: decimal("menge_1", { precision: 12, scale: 5 }),
  menge2: decimal("menge_2", { precision: 12, scale: 5 }),
  flag1: integer("flag_1").default(0),
  flag2: integer("flag_2").default(0),
  memo1: text("memo_1"),
  memo2: text("memo_2"),
  createdDate: date("created_date"),
  changedBy: text("changed_by"),
  changedAt: decimal("changed_at", { precision: 12, scale: 6 }),
});

export const insertFibuAddSchema = createInsertSchema(fibuAdd).omit({ id: true });
export type InsertFibuAdd = z.infer<typeof insertFibuAddSchema>;
export type FibuAdd = typeof fibuAdd.$inferSelect;

export const dtaPayments = pgTable("dta_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").default(0),
  idx: integer("idx").default(0),
  code: integer("code").default(0),
  lfdNr: text("lfd_nr"),
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  invoiceNumber: text("invoice_number"),
  receiptDate: date("receipt_date"),
  addressNr: text("address_nr"),
  companyTitle: text("company_title"),
  recipientName: text("recipient_name"),
  debitAccount: integer("debit_account").default(0),
  creditAccount: integer("credit_account").default(0),
  amount: decimal("amount", { precision: 12, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  subject: text("subject"),
  subject2: text("subject2"),
  insertDate: date("insert_date"),
  period: text("period"),
  textKey: text("text_key"),
  flags: text("flags"),
  debitCredit: text("debit_credit"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDtaPaymentSchema = createInsertSchema(dtaPayments).omit({ id: true, createdAt: true });
export type InsertDtaPayment = z.infer<typeof insertDtaPaymentSchema>;
export type DtaPayment = typeof dtaPayments.$inferSelect;

export const paymentOrderStatusEnum = ["entwurf", "freigegeben", "uebermittelt", "ausgefuehrt", "fehlgeschlagen"] as const;
export type PaymentOrderStatus = typeof paymentOrderStatusEnum[number];

export const paymentOrderStatusLabels: Record<string, string> = {
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
  uebermittelt: "Übermittelt",
  ausgefuehrt: "Ausgeführt",
  fehlgeschlagen: "Fehlgeschlagen",
};

export const bankPaymentOrders = pgTable("bank_payment_orders", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientIban: text("recipient_iban").notNull(),
  recipientBic: text("recipient_bic"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  reference: text("reference").notNull(),
  status: text("status").notNull().default("entwurf"),
  externalRef: text("external_ref"),
  errorMessage: text("error_message"),
  approvedAt: timestamp("approved_at"),
  submittedAt: timestamp("submitted_at"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBankPaymentOrderSchema = createInsertSchema(bankPaymentOrders).omit({ id: true, createdAt: true, approvedAt: true, submittedAt: true, executedAt: true });
export type InsertBankPaymentOrder = z.infer<typeof insertBankPaymentOrderSchema>;
export type BankPaymentOrder = typeof bankPaymentOrders.$inferSelect;

export const bankPaymentMatches = pgTable("bank_payment_matches", {
  id: serial("id").primaryKey(),
  transactionReId: integer("transaction_re_id").notNull(),
  documentId: integer("document_id").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  matchType: text("match_type").notNull().default("manual"),
  matchedAt: timestamp("matched_at").defaultNow(),
});

export const insertBankPaymentMatchSchema = createInsertSchema(bankPaymentMatches).omit({ id: true, matchedAt: true });
export type InsertBankPaymentMatch = z.infer<typeof insertBankPaymentMatchSchema>;
export type BankPaymentMatch = typeof bankPaymentMatches.$inferSelect;

export function validateIban(iban: string): { valid: boolean; error?: string } {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) {
    return { valid: false, error: "IBAN muss zwischen 15 und 34 Zeichen lang sein" };
  }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleaned)) {
    return { valid: false, error: "Ungültiges IBAN-Format" };
  }
  const countryLengths: Record<string, number> = {
    DE: 22, AT: 20, CH: 21, FR: 27, IT: 27, ES: 24, NL: 18, BE: 16, LU: 20,
    PL: 28, CZ: 24, GB: 22, IE: 22, DK: 18, SE: 24, NO: 15, FI: 18, PT: 25,
  };
  const country = cleaned.substring(0, 2);
  if (countryLengths[country] && cleaned.length !== countryLengths[country]) {
    return { valid: false, error: `IBAN für ${country} muss ${countryLengths[country]} Zeichen lang sein` };
  }
  const rearranged = cleaned.substring(4) + cleaned.substring(0, 4);
  let numStr = "";
  for (const ch of rearranged) {
    if (ch >= "A" && ch <= "Z") {
      numStr += (ch.charCodeAt(0) - 55).toString();
    } else {
      numStr += ch;
    }
  }
  let remainder = 0;
  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numStr[i])) % 97;
  }
  if (remainder !== 1) {
    return { valid: false, error: "IBAN-Prüfziffer ungültig" };
  }
  return { valid: true };
}

export * from "./models/chat";
