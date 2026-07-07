import { db, pool } from "./db";
import { eq, desc, like, ilike, or, and, sql, asc, gte, lte, inArray } from "drizzle-orm";
import { isHapakTextArtifactLine } from "@shared/document-engine/hapak-text-artifacts";
import {
  users, customers, contactPersons, projects, documents, documentItems, materials, laborRates, textTemplates, companySettings,
  incomingInvoices, documentAttachments, timeEntries, hourlyRateCalculations, resourcePlans, orderDispositions,
  calculationSheets, dunningEntries, postCalculations, bwaReports, bankAccounts, trades, units,
  cashBookEntries, phrases, followUps, mailLog, customerHistory,
  contracts, constructionDiary, employees, appointments, serialNumbers,
  services, jumboPackages, ledgerEntries, inventoryMovements, purchaseOrders,
  measurements, formTemplates, listTemplates, documentNumberFormats,
  accounts, taxRates,
  bankCachedBalances, bankCachedTransactions,
  bankPaymentOrders, bankPaymentMatches,
  numberFormatGroups, formatDocumentNumberFromPattern, parseHapakNumber,
  type User, type InsertUser,
  type Customer, type InsertCustomer,
  type ContactPerson, type InsertContactPerson,
  type Project, type InsertProject,
  type Document, type InsertDocument,
  type DocumentItem, type InsertDocumentItem,
  type Material, type InsertMaterial,
  type LaborRate, type InsertLaborRate,
  type TextTemplate, type InsertTextTemplate,
  type CompanySettings, type InsertCompanySettings,
  type IncomingInvoice, type InsertIncomingInvoice,
  type DocumentAttachment, type InsertDocumentAttachment,
  type TimeEntry, type InsertTimeEntry,
  type HourlyRateCalc, type InsertHourlyRateCalc,
  type ResourcePlan, type InsertResourcePlan,
  type OrderDisposition, type InsertOrderDisposition,
  type CalcSheet, type InsertCalcSheet,
  type Dunning, type InsertDunning,
  type PostCalc, type InsertPostCalc,
  type BwaReport, type InsertBwaReport,
  type UnitType, type InsertUnit,
  type BankAccount, type InsertBankAccount,
  type Trade, type InsertTrade,
  type CashBookEntry, type InsertCashBookEntry,
  type Phrase, type InsertPhrase,
  type FollowUp, type InsertFollowUp,
  type MailLogEntry, type InsertMailLog,
  type CustomerHistoryEntry, type InsertCustomerHistory,
  type Contract, type InsertContract,
  type ConstructionDiaryEntry, type InsertConstructionDiary,
  type Employee, type InsertEmployee,
  type Appointment, type InsertAppointment,
  type SerialNumber, type InsertSerialNumber,
  type Service, type InsertService,
  type JumboPackage, type InsertJumboPackage,
  type LedgerEntry, type InsertLedgerEntry,
  type InventoryMovement, type InsertInventoryMovement,
  type PurchaseOrder, type InsertPurchaseOrder,
  type Measurement, type InsertMeasurement,
  type FormTemplate, type InsertFormTemplate,
  type ListTemplate, type InsertListTemplate,
  type DocumentNumberFormat, type InsertDocumentNumberFormat,
  type Account, type InsertAccount,
  type TaxRate, type InsertTaxRate,
  type BankCachedBalance, type InsertBankCachedBalance,
  type BankCachedTransaction, type InsertBankCachedTransaction,
  type BankPaymentOrder, type InsertBankPaymentOrder,
  type BankPaymentMatch, type InsertBankPaymentMatch,
} from "@shared/schema";

const FIBU_OPEN_AMOUNT_SQL = "GREATEST(COALESCE(f.offen::numeric, 0), 0)";

function visibleWorkDocumentCondition() {
  return sql`NOT (
    ${documents.importSource} = 'hapak'
    AND ${documents.type} = 'freies_dokument'
    AND COALESCE(${documents.netTotal}, 0) = 0
    AND COALESCE(${documents.grossTotal}, 0) = 0
    AND NOT EXISTS (SELECT 1 FROM document_items di WHERE di.document_id = ${documents.id})
    AND (
      EXISTS (
        SELECT 1
        FROM project_document_tree parent_node
        JOIN project_document_tree child_node ON child_node.parent_id = parent_node.id
        WHERE parent_node.document_id = ${documents.id}
      )
      OR EXISTS (
        SELECT 1
        FROM documents child_doc
        WHERE child_doc.parent_document_id = ${documents.id}
      )
    )
  )`;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  getUsers(): Promise<User[]>;

  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;
  searchCustomers(query: string, contactType?: string): Promise<Customer[]>;
  getCustomersByType(contactType: string): Promise<Customer[]>;
  convertToKunde(id: number): Promise<Customer>;

  getContactPersons(customerId: number): Promise<ContactPerson[]>;
  createContactPerson(person: InsertContactPerson): Promise<ContactPerson>;
  updateContactPerson(id: number, person: Partial<InsertContactPerson>): Promise<ContactPerson>;
  deleteContactPerson(id: number): Promise<void>;

  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectsByCustomer(customerId: number): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: number, deleteDocuments: boolean): Promise<{ deletedDocuments: number }>;
  getNextProjectNumber(): Promise<string>;

  getDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentsByProject(projectId: number): Promise<Document[]>;
  getDocumentsByCustomer(customerId: number): Promise<Document[]>;
  getDocumentsByType(type: string): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, document: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;
  getNextDocumentNumber(type: string): Promise<string>;

  getDocumentItems(documentId: number): Promise<DocumentItem[]>;
  createDocumentItem(item: InsertDocumentItem): Promise<DocumentItem>;
  updateDocumentItem(id: number, item: Partial<InsertDocumentItem>): Promise<DocumentItem>;
  deleteDocumentItem(id: number): Promise<void>;

  getMaterials(limit?: number): Promise<Material[]>;
  getMaterialsPaginated(page: number, limit: number, search?: string, category?: string): Promise<{ data: Material[]; total: number }>;
  getMaterial(id: number): Promise<Material | undefined>;
  createMaterial(material: InsertMaterial): Promise<Material>;
  updateMaterial(id: number, material: Partial<InsertMaterial>): Promise<Material>;
  searchMaterials(query: string): Promise<Material[]>;

  getLaborRates(): Promise<LaborRate[]>;
  createLaborRate(rate: InsertLaborRate): Promise<LaborRate>;
  updateLaborRate(id: number, rate: Partial<InsertLaborRate>): Promise<LaborRate>;
  deleteLaborRate(id: number): Promise<void>;

  getTextTemplates(): Promise<TextTemplate[]>;
  createTextTemplate(template: InsertTextTemplate): Promise<TextTemplate>;
  updateTextTemplate(id: number, template: Partial<InsertTextTemplate>): Promise<TextTemplate>;
  deleteTextTemplate(id: number): Promise<void>;

  getCompanySettings(): Promise<CompanySettings | undefined>;
  upsertCompanySettings(settings: InsertCompanySettings): Promise<CompanySettings>;

  getIncomingInvoices(): Promise<IncomingInvoice[]>;
  getIncomingInvoice(id: number): Promise<IncomingInvoice | undefined>;
  getIncomingInvoicesByProject(projectId: number): Promise<IncomingInvoice[]>;
  createIncomingInvoice(inv: InsertIncomingInvoice): Promise<IncomingInvoice>;
  updateIncomingInvoice(id: number, inv: Partial<InsertIncomingInvoice>): Promise<IncomingInvoice>;
  deleteIncomingInvoice(id: number): Promise<void>;
  getDocumentAttachments(filters: {
    targetType?: string;
    targetId?: number;
    fibuReId?: number;
    incomingInvoiceId?: number;
    documentId?: number;
    projectId?: number;
  }): Promise<DocumentAttachment[]>;
  createDocumentAttachment(attachment: InsertDocumentAttachment): Promise<DocumentAttachment>;

  getTimeEntries(filters?: { employeeId?: number; projectId?: number; week?: number; month?: number; year?: number }): Promise<TimeEntry[]>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: number, entry: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: number): Promise<void>;

  getHourlyRateCalcs(): Promise<HourlyRateCalc[]>;
  getHourlyRateCalc(id: number): Promise<HourlyRateCalc | undefined>;
  createHourlyRateCalc(calc: InsertHourlyRateCalc): Promise<HourlyRateCalc>;
  updateHourlyRateCalc(id: number, calc: Partial<InsertHourlyRateCalc>): Promise<HourlyRateCalc>;
  deleteHourlyRateCalc(id: number): Promise<void>;

  getResourcePlans(): Promise<ResourcePlan[]>;
  getResourcePlansByProject(projectId: number): Promise<ResourcePlan[]>;
  createResourcePlan(plan: InsertResourcePlan): Promise<ResourcePlan>;
  updateResourcePlan(id: number, plan: Partial<InsertResourcePlan>): Promise<ResourcePlan>;
  deleteResourcePlan(id: number): Promise<void>;

  getOrderDispositions(): Promise<OrderDisposition[]>;
  createOrderDisposition(disp: InsertOrderDisposition): Promise<OrderDisposition>;
  updateOrderDisposition(id: number, disp: Partial<InsertOrderDisposition>): Promise<OrderDisposition>;
  deleteOrderDisposition(id: number): Promise<void>;

  getCalcSheets(): Promise<CalcSheet[]>;
  getCalcSheet(id: number): Promise<CalcSheet | undefined>;
  createCalcSheet(sheet: InsertCalcSheet): Promise<CalcSheet>;
  updateCalcSheet(id: number, sheet: Partial<InsertCalcSheet>): Promise<CalcSheet>;
  deleteCalcSheet(id: number): Promise<void>;

  getDunningEntries(documentId: number): Promise<Dunning[]>;
  createDunning(entry: InsertDunning): Promise<Dunning>;
  updateDunning(id: number, entry: Partial<InsertDunning>): Promise<Dunning>;

  getPostCalculations(projectId: number): Promise<PostCalc[]>;
  createPostCalc(calc: InsertPostCalc): Promise<PostCalc>;
  updatePostCalc(id: number, calc: Partial<InsertPostCalc>): Promise<PostCalc>;

  getBwaReports(): Promise<BwaReport[]>;
  getBwaReport(id: number): Promise<BwaReport | undefined>;
  getBwaReportByYearMonth(year: number, month: number): Promise<BwaReport | undefined>;
  createBwaReport(report: InsertBwaReport): Promise<BwaReport>;
  updateBwaReport(id: number, report: Partial<InsertBwaReport>): Promise<BwaReport>;
  deleteBwaReport(id: number): Promise<void>;

  getDocumentNumberFormats(): Promise<DocumentNumberFormat[]>;
  getDocumentNumberFormat(documentType: string): Promise<DocumentNumberFormat | undefined>;
  updateDocumentNumberFormat(documentType: string, formatPattern: string): Promise<DocumentNumberFormat>;

  getTrades(): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  updateTrade(id: number, trade: Partial<InsertTrade>): Promise<Trade>;
  deleteTrade(id: number): Promise<void>;

  getBankAccounts(): Promise<BankAccount[]>;
  getBankAccount(id: number): Promise<BankAccount | undefined>;
  createBankAccount(account: InsertBankAccount): Promise<BankAccount>;
  updateBankAccount(id: number, account: Partial<InsertBankAccount>): Promise<BankAccount>;
  deleteBankAccount(id: number): Promise<void>;

  getBankCachedBalance(bankAccountId: number): Promise<BankCachedBalance | undefined>;
  upsertBankCachedBalance(data: InsertBankCachedBalance): Promise<BankCachedBalance>;

  getBankCachedTransactions(bankAccountId: number, filters?: { fromDate?: string; toDate?: string; search?: string; minAmount?: number; maxAmount?: number }): Promise<BankCachedTransaction[]>;
  createBankCachedTransaction(data: InsertBankCachedTransaction): Promise<BankCachedTransaction>;
  bulkCreateBankCachedTransactions(data: InsertBankCachedTransaction[]): Promise<BankCachedTransaction[]>;
  clearBankCachedTransactions(bankAccountId: number): Promise<void>;

  getUnits(): Promise<UnitType[]>;
  createUnit(unit: InsertUnit): Promise<UnitType>;
  updateUnit(id: number, unit: Partial<InsertUnit>): Promise<UnitType>;
  deleteUnit(id: number): Promise<void>;

  getCashBookEntries(filters?: { month?: number; year?: number; cashAccount?: string }): Promise<CashBookEntry[]>;
  getCashBookEntry(id: number): Promise<CashBookEntry | undefined>;
  createCashBookEntry(entry: InsertCashBookEntry): Promise<CashBookEntry>;
  updateCashBookEntry(id: number, entry: Partial<InsertCashBookEntry>): Promise<CashBookEntry>;
  deleteCashBookEntry(id: number): Promise<void>;
  getNextCashBookNumber(year: number): Promise<string>;

  getPhrases(): Promise<Phrase[]>;
  getPhrase(id: number): Promise<Phrase | undefined>;
  createPhrase(phrase: InsertPhrase): Promise<Phrase>;
  updatePhrase(id: number, phrase: Partial<InsertPhrase>): Promise<Phrase>;
  deletePhrase(id: number): Promise<void>;
  getNextPhraseNumber(): Promise<string>;

  getFollowUps(filters?: { status?: string }): Promise<FollowUp[]>;
  getFollowUp(id: number): Promise<FollowUp | undefined>;
  createFollowUp(followUp: InsertFollowUp): Promise<FollowUp>;
  updateFollowUp(id: number, followUp: Partial<InsertFollowUp>): Promise<FollowUp>;
  deleteFollowUp(id: number): Promise<void>;

  getMailLogEntries(filters?: { direction?: string }): Promise<MailLogEntry[]>;
  getMailLogEntry(id: number): Promise<MailLogEntry | undefined>;
  createMailLogEntry(entry: InsertMailLog): Promise<MailLogEntry>;
  updateMailLogEntry(id: number, entry: Partial<InsertMailLog>): Promise<MailLogEntry>;
  deleteMailLogEntry(id: number): Promise<void>;

  getCustomerHistoryEntries(customerId: number): Promise<CustomerHistoryEntry[]>;
  createCustomerHistoryEntry(entry: InsertCustomerHistory): Promise<CustomerHistoryEntry>;
  updateCustomerHistoryEntry(id: number, entry: Partial<InsertCustomerHistory>): Promise<CustomerHistoryEntry>;
  deleteCustomerHistoryEntry(id: number): Promise<void>;

  getContracts(): Promise<Contract[]>;
  getContract(id: number): Promise<Contract | undefined>;
  createContract(c: InsertContract): Promise<Contract>;
  updateContract(id: number, c: Partial<InsertContract>): Promise<Contract>;
  deleteContract(id: number): Promise<void>;

  getConstructionDiaryEntries(projectNumber?: string): Promise<ConstructionDiaryEntry[]>;
  createConstructionDiaryEntry(e: InsertConstructionDiary): Promise<ConstructionDiaryEntry>;
  updateConstructionDiaryEntry(id: number, e: Partial<InsertConstructionDiary>): Promise<ConstructionDiaryEntry>;
  deleteConstructionDiaryEntry(id: number): Promise<void>;

  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  createEmployee(e: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, e: Partial<InsertEmployee>): Promise<Employee>;
  deleteEmployee(id: number): Promise<void>;

  getAppointments(filters?: { date?: string; employeeId?: number }): Promise<Appointment[]>;
  createAppointment(a: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, a: Partial<InsertAppointment>): Promise<Appointment>;
  deleteAppointment(id: number): Promise<void>;

  getSerialNumbers(): Promise<SerialNumber[]>;
  createSerialNumber(s: InsertSerialNumber): Promise<SerialNumber>;
  updateSerialNumber(id: number, s: Partial<InsertSerialNumber>): Promise<SerialNumber>;
  deleteSerialNumber(id: number): Promise<void>;

  getServices(): Promise<Service[]>;
  createService(s: InsertService): Promise<Service>;
  updateService(id: number, s: Partial<InsertService>): Promise<Service>;
  deleteService(id: number): Promise<void>;

  getJumboPackages(): Promise<JumboPackage[]>;
  createJumboPackage(j: InsertJumboPackage): Promise<JumboPackage>;
  updateJumboPackage(id: number, j: Partial<InsertJumboPackage>): Promise<JumboPackage>;
  deleteJumboPackage(id: number): Promise<void>;

  getLedgerEntries(filters?: { period?: string; bookingType?: string; limit?: number; offset?: number }): Promise<{ entries: LedgerEntry[]; total: number }>;
  createLedgerEntry(e: InsertLedgerEntry): Promise<LedgerEntry>;
  updateLedgerEntry(id: number, e: Partial<InsertLedgerEntry>): Promise<LedgerEntry>;
  deleteLedgerEntry(id: number): Promise<void>;

  getInventoryMovements(): Promise<InventoryMovement[]>;
  createInventoryMovement(m: InsertInventoryMovement): Promise<InventoryMovement>;

  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  createPurchaseOrder(o: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: number, o: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder>;
  deletePurchaseOrder(id: number): Promise<void>;

  getMeasurements(projectNumber?: string): Promise<Measurement[]>;
  createMeasurement(m: InsertMeasurement): Promise<Measurement>;
  updateMeasurement(id: number, m: Partial<InsertMeasurement>): Promise<Measurement>;
  deleteMeasurement(id: number): Promise<void>;

  getFormTemplates(): Promise<FormTemplate[]>;
  getFormTemplate(id: number): Promise<FormTemplate | undefined>;
  createFormTemplate(t: InsertFormTemplate): Promise<FormTemplate>;
  updateFormTemplate(id: number, t: Partial<InsertFormTemplate>): Promise<FormTemplate>;
  deleteFormTemplate(id: number): Promise<void>;

  getListTemplates(): Promise<ListTemplate[]>;
  createListTemplate(t: InsertListTemplate): Promise<ListTemplate>;
  updateListTemplate(id: number, t: Partial<InsertListTemplate>): Promise<ListTemplate>;
  deleteListTemplate(id: number): Promise<void>;

  getPaymentOrders(): Promise<BankPaymentOrder[]>;
  getPaymentOrder(id: number): Promise<BankPaymentOrder | undefined>;
  createPaymentOrder(order: InsertBankPaymentOrder): Promise<BankPaymentOrder>;
  updatePaymentOrder(id: number, order: Partial<InsertBankPaymentOrder>): Promise<BankPaymentOrder>;
  deletePaymentOrder(id: number): Promise<void>;

  getPaymentMatches(): Promise<BankPaymentMatch[]>;
  createPaymentMatch(match: InsertBankPaymentMatch): Promise<BankPaymentMatch>;
  deletePaymentMatch(id: number): Promise<void>;

  getDashboardStats(): Promise<{
    totalCustomers: number;
    activeProjects: number;
    openOffers: number;
    openInvoices: number;
    overdueInvoices: number;
    monthlyRevenue: number;
    openIncomingInvoices: number;
    openIncomingTotal: number;
    upcomingAppointments: number;
  }>;
  getRevenueByRange(from: string, to: string): Promise<{ month: string; revenue: number; count: number }[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(customers.searchKey);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [created] = await db.insert(customers).values(customer).returning();
    return created;
  }

  async updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer> {
    const [updated] = await db.update(customers).set(customer).where(eq(customers.id, id)).returning();
    return updated;
  }

  async deleteCustomer(id: number): Promise<void> {
    await db.delete(contactPersons).where(eq(contactPersons.customerId, id));
    await db.delete(customers).where(eq(customers.id, id));
  }

  async searchCustomers(query: string, contactType?: string): Promise<Customer[]> {
    const pattern = `%${query}%`;
    const searchCondition = or(
      like(customers.name, pattern),
      like(customers.searchKey, pattern),
      like(customers.customerNumber, pattern),
      like(customers.city, pattern)
    );
    if (contactType) {
      return db.select().from(customers).where(and(searchCondition, eq(customers.contactType, contactType))).limit(50);
    }
    return db.select().from(customers).where(searchCondition).limit(50);
  }

  async getCustomersByType(contactType: string): Promise<Customer[]> {
    return db.select().from(customers).where(eq(customers.contactType, contactType)).orderBy(asc(customers.searchKey));
  }

  async convertToKunde(id: number): Promise<Customer> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    if (!customer) throw new Error("Adresse nicht gefunden");
    if (customer.contactType !== "interessent") throw new Error("Nur Interessenten können umgewandelt werden");
    const maxResult = await db.execute(sql`SELECT GREATEST(COALESCE(MAX(CAST(customer_number AS INTEGER)), 9999), 9999) + 1 as next_num FROM customers WHERE contact_type = 'kunde' AND customer_number ~ '^[0-9]+$'`);
    const nextNum = String((maxResult as any).rows?.[0]?.next_num || 10000);
    const [updated] = await db.update(customers).set({ contactType: "kunde", customerNumber: nextNum }).where(eq(customers.id, id)).returning();
    return updated;
  }

  async getContactPersons(customerId: number): Promise<ContactPerson[]> {
    return db.select().from(contactPersons).where(eq(contactPersons.customerId, customerId)).orderBy(desc(contactPersons.isPrimary));
  }

  async createContactPerson(person: InsertContactPerson): Promise<ContactPerson> {
    const [created] = await db.insert(contactPersons).values(person).returning();
    return created;
  }

  async updateContactPerson(id: number, person: Partial<InsertContactPerson>): Promise<ContactPerson> {
    const [updated] = await db.update(contactPersons).set(person).where(eq(contactPersons.id, id)).returning();
    return updated;
  }

  async deleteContactPerson(id: number): Promise<void> {
    await db.delete(contactPersons).where(eq(contactPersons.id, id));
  }

  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectsByCustomer(customerId: number): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.customerId, customerId));
  }

  async getNextProjectNumber(): Promise<string> {
    const year2 = (new Date().getFullYear() % 100).toString().padStart(2, "0");
    const allProjects = await db.select({ projectNumber: projects.projectNumber }).from(projects);
    let maxSeq = 0;
    for (const p of allProjects) {
      if (!p.projectNumber) continue;
      const hapak = p.projectNumber.match(/^PZZ(\d{2})(\d+)$/);
      if (hapak && hapak[1] === year2) {
        const seq = parseInt(hapak[2]) || 0;
        if (seq > maxSeq) maxSeq = seq;
        continue;
      }
      const formatted = p.projectNumber.match(/^(\d{2})-(\d+)$/);
      if (formatted && formatted[1] === year2) {
        const seq = parseInt(formatted[2]) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
      const legacy = p.projectNumber.match(/^P-(\d{4})-(\d+)$/);
      if (legacy && legacy[1].slice(-2) === year2) {
        const seq = parseInt(legacy[2]) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    const nextSeq = maxSeq + 1;
    return `${year2}-${nextSeq.toString().padStart(4, "0")}`;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: number, project: Partial<InsertProject>): Promise<Project> {
    const [updated] = await db.update(projects).set(project).where(eq(projects.id, id)).returning();
    return updated;
  }

  async deleteProject(id: number, deleteDocuments: boolean): Promise<{ deletedDocuments: number }> {
    let deletedDocuments = 0;
    if (deleteDocuments) {
      const docs = await db.select({ id: documents.id }).from(documents).where(eq(documents.projectId, id));
      for (const doc of docs) {
        await db.delete(documentItems).where(eq(documentItems.documentId, doc.id));
      }
      const result = await db.delete(documents).where(eq(documents.projectId, id)).returning();
      deletedDocuments = result.length;
    } else {
      await db.update(documents).set({ projectId: null }).where(eq(documents.projectId, id));
    }
    await pool.query(`DELETE FROM project_document_tree WHERE project_id = $1`, [id]);
    await db.delete(projects).where(eq(projects.id, id));
    return { deletedDocuments };
  }

  async getDocuments(): Promise<Document[]> {
    return db.select().from(documents).where(visibleWorkDocumentCondition()).orderBy(desc(documents.createdAt));
  }

  async getDocumentsPaginated(page: number, limit: number, search?: string, type?: string, types?: string[], excludeType?: string): Promise<{ data: Document[]; total: number }> {
    const conditions = [visibleWorkDocumentCondition()];
    if (types && types.length > 0) {
      conditions.push(inArray(documents.type, types));
    } else if (type && type !== "all") {
      conditions.push(eq(documents.type, type));
    }
    if (excludeType) {
      conditions.push(sql`${documents.type} != ${excludeType}`);
    }
    if (search) {
      const pattern = `%${search}%`;
      const searchConditions = [
        ilike(documents.documentNumber, pattern),
        ilike(documents.subject, pattern),
      ];
      const noDash = search.replace(/-/g, "");
      if (noDash !== search) {
        searchConditions.push(ilike(documents.documentNumber, `%${noDash}%`));
      }
      const noLetters = search.replace(/^[A-Za-z]+/, "");
      if (noLetters !== search && noLetters.length >= 3) {
        searchConditions.push(ilike(documents.documentNumber, `%${noLetters}%`));
      }
      const yyMatch = search.match(/^(\d{2})-(\d{4,6})$/);
      if (yyMatch) {
        const padded = yyMatch[2].padStart(6, "0");
        searchConditions.push(ilike(documents.documentNumber, `%${yyMatch[1]}${padded}%`));
      }
      conditions.push(or(...searchConditions)!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(documents).where(where);
    const total = countResult?.count ?? 0;
    const data = await db.select().from(documents).where(where).orderBy(desc(documents.date), desc(documents.id)).limit(limit).offset((page - 1) * limit);
    return { data, total };
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }

  async getDocumentsByProject(projectId: number): Promise<Document[]> {
    return db.select().from(documents).where(and(eq(documents.projectId, projectId), visibleWorkDocumentCondition())).orderBy(desc(documents.date));
  }

  async getDocumentsByCustomer(customerId: number): Promise<Document[]> {
    return db.select().from(documents).where(and(eq(documents.customerId, customerId), visibleWorkDocumentCondition())).orderBy(desc(documents.date));
  }

  async getDocumentsByType(type: string): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.type, type)).orderBy(desc(documents.date));
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(document).returning();
    return created;
  }

  async updateDocument(id: number, document: Partial<InsertDocument>): Promise<Document> {
    const [updated] = await db.update(documents).set({ ...document, updatedAt: new Date() }).where(eq(documents.id, id)).returning();
    return updated;
  }

  async deleteDocument(id: number): Promise<void> {
    await pool.query(`DELETE FROM project_document_tree WHERE document_id = $1`, [id]);
    await db.delete(documentItems).where(eq(documentItems.documentId, id));
    await db.delete(documents).where(eq(documents.id, id));
  }

  private buildPatternRegex(pattern: string): RegExp | null {
    let regex = "^";
    for (const ch of pattern) {
      if (ch === "j" || ch === "n" || ch === "m") regex += "\\d";
      else if (ch === "b") continue;
      else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    regex += "$";
    try { return new RegExp(regex); } catch { return null; }
  }

  async getNextDocumentNumber(type: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const group = numberFormatGroups[type] || type;
    const [fmt] = await db.select().from(documentNumberFormats).where(eq(documentNumberFormats.documentType, group));
    const pattern = fmt?.formatPattern || "jj-nnnnn";
    const usesMonth = pattern.includes("m");
    const typesInGroup = Object.entries(numberFormatGroups)
      .filter(([, g]) => g === group)
      .map(([t]) => t);
    const allDocs = await db.select({ documentNumber: documents.documentNumber, type: documents.type })
      .from(documents)
      .where(
        or(...typesInGroup.map(t => eq(documents.type, t)))
      );
    let maxSeq = 0;
    const yearStr2 = (year % 100).toString().padStart(2, "0");
    for (const doc of allDocs) {
      if (!doc.documentNumber) continue;
      const hapak = parseHapakNumber(doc.documentNumber);
      if (hapak) {
        if (hapak.year2 === yearStr2) {
          if (hapak.seq > maxSeq) maxSeq = hapak.seq;
        }
        continue;
      }
      const jCount = (pattern.match(/j/g) || []).length;
      const nCount = (pattern.match(/n/g) || []).length;
      const mCount = usesMonth ? (pattern.match(/m/g) || []).length : 0;
      const expectedDigitLen = jCount + nCount + mCount;
      const patternRegex = this.buildPatternRegex(pattern);
      if (patternRegex && !patternRegex.test(doc.documentNumber)) continue;
      const digits = doc.documentNumber.replace(/[^0-9]/g, "");
      if (digits.length < 3 || digits.length > expectedDigitLen + 2) continue;
      {
        const yearLen = jCount >= 4 ? 4 : 2;
        const yearPart = digits.slice(0, yearLen);
        const expectedYear = jCount >= 4 ? year.toString() : yearStr2;
        if (yearPart === expectedYear) {
          const rest = digits.slice(yearLen);
          const seqPart = usesMonth ? rest.slice(mCount) : rest;
          if (usesMonth) {
            const monthPart = rest.slice(0, mCount);
            if (monthPart !== month.toString().padStart(mCount, "0")) continue;
          }
          if (seqPart.length > nCount + 1) continue;
          const seq = parseInt(seqPart) || 0;
          if (seq > maxSeq) maxSeq = seq;
        }
      }
    }
    let nextSeq = maxSeq + 1;
    let candidate = formatDocumentNumberFromPattern(pattern, year, month, nextSeq);
    const allExisting = await db.select({ documentNumber: documents.documentNumber })
      .from(documents)
      .where(and(eq(documents.documentNumber, candidate), inArray(documents.type, typesInGroup)));
    while (allExisting.length > 0 || nextSeq <= maxSeq) {
      nextSeq++;
      candidate = formatDocumentNumberFromPattern(pattern, year, month, nextSeq);
      const check = await db.select({ documentNumber: documents.documentNumber })
        .from(documents)
        .where(and(eq(documents.documentNumber, candidate), inArray(documents.type, typesInGroup)));
      if (check.length === 0) break;
    }
    return candidate;
  }

  async getDocumentItems(documentId: number): Promise<DocumentItem[]> {
    const items = await db.select().from(documentItems).where(eq(documentItems.documentId, documentId)).orderBy(documentItems.sortOrder);
    return items.filter((item) => !(item.type === "text" && isHapakTextArtifactLine(item.title)));
  }

  async createDocumentItem(item: InsertDocumentItem): Promise<DocumentItem> {
    const [created] = await db.insert(documentItems).values(item).returning();
    return created;
  }

  async updateDocumentItem(id: number, item: Partial<InsertDocumentItem>): Promise<DocumentItem> {
    const [updated] = await db.update(documentItems).set(item).where(eq(documentItems.id, id)).returning();
    return updated;
  }

  async deleteDocumentItem(id: number): Promise<void> {
    await db.delete(documentItems).where(eq(documentItems.id, id));
  }

  async getMaterials(limit?: number): Promise<Material[]> {
    const q = db.select().from(materials).orderBy(materials.name);
    if (limit) return q.limit(limit);
    return q;
  }

  async getMaterial(id: number): Promise<Material | undefined> {
    const [material] = await db.select().from(materials).where(eq(materials.id, id));
    return material;
  }

  async createMaterial(material: InsertMaterial): Promise<Material> {
    const [created] = await db.insert(materials).values(material).returning();
    return created;
  }

  async updateMaterial(id: number, material: Partial<InsertMaterial>): Promise<Material> {
    const [updated] = await db.update(materials).set(material).where(eq(materials.id, id)).returning();
    return updated;
  }

  async getMaterialsPaginated(page: number, limit: number, search?: string, category?: string): Promise<{ data: Material[]; total: number }> {
    const conditions = [];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(like(materials.name, pattern), like(materials.searchKey, pattern), like(materials.articleNumber, pattern)));
    }
    if (category) conditions.push(eq(materials.category, category));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(materials).where(where);
    const total = countResult?.count ?? 0;
    const data = await db.select().from(materials).where(where).orderBy(materials.name).limit(limit).offset((page - 1) * limit);
    return { data, total };
  }

  async searchMaterials(query: string): Promise<Material[]> {
    const pattern = `%${query}%`;
    return db.select().from(materials).where(
      or(like(materials.name, pattern), like(materials.searchKey, pattern), like(materials.articleNumber, pattern))
    ).limit(50);
  }

  async getLaborRates(): Promise<LaborRate[]> {
    return db.select().from(laborRates);
  }

  async createLaborRate(rate: InsertLaborRate): Promise<LaborRate> {
    const [created] = await db.insert(laborRates).values(rate).returning();
    return created;
  }

  async updateLaborRate(id: number, rate: Partial<InsertLaborRate>): Promise<LaborRate> {
    const [updated] = await db.update(laborRates).set(rate).where(eq(laborRates.id, id)).returning();
    return updated;
  }

  async deleteLaborRate(id: number): Promise<void> {
    await db.delete(laborRates).where(eq(laborRates.id, id));
  }

  async getTextTemplates(): Promise<TextTemplate[]> {
    return db.select().from(textTemplates);
  }

  async createTextTemplate(template: InsertTextTemplate): Promise<TextTemplate> {
    const [created] = await db.insert(textTemplates).values(template).returning();
    return created;
  }

  async updateTextTemplate(id: number, template: Partial<InsertTextTemplate>): Promise<TextTemplate> {
    const [updated] = await db.update(textTemplates).set(template).where(eq(textTemplates.id, id)).returning();
    return updated;
  }

  async deleteTextTemplate(id: number): Promise<void> {
    await db.delete(textTemplates).where(eq(textTemplates.id, id));
  }

  async getCompanySettings(): Promise<CompanySettings | undefined> {
    const [settings] = await db.select().from(companySettings).limit(1);
    return settings;
  }

  async upsertCompanySettings(settings: InsertCompanySettings): Promise<CompanySettings> {
    const existing = await this.getCompanySettings();
    if (existing) {
      const [updated] = await db.update(companySettings).set(settings).where(eq(companySettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(companySettings).values(settings).returning();
    return created;
  }

  async getIncomingInvoices(): Promise<IncomingInvoice[]> {
    return db.select().from(incomingInvoices).orderBy(desc(incomingInvoices.date));
  }

  async getIncomingInvoice(id: number): Promise<IncomingInvoice | undefined> {
    const [inv] = await db.select().from(incomingInvoices).where(eq(incomingInvoices.id, id));
    return inv;
  }

  async getIncomingInvoicesByProject(projectId: number): Promise<IncomingInvoice[]> {
    return db.select().from(incomingInvoices).where(eq(incomingInvoices.projectId, projectId)).orderBy(desc(incomingInvoices.date));
  }

  async createIncomingInvoice(inv: InsertIncomingInvoice): Promise<IncomingInvoice> {
    const [created] = await db.insert(incomingInvoices).values(inv).returning();
    return created;
  }

  async updateIncomingInvoice(id: number, inv: Partial<InsertIncomingInvoice>): Promise<IncomingInvoice> {
    const [updated] = await db.update(incomingInvoices).set(inv).where(eq(incomingInvoices.id, id)).returning();
    return updated;
  }

  async deleteIncomingInvoice(id: number): Promise<void> {
    await db.delete(incomingInvoices).where(eq(incomingInvoices.id, id));
  }

  async getDocumentAttachments(filters: {
    targetType?: string;
    targetId?: number;
    fibuReId?: number;
    incomingInvoiceId?: number;
    documentId?: number;
    projectId?: number;
  }): Promise<DocumentAttachment[]> {
    const conditions = [eq(documentAttachments.status, "active")];
    if (filters.targetType) conditions.push(eq(documentAttachments.targetType, filters.targetType));
    if (filters.targetId) conditions.push(eq(documentAttachments.targetId, filters.targetId));
    if (filters.fibuReId) conditions.push(eq(documentAttachments.fibuReId, filters.fibuReId));
    if (filters.incomingInvoiceId) conditions.push(eq(documentAttachments.incomingInvoiceId, filters.incomingInvoiceId));
    if (filters.documentId) conditions.push(eq(documentAttachments.documentId, filters.documentId));
    if (filters.projectId) conditions.push(eq(documentAttachments.projectId, filters.projectId));
    return db.select().from(documentAttachments).where(and(...conditions)).orderBy(desc(documentAttachments.createdAt));
  }

  async createDocumentAttachment(attachment: InsertDocumentAttachment): Promise<DocumentAttachment> {
    const [created] = await db.insert(documentAttachments).values(attachment).returning();
    return created;
  }

  async getTimeEntries(filters?: { employeeId?: number; projectId?: number; week?: number; month?: number; year?: number }): Promise<TimeEntry[]> {
    let query = db.select().from(timeEntries);
    const conditions = [];
    if (filters?.employeeId) conditions.push(eq(timeEntries.employeeId, filters.employeeId));
    if (filters?.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters?.week) conditions.push(eq(timeEntries.week, filters.week));
    if (filters?.month) conditions.push(eq(timeEntries.month, filters.month));
    if (filters?.year) conditions.push(eq(timeEntries.year, filters.year));
    if (conditions.length > 0) {
      return db.select().from(timeEntries).where(and(...conditions)).orderBy(desc(timeEntries.date));
    }
    return db.select().from(timeEntries).orderBy(desc(timeEntries.date));
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const [created] = await db.insert(timeEntries).values(entry).returning();
    return created;
  }

  async updateTimeEntry(id: number, entry: Partial<InsertTimeEntry>): Promise<TimeEntry> {
    const [updated] = await db.update(timeEntries).set(entry).where(eq(timeEntries.id, id)).returning();
    return updated;
  }

  async deleteTimeEntry(id: number): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  async getHourlyRateCalcs(): Promise<HourlyRateCalc[]> {
    return db.select().from(hourlyRateCalculations).orderBy(desc(hourlyRateCalculations.createdAt));
  }

  async getHourlyRateCalc(id: number): Promise<HourlyRateCalc | undefined> {
    const [calc] = await db.select().from(hourlyRateCalculations).where(eq(hourlyRateCalculations.id, id));
    return calc;
  }

  async createHourlyRateCalc(calc: InsertHourlyRateCalc): Promise<HourlyRateCalc> {
    const [created] = await db.insert(hourlyRateCalculations).values(calc).returning();
    return created;
  }

  async updateHourlyRateCalc(id: number, calc: Partial<InsertHourlyRateCalc>): Promise<HourlyRateCalc> {
    const [updated] = await db.update(hourlyRateCalculations).set(calc).where(eq(hourlyRateCalculations.id, id)).returning();
    return updated;
  }

  async deleteHourlyRateCalc(id: number): Promise<void> {
    await db.delete(hourlyRateCalculations).where(eq(hourlyRateCalculations.id, id));
  }

  async getResourcePlans(): Promise<ResourcePlan[]> {
    return db.select().from(resourcePlans).orderBy(resourcePlans.startDate);
  }

  async getResourcePlansByProject(projectId: number): Promise<ResourcePlan[]> {
    return db.select().from(resourcePlans).where(eq(resourcePlans.projectId, projectId));
  }

  async createResourcePlan(plan: InsertResourcePlan): Promise<ResourcePlan> {
    const [created] = await db.insert(resourcePlans).values(plan).returning();
    return created;
  }

  async updateResourcePlan(id: number, plan: Partial<InsertResourcePlan>): Promise<ResourcePlan> {
    const [updated] = await db.update(resourcePlans).set(plan).where(eq(resourcePlans.id, id)).returning();
    return updated;
  }

  async deleteResourcePlan(id: number): Promise<void> {
    await db.delete(resourcePlans).where(eq(resourcePlans.id, id));
  }

  async getOrderDispositions(): Promise<OrderDisposition[]> {
    return db.select().from(orderDispositions).orderBy(orderDispositions.priority);
  }

  async createOrderDisposition(disp: InsertOrderDisposition): Promise<OrderDisposition> {
    const [created] = await db.insert(orderDispositions).values(disp).returning();
    return created;
  }

  async updateOrderDisposition(id: number, disp: Partial<InsertOrderDisposition>): Promise<OrderDisposition> {
    const [updated] = await db.update(orderDispositions).set(disp).where(eq(orderDispositions.id, id)).returning();
    return updated;
  }

  async deleteOrderDisposition(id: number): Promise<void> {
    await db.delete(orderDispositions).where(eq(orderDispositions.id, id));
  }

  async getCalcSheets(): Promise<CalcSheet[]> {
    return db.select().from(calculationSheets).orderBy(desc(calculationSheets.updatedAt));
  }

  async getCalcSheet(id: number): Promise<CalcSheet | undefined> {
    const [sheet] = await db.select().from(calculationSheets).where(eq(calculationSheets.id, id));
    return sheet;
  }

  async createCalcSheet(sheet: InsertCalcSheet): Promise<CalcSheet> {
    const [created] = await db.insert(calculationSheets).values(sheet).returning();
    return created;
  }

  async updateCalcSheet(id: number, sheet: Partial<InsertCalcSheet>): Promise<CalcSheet> {
    const [updated] = await db.update(calculationSheets).set({ ...sheet, updatedAt: new Date() }).where(eq(calculationSheets.id, id)).returning();
    return updated;
  }

  async deleteCalcSheet(id: number): Promise<void> {
    await db.delete(calculationSheets).where(eq(calculationSheets.id, id));
  }

  async getDunningEntries(documentId: number): Promise<Dunning[]> {
    return db.select().from(dunningEntries).where(eq(dunningEntries.documentId, documentId)).orderBy(dunningEntries.level);
  }

  async createDunning(entry: InsertDunning): Promise<Dunning> {
    const [created] = await db.insert(dunningEntries).values(entry).returning();
    return created;
  }

  async updateDunning(id: number, entry: Partial<InsertDunning>): Promise<Dunning> {
    const [updated] = await db.update(dunningEntries).set(entry).where(eq(dunningEntries.id, id)).returning();
    return updated;
  }

  async getPostCalculations(projectId: number): Promise<PostCalc[]> {
    return db.select().from(postCalculations).where(eq(postCalculations.projectId, projectId));
  }

  async createPostCalc(calc: InsertPostCalc): Promise<PostCalc> {
    const [created] = await db.insert(postCalculations).values(calc).returning();
    return created;
  }

  async updatePostCalc(id: number, calc: Partial<InsertPostCalc>): Promise<PostCalc> {
    const [updated] = await db.update(postCalculations).set(calc).where(eq(postCalculations.id, id)).returning();
    return updated;
  }

  async getDashboardStats() {
    const [custCount] = await db.select({ count: sql<number>`count(*)::int` }).from(customers);
    const [projCount] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.status, "aktiv"));
    const [offerCount] = await db.select({ count: sql<number>`count(*)::int` }).from(documents).where(
      and(eq(documents.type, "angebot"), eq(documents.status, "gesendet"))
    );
    const today = new Date().toISOString().split("T")[0];
    const openInvoiceResult = await pool.query(`
      SELECT
        COUNT(*) as open_count,
        SUM(CASE WHEN due_date < $1::date THEN 1 ELSE 0 END) as overdue_count,
        COALESCE(SUM(open_amount), 0)::float as total_open
      FROM (
        SELECT d.id,
          ${FIBU_OPEN_AMOUNT_SQL} as open_amount,
          COALESCE(f.faelligdat::date, d.date::date + COALESCE(d.payment_term_days, 14)) as due_date
        FROM fibu_buchungen f
        INNER JOIN documents d ON d.id = f.document_id
        WHERE d.type IN ('rechnung','abschlagsrechnung')
          AND f.art = 'RA' AND f.idx = 0
          AND f.stornoflag != 2 AND f.bezahlflag != 2
          AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01
      ) open_inv
    `, [today]);
    const openInvRow = openInvoiceResult.rows[0];
    const invoiceCount = { count: parseInt(openInvRow.open_count || "0") };
    const overdueCount = { count: parseInt(openInvRow.overdue_count || "0") };
    const currentMonth = new Date();
    const firstOfMonth = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const revResult = await pool.query(`
      SELECT COALESCE(SUM(netto), 0)::float as total FROM (
        SELECT f.netto::numeric as netto
        FROM fibu_buchungen f
        WHERE f.art = 'RA' AND f.idx = 0 AND f.stornoflag != 2
          AND f.belegdat >= $1
      ) combined
    `, [firstOfMonth]);
    const revenue = revResult.rows[0];

    const erResult = await pool.query(`
      SELECT COUNT(*)::int as cnt, COALESCE(SUM(open_amt), 0)::float as total FROM (
        SELECT ${FIBU_OPEN_AMOUNT_SQL} as open_amt
        FROM fibu_buchungen f
        WHERE f.art = 'RE' AND f.idx = 0 AND f.stornoflag != 2 AND f.bezahlflag != 2
          AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01
        UNION ALL
        SELECT (ii.gross_total::numeric - COALESCE(ii.paid_amount::numeric, 0)) as open_amt
        FROM incoming_invoices ii
        WHERE ii.status IN ('offen','teilbezahlt')
          AND (ii.gross_total::numeric - COALESCE(ii.paid_amount::numeric, 0)) > 0.01
          AND NOT EXISTS (SELECT 1 FROM fibu_buchungen f3 WHERE f3.rnr = ii.invoice_number AND f3.art = 'RE' AND f3.idx = 0)
      ) er_open
    `);
    const erRow = erResult.rows[0];

    const apptResult = await pool.query(`
      SELECT COUNT(*)::int as cnt FROM appointments
      WHERE date >= $1::date AND date <= ($1::date + interval '7 days')
    `, [today]);
    const apptCount = apptResult.rows[0]?.cnt || 0;

    return {
      totalCustomers: custCount.count,
      activeProjects: projCount.count,
      openOffers: offerCount.count,
      openInvoices: invoiceCount.count,
      overdueInvoices: overdueCount.count,
      monthlyRevenue: revenue.total,
      openIncomingInvoices: erRow.cnt,
      openIncomingTotal: erRow.total,
      upcomingAppointments: apptCount,
    };
  }

  async getRevenueByRange(from: string, to: string): Promise<{ month: string; revenue: number; count: number }[]> {
    const rows = await pool.query(`
      SELECT month, COALESCE(SUM(netto), 0)::float as revenue, COUNT(*)::int as count
      FROM (
        SELECT to_char(f.belegdat::date, 'YYYY-MM') as month, f.netto::numeric as netto
        FROM fibu_buchungen f
        WHERE f.art = 'RA' AND f.idx = 0 AND f.stornoflag != 2
          AND f.belegdat::date >= $1::date AND f.belegdat::date <= $2::date
      ) combined
      GROUP BY month ORDER BY month
    `, [from, to]);
    return rows.rows;
  }

  async getBwaReports(): Promise<BwaReport[]> {
    return db.select().from(bwaReports).orderBy(desc(bwaReports.year), desc(bwaReports.month));
  }

  async getBwaReport(id: number): Promise<BwaReport | undefined> {
    const [report] = await db.select().from(bwaReports).where(eq(bwaReports.id, id));
    return report;
  }

  async getBwaReportByYearMonth(year: number, month: number): Promise<BwaReport | undefined> {
    const [report] = await db.select().from(bwaReports).where(and(eq(bwaReports.year, year), eq(bwaReports.month, month)));
    return report;
  }

  async createBwaReport(report: InsertBwaReport): Promise<BwaReport> {
    const [created] = await db.insert(bwaReports).values(report).returning();
    return created;
  }

  async updateBwaReport(id: number, report: Partial<InsertBwaReport>): Promise<BwaReport> {
    const [updated] = await db.update(bwaReports).set(report).where(eq(bwaReports.id, id)).returning();
    return updated;
  }

  async deleteBwaReport(id: number): Promise<void> {
    await db.delete(bwaReports).where(eq(bwaReports.id, id));
  }

  async getDocumentNumberFormats(): Promise<DocumentNumberFormat[]> {
    return db.select().from(documentNumberFormats).orderBy(asc(documentNumberFormats.id));
  }

  async getDocumentNumberFormat(documentType: string): Promise<DocumentNumberFormat | undefined> {
    const [fmt] = await db.select().from(documentNumberFormats).where(eq(documentNumberFormats.documentType, documentType));
    return fmt;
  }

  async updateDocumentNumberFormat(documentType: string, formatPattern: string): Promise<DocumentNumberFormat> {
    const existing = await this.getDocumentNumberFormat(documentType);
    if (existing) {
      const [updated] = await db.update(documentNumberFormats)
        .set({ formatPattern })
        .where(eq(documentNumberFormats.documentType, documentType))
        .returning();
      return updated;
    }
    const [created] = await db.insert(documentNumberFormats)
      .values({ documentType, formatPattern })
      .returning();
    return created;
  }

  async getTrades(): Promise<Trade[]> {
    return db.select().from(trades).orderBy(asc(trades.sortOrder));
  }

  async createTrade(trade: InsertTrade): Promise<Trade> {
    const [created] = await db.insert(trades).values(trade).returning();
    return created;
  }

  async updateTrade(id: number, trade: Partial<InsertTrade>): Promise<Trade> {
    const [updated] = await db.update(trades).set(trade).where(eq(trades.id, id)).returning();
    return updated;
  }

  async deleteTrade(id: number): Promise<void> {
    await db.delete(trades).where(eq(trades.id, id));
  }

  async getBankAccounts(): Promise<BankAccount[]> {
    return db.select().from(bankAccounts).orderBy(asc(bankAccounts.sortOrder));
  }

  async getBankAccount(id: number): Promise<BankAccount | undefined> {
    const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id));
    return account;
  }

  async createBankAccount(account: InsertBankAccount): Promise<BankAccount> {
    const [created] = await db.insert(bankAccounts).values(account).returning();
    return created;
  }

  async updateBankAccount(id: number, account: Partial<InsertBankAccount>): Promise<BankAccount> {
    const [updated] = await db.update(bankAccounts).set(account).where(eq(bankAccounts.id, id)).returning();
    return updated;
  }

  async deleteBankAccount(id: number): Promise<void> {
    await db.delete(bankCachedTransactions).where(eq(bankCachedTransactions.bankAccountId, id));
    await db.delete(bankCachedBalances).where(eq(bankCachedBalances.bankAccountId, id));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, id));
  }

  async getBankCachedBalance(bankAccountId: number): Promise<BankCachedBalance | undefined> {
    const [balance] = await db.select().from(bankCachedBalances)
      .where(eq(bankCachedBalances.bankAccountId, bankAccountId))
      .orderBy(desc(bankCachedBalances.fetchedAt))
      .limit(1);
    return balance;
  }

  async upsertBankCachedBalance(data: InsertBankCachedBalance): Promise<BankCachedBalance> {
    const existing = await this.getBankCachedBalance(data.bankAccountId);
    if (existing) {
      const [updated] = await db.update(bankCachedBalances)
        .set({ ...data, fetchedAt: new Date() })
        .where(eq(bankCachedBalances.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(bankCachedBalances).values(data).returning();
    return created;
  }

  async getBankCachedTransactions(bankAccountId: number, filters?: { fromDate?: string; toDate?: string; search?: string; minAmount?: number; maxAmount?: number }): Promise<BankCachedTransaction[]> {
    const conditions = [eq(bankCachedTransactions.bankAccountId, bankAccountId)];
    if (filters?.fromDate) conditions.push(gte(bankCachedTransactions.bookingDate, filters.fromDate));
    if (filters?.toDate) conditions.push(lte(bankCachedTransactions.bookingDate, filters.toDate));
    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(or(
        ilike(bankCachedTransactions.purpose, pattern),
        ilike(bankCachedTransactions.counterpartName, pattern),
        ilike(bankCachedTransactions.counterpartIban, pattern)
      )!);
    }
    if (filters?.minAmount !== undefined) {
      conditions.push(gte(bankCachedTransactions.amount, String(filters.minAmount)));
    }
    if (filters?.maxAmount !== undefined) {
      conditions.push(lte(bankCachedTransactions.amount, String(filters.maxAmount)));
    }
    return db.select().from(bankCachedTransactions)
      .where(and(...conditions))
      .orderBy(desc(bankCachedTransactions.bookingDate))
      .limit(500);
  }

  async createBankCachedTransaction(data: InsertBankCachedTransaction): Promise<BankCachedTransaction> {
    const [created] = await db.insert(bankCachedTransactions).values(data).returning();
    return created;
  }

  async bulkCreateBankCachedTransactions(data: InsertBankCachedTransaction[]): Promise<BankCachedTransaction[]> {
    if (data.length === 0) return [];
    const results: BankCachedTransaction[] = [];
    for (const item of data) {
      if (item.externalId) {
        const existing = await db.select().from(bankCachedTransactions)
          .where(and(
            eq(bankCachedTransactions.bankAccountId, item.bankAccountId),
            eq(bankCachedTransactions.externalId, item.externalId)
          ))
          .limit(1);
        if (existing.length > 0) {
          results.push(existing[0]);
          continue;
        }
      }
      const [created] = await db.insert(bankCachedTransactions).values(item).returning();
      results.push(created);
    }
    return results;
  }

  async clearBankCachedTransactions(bankAccountId: number): Promise<void> {
    await db.delete(bankCachedTransactions).where(eq(bankCachedTransactions.bankAccountId, bankAccountId));
  }

  async getUnits(): Promise<UnitType[]> {
    return db.select().from(units).orderBy(asc(units.sortOrder));
  }

  async createUnit(unit: InsertUnit): Promise<UnitType> {
    const [created] = await db.insert(units).values(unit).returning();
    return created;
  }

  async updateUnit(id: number, unit: Partial<InsertUnit>): Promise<UnitType> {
    const [updated] = await db.update(units).set(unit).where(eq(units.id, id)).returning();
    return updated;
  }

  async deleteUnit(id: number): Promise<void> {
    await db.delete(units).where(eq(units.id, id));
  }

  async getCashBookEntries(filters?: { month?: number; year?: number; cashAccount?: string }): Promise<CashBookEntry[]> {
    const conditions = [];
    if (filters?.month) conditions.push(eq(cashBookEntries.month, filters.month));
    if (filters?.year) conditions.push(eq(cashBookEntries.year, filters.year));
    if (filters?.cashAccount) conditions.push(eq(cashBookEntries.cashAccount, filters.cashAccount));
    if (conditions.length > 0) {
      return db.select().from(cashBookEntries).where(and(...conditions)).orderBy(asc(cashBookEntries.lfdNr));
    }
    return db.select().from(cashBookEntries).orderBy(desc(cashBookEntries.year), desc(cashBookEntries.month), asc(cashBookEntries.lfdNr));
  }

  async getCashBookEntry(id: number): Promise<CashBookEntry | undefined> {
    const [entry] = await db.select().from(cashBookEntries).where(eq(cashBookEntries.id, id));
    return entry;
  }

  async createCashBookEntry(entry: InsertCashBookEntry): Promise<CashBookEntry> {
    const [created] = await db.insert(cashBookEntries).values(entry).returning();
    return created;
  }

  async updateCashBookEntry(id: number, entry: Partial<InsertCashBookEntry>): Promise<CashBookEntry> {
    const [updated] = await db.update(cashBookEntries).set(entry).where(eq(cashBookEntries.id, id)).returning();
    return updated;
  }

  async deleteCashBookEntry(id: number): Promise<void> {
    await db.delete(cashBookEntries).where(eq(cashBookEntries.id, id));
  }

  async getNextCashBookNumber(year: number): Promise<string> {
    const result = await db.select({ maxNr: sql<number>`COALESCE(MAX(${cashBookEntries.lfdNr}), 0)` })
      .from(cashBookEntries).where(eq(cashBookEntries.year, year));
    const next = (result[0]?.maxNr || 0) + 1;
    return `KB-${String(next).padStart(4, "0")}`;
  }

  async getPhrases(): Promise<Phrase[]> {
    return db.select().from(phrases).orderBy(asc(phrases.sortOrder), asc(phrases.number));
  }

  async getPhrase(id: number): Promise<Phrase | undefined> {
    const [phrase] = await db.select().from(phrases).where(eq(phrases.id, id));
    return phrase;
  }

  async createPhrase(phrase: InsertPhrase): Promise<Phrase> {
    const [created] = await db.insert(phrases).values(phrase).returning();
    return created;
  }

  async updatePhrase(id: number, phrase: Partial<InsertPhrase>): Promise<Phrase> {
    const [updated] = await db.update(phrases).set(phrase).where(eq(phrases.id, id)).returning();
    return updated;
  }

  async deletePhrase(id: number): Promise<void> {
    await db.delete(phrases).where(eq(phrases.id, id));
  }

  async getNextPhraseNumber(): Promise<string> {
    const result = await db.select({ maxNum: sql<string>`MAX(${phrases.number})` }).from(phrases);
    const maxNum = result[0]?.maxNum;
    let next = 1;
    if (maxNum) {
      const match = maxNum.match(/FL-(\d+)/);
      if (match) next = parseInt(match[1]) + 1;
    }
    return `FL-${String(next).padStart(3, "0")}`;
  }

  async getFollowUps(filters?: { status?: string }): Promise<FollowUp[]> {
    if (filters?.status) {
      return db.select().from(followUps).where(eq(followUps.status, filters.status)).orderBy(asc(followUps.dueDate));
    }
    return db.select().from(followUps).orderBy(asc(followUps.dueDate));
  }

  async getFollowUp(id: number): Promise<FollowUp | undefined> {
    const [entry] = await db.select().from(followUps).where(eq(followUps.id, id));
    return entry;
  }

  async createFollowUp(followUp: InsertFollowUp): Promise<FollowUp> {
    const [created] = await db.insert(followUps).values(followUp).returning();
    return created;
  }

  async updateFollowUp(id: number, followUp: Partial<InsertFollowUp>): Promise<FollowUp> {
    const [updated] = await db.update(followUps).set(followUp).where(eq(followUps.id, id)).returning();
    return updated;
  }

  async deleteFollowUp(id: number): Promise<void> {
    await db.delete(followUps).where(eq(followUps.id, id));
  }

  async getMailLogEntries(filters?: { direction?: string }): Promise<MailLogEntry[]> {
    if (filters?.direction) {
      return db.select().from(mailLog).where(eq(mailLog.direction, filters.direction)).orderBy(desc(mailLog.date));
    }
    return db.select().from(mailLog).orderBy(desc(mailLog.date));
  }

  async getMailLogEntry(id: number): Promise<MailLogEntry | undefined> {
    const [entry] = await db.select().from(mailLog).where(eq(mailLog.id, id));
    return entry;
  }

  async createMailLogEntry(entry: InsertMailLog): Promise<MailLogEntry> {
    const [created] = await db.insert(mailLog).values(entry).returning();
    return created;
  }

  async updateMailLogEntry(id: number, entry: Partial<InsertMailLog>): Promise<MailLogEntry> {
    const [updated] = await db.update(mailLog).set(entry).where(eq(mailLog.id, id)).returning();
    return updated;
  }

  async deleteMailLogEntry(id: number): Promise<void> {
    await db.delete(mailLog).where(eq(mailLog.id, id));
  }

  async getCustomerHistoryEntries(customerId: number): Promise<CustomerHistoryEntry[]> {
    return db.select().from(customerHistory).where(eq(customerHistory.customerId, customerId)).orderBy(desc(customerHistory.date));
  }

  async createCustomerHistoryEntry(entry: InsertCustomerHistory): Promise<CustomerHistoryEntry> {
    const [created] = await db.insert(customerHistory).values(entry).returning();
    return created;
  }

  async updateCustomerHistoryEntry(id: number, entry: Partial<InsertCustomerHistory>): Promise<CustomerHistoryEntry> {
    const [updated] = await db.update(customerHistory).set(entry).where(eq(customerHistory.id, id)).returning();
    return updated;
  }

  async deleteCustomerHistoryEntry(id: number): Promise<void> {
    await db.delete(customerHistory).where(eq(customerHistory.id, id));
  }

  async getContracts(): Promise<Contract[]> {
    return db.select().from(contracts).orderBy(desc(contracts.createdAt));
  }
  async getContract(id: number): Promise<Contract | undefined> {
    const [c] = await db.select().from(contracts).where(eq(contracts.id, id));
    return c;
  }
  async createContract(c: InsertContract): Promise<Contract> {
    const [created] = await db.insert(contracts).values(c).returning();
    return created;
  }
  async updateContract(id: number, c: Partial<InsertContract>): Promise<Contract> {
    const [updated] = await db.update(contracts).set(c).where(eq(contracts.id, id)).returning();
    return updated;
  }
  async deleteContract(id: number): Promise<void> {
    await db.delete(contracts).where(eq(contracts.id, id));
  }

  async getConstructionDiaryEntries(projectNumber?: string): Promise<ConstructionDiaryEntry[]> {
    if (projectNumber) {
      return db.select().from(constructionDiary).where(eq(constructionDiary.projectNumber, projectNumber)).orderBy(desc(constructionDiary.date));
    }
    return db.select().from(constructionDiary).orderBy(desc(constructionDiary.date));
  }
  async createConstructionDiaryEntry(e: InsertConstructionDiary): Promise<ConstructionDiaryEntry> {
    const [created] = await db.insert(constructionDiary).values(e).returning();
    return created;
  }
  async updateConstructionDiaryEntry(id: number, e: Partial<InsertConstructionDiary>): Promise<ConstructionDiaryEntry> {
    const [updated] = await db.update(constructionDiary).set(e).where(eq(constructionDiary.id, id)).returning();
    return updated;
  }
  async deleteConstructionDiaryEntry(id: number): Promise<void> {
    await db.delete(constructionDiary).where(eq(constructionDiary.id, id));
  }

  async getEmployees(): Promise<Employee[]> {
    return db.select().from(employees).orderBy(asc(employees.lastName));
  }
  async getEmployee(id: number): Promise<Employee | undefined> {
    const [e] = await db.select().from(employees).where(eq(employees.id, id));
    return e;
  }
  async createEmployee(e: InsertEmployee): Promise<Employee> {
    const [created] = await db.insert(employees).values(e).returning();
    return created;
  }
  async updateEmployee(id: number, e: Partial<InsertEmployee>): Promise<Employee> {
    const [updated] = await db.update(employees).set(e).where(eq(employees.id, id)).returning();
    return updated;
  }
  async deleteEmployee(id: number): Promise<void> {
    await db.delete(employees).where(eq(employees.id, id));
  }

  async getAppointments(filters?: { date?: string; employeeId?: number }): Promise<Appointment[]> {
    const conditions = [];
    if (filters?.date) conditions.push(eq(appointments.date, filters.date));
    if (filters?.employeeId) conditions.push(eq(appointments.employeeId, filters.employeeId));
    if (conditions.length > 0) {
      return db.select().from(appointments).where(and(...conditions)).orderBy(asc(appointments.date), asc(appointments.timeFrom));
    }
    return db.select().from(appointments).orderBy(asc(appointments.date), asc(appointments.timeFrom));
  }
  async createAppointment(a: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values(a).returning();
    return created;
  }
  async updateAppointment(id: number, a: Partial<InsertAppointment>): Promise<Appointment> {
    const [updated] = await db.update(appointments).set(a).where(eq(appointments.id, id)).returning();
    return updated;
  }
  async deleteAppointment(id: number): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  async getSerialNumbers(): Promise<SerialNumber[]> {
    return db.select().from(serialNumbers).orderBy(desc(serialNumbers.createdAt));
  }
  async createSerialNumber(s: InsertSerialNumber): Promise<SerialNumber> {
    const [created] = await db.insert(serialNumbers).values(s).returning();
    return created;
  }
  async updateSerialNumber(id: number, s: Partial<InsertSerialNumber>): Promise<SerialNumber> {
    const [updated] = await db.update(serialNumbers).set(s).where(eq(serialNumbers.id, id)).returning();
    return updated;
  }
  async deleteSerialNumber(id: number): Promise<void> {
    await db.delete(serialNumbers).where(eq(serialNumbers.id, id));
  }

  async getServices(): Promise<Service[]> {
    return db.select().from(services).orderBy(asc(services.serviceNumber));
  }
  async createService(s: InsertService): Promise<Service> {
    const [created] = await db.insert(services).values(s).returning();
    return created;
  }
  async updateService(id: number, s: Partial<InsertService>): Promise<Service> {
    const [updated] = await db.update(services).set(s).where(eq(services.id, id)).returning();
    return updated;
  }
  async deleteService(id: number): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  async getJumboPackages(): Promise<JumboPackage[]> {
    return db.select().from(jumboPackages).orderBy(asc(jumboPackages.jumboNumber));
  }
  async createJumboPackage(j: InsertJumboPackage): Promise<JumboPackage> {
    const [created] = await db.insert(jumboPackages).values(j).returning();
    return created;
  }
  async updateJumboPackage(id: number, j: Partial<InsertJumboPackage>): Promise<JumboPackage> {
    const [updated] = await db.update(jumboPackages).set(j).where(eq(jumboPackages.id, id)).returning();
    return updated;
  }
  async deleteJumboPackage(id: number): Promise<void> {
    await db.delete(jumboPackages).where(eq(jumboPackages.id, id));
  }

  async getAccounts(): Promise<Account[]> {
    return db.select().from(accounts).orderBy(asc(accounts.accountNumber));
  }
  async getTaxRates(): Promise<TaxRate[]> {
    return db.select().from(taxRates).orderBy(asc(taxRates.rate));
  }
  async getLedgerEntries(filters?: { period?: string; bookingType?: string; limit?: number; offset?: number }): Promise<{ entries: LedgerEntry[]; total: number }> {
    const conditions = [];
    if (filters?.period) conditions.push(eq(ledgerEntries.period, filters.period));
    if (filters?.bookingType) conditions.push(eq(ledgerEntries.bookingType, filters.bookingType));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(ledgerEntries).where(where);
    const total = Number(countResult.count);
    const entries = await db.select().from(ledgerEntries).where(where).orderBy(desc(ledgerEntries.date), desc(ledgerEntries.id)).limit(filters?.limit || 100).offset(filters?.offset || 0);
    return { entries, total };
  }
  async createLedgerEntry(e: InsertLedgerEntry): Promise<LedgerEntry> {
    const [created] = await db.insert(ledgerEntries).values(e).returning();
    return created;
  }
  async updateLedgerEntry(id: number, e: Partial<InsertLedgerEntry>): Promise<LedgerEntry> {
    const [updated] = await db.update(ledgerEntries).set(e).where(eq(ledgerEntries.id, id)).returning();
    return updated;
  }
  async deleteLedgerEntry(id: number): Promise<void> {
    await db.delete(ledgerEntries).where(eq(ledgerEntries.id, id));
  }

  async getInventoryMovements(): Promise<InventoryMovement[]> {
    return db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.date));
  }
  async createInventoryMovement(m: InsertInventoryMovement): Promise<InventoryMovement> {
    const [created] = await db.insert(inventoryMovements).values(m).returning();
    return created;
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.orderDate));
  }
  async createPurchaseOrder(o: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [created] = await db.insert(purchaseOrders).values(o).returning();
    return created;
  }
  async updatePurchaseOrder(id: number, o: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder> {
    const [updated] = await db.update(purchaseOrders).set(o).where(eq(purchaseOrders.id, id)).returning();
    return updated;
  }
  async deletePurchaseOrder(id: number): Promise<void> {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  async getMeasurements(projectNumber?: string): Promise<Measurement[]> {
    if (projectNumber) {
      return db.select().from(measurements).where(eq(measurements.projectNumber, projectNumber)).orderBy(desc(measurements.createdAt));
    }
    return db.select().from(measurements).orderBy(desc(measurements.createdAt));
  }
  async createMeasurement(m: InsertMeasurement): Promise<Measurement> {
    const [created] = await db.insert(measurements).values(m).returning();
    return created;
  }
  async updateMeasurement(id: number, m: Partial<InsertMeasurement>): Promise<Measurement> {
    const [updated] = await db.update(measurements).set(m).where(eq(measurements.id, id)).returning();
    return updated;
  }
  async deleteMeasurement(id: number): Promise<void> {
    await db.delete(measurements).where(eq(measurements.id, id));
  }

  async getFormTemplates(): Promise<FormTemplate[]> {
    return db.select().from(formTemplates).orderBy(asc(formTemplates.name));
  }
  async getFormTemplate(id: number): Promise<FormTemplate | undefined> {
    const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, id));
    return t;
  }
  async createFormTemplate(t: InsertFormTemplate): Promise<FormTemplate> {
    const [created] = await db.insert(formTemplates).values(t).returning();
    return created;
  }
  async updateFormTemplate(id: number, t: Partial<InsertFormTemplate>): Promise<FormTemplate> {
    const [updated] = await db.update(formTemplates).set(t).where(eq(formTemplates.id, id)).returning();
    return updated;
  }
  async deleteFormTemplate(id: number): Promise<void> {
    await db.delete(formTemplates).where(eq(formTemplates.id, id));
  }

  async getListTemplates(): Promise<ListTemplate[]> {
    return db.select().from(listTemplates).orderBy(asc(listTemplates.name));
  }
  async createListTemplate(t: InsertListTemplate): Promise<ListTemplate> {
    const [created] = await db.insert(listTemplates).values(t).returning();
    return created;
  }
  async updateListTemplate(id: number, t: Partial<InsertListTemplate>): Promise<ListTemplate> {
    const [updated] = await db.update(listTemplates).set(t).where(eq(listTemplates.id, id)).returning();
    return updated;
  }
  async deleteListTemplate(id: number): Promise<void> {
    await db.delete(listTemplates).where(eq(listTemplates.id, id));
  }

  async getPaymentOrders(): Promise<BankPaymentOrder[]> {
    return db.select().from(bankPaymentOrders).orderBy(desc(bankPaymentOrders.createdAt));
  }
  async getPaymentOrder(id: number): Promise<BankPaymentOrder | undefined> {
    const [order] = await db.select().from(bankPaymentOrders).where(eq(bankPaymentOrders.id, id));
    return order;
  }
  async createPaymentOrder(order: InsertBankPaymentOrder): Promise<BankPaymentOrder> {
    const [created] = await db.insert(bankPaymentOrders).values(order).returning();
    return created;
  }
  async updatePaymentOrder(id: number, order: Partial<InsertBankPaymentOrder>): Promise<BankPaymentOrder> {
    const [updated] = await db.update(bankPaymentOrders).set(order).where(eq(bankPaymentOrders.id, id)).returning();
    return updated;
  }
  async deletePaymentOrder(id: number): Promise<void> {
    await db.delete(bankPaymentOrders).where(eq(bankPaymentOrders.id, id));
  }

  async getPaymentMatches(): Promise<BankPaymentMatch[]> {
    return db.select().from(bankPaymentMatches).orderBy(desc(bankPaymentMatches.matchedAt));
  }
  async createPaymentMatch(match: InsertBankPaymentMatch): Promise<BankPaymentMatch> {
    const [created] = await db.insert(bankPaymentMatches).values(match).returning();
    return created;
  }
  async deletePaymentMatch(id: number): Promise<void> {
    await db.delete(bankPaymentMatches).where(eq(bankPaymentMatches.id, id));
  }
}

export const storage = new DatabaseStorage();
