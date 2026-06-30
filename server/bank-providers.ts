export interface BankTransaction {
  externalId: string;
  bookingDate: string;
  valueDate: string;
  amount: number;
  currency: string;
  purpose: string;
  counterpartName: string;
  counterpartIban: string;
  counterpartBic: string;
  transactionType: string;
  creditorId?: string;
  mandateReference?: string;
  endToEndReference?: string;
}

export interface BankBalance {
  balance: number;
  availableBalance: number;
  currency: string;
}

export interface PaymentRequest {
  recipientName: string;
  recipientIban: string;
  recipientBic?: string;
  amount: number;
  currency: string;
  purpose: string;
  endToEndReference?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  message: string;
}

export interface BankProvider {
  readonly bankType: string;
  readonly displayName: string;
  getBalance(accountId: number, iban: string, apiConfig: Record<string, string>): Promise<BankBalance>;
  getTransactions(accountId: number, iban: string, apiConfig: Record<string, string>, fromDate?: string, toDate?: string): Promise<BankTransaction[]>;
  initiatePayment(accountId: number, iban: string, apiConfig: Record<string, string>, payment: PaymentRequest): Promise<PaymentResult>;
}

class DeutscheBankProvider implements BankProvider {
  readonly bankType = "deutsche_bank";
  readonly displayName = "Deutsche Bank";

  async getBalance(_accountId: number, iban: string, _apiConfig: Record<string, string>): Promise<BankBalance> {
    // TODO: Integrate with Deutsche Bank dbAPI (https://developer.db.com/)
    // Requires OAuth2 consent flow and PSD2 compliance
    const seed = iban.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      balance: 125430.67 + (seed % 1000),
      availableBalance: 118200.00 + (seed % 800),
      currency: "EUR",
    };
  }

  async getTransactions(_accountId: number, iban: string, _apiConfig: Record<string, string>, fromDate?: string, toDate?: string): Promise<BankTransaction[]> {
    // TODO: Integrate with Deutsche Bank dbAPI transactions endpoint
    // GET /cashManagement/transactions
    return generateDummyTransactions(iban, fromDate, toDate, "Deutsche Bank");
  }

  async initiatePayment(_accountId: number, _iban: string, _apiConfig: Record<string, string>, payment: PaymentRequest): Promise<PaymentResult> {
    // TODO: Integrate with Deutsche Bank payment initiation API
    // POST /payments/sepa-credit-transfers
    return {
      success: false,
      message: `Zahlung an ${payment.recipientName} über ${payment.amount} EUR vorbereitet. Deutsche Bank API-Integration noch nicht implementiert.`,
    };
  }
}

class PostbankProvider implements BankProvider {
  readonly bankType = "postbank";
  readonly displayName = "Postbank";

  async getBalance(_accountId: number, iban: string, _apiConfig: Record<string, string>): Promise<BankBalance> {
    // TODO: Integrate with Postbank/Deutsche Bank API (shared platform)
    const seed = iban.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      balance: 48720.33 + (seed % 500),
      availableBalance: 45100.00 + (seed % 400),
      currency: "EUR",
    };
  }

  async getTransactions(_accountId: number, iban: string, _apiConfig: Record<string, string>, fromDate?: string, toDate?: string): Promise<BankTransaction[]> {
    // TODO: Integrate with Postbank API for transaction retrieval
    return generateDummyTransactions(iban, fromDate, toDate, "Postbank");
  }

  async initiatePayment(_accountId: number, _iban: string, _apiConfig: Record<string, string>, payment: PaymentRequest): Promise<PaymentResult> {
    // TODO: Integrate with Postbank payment API
    return {
      success: false,
      message: `Zahlung an ${payment.recipientName} über ${payment.amount} EUR vorbereitet. Postbank API-Integration noch nicht implementiert.`,
    };
  }
}

class FinomProvider implements BankProvider {
  readonly bankType = "finom";
  readonly displayName = "Finom";

  async getBalance(_accountId: number, iban: string, _apiConfig: Record<string, string>): Promise<BankBalance> {
    // TODO: Integrate with Finom API (https://docs.finom.co/)
    // Requires API key authentication
    const seed = iban.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      balance: 32150.89 + (seed % 300),
      availableBalance: 31800.00 + (seed % 250),
      currency: "EUR",
    };
  }

  async getTransactions(_accountId: number, iban: string, _apiConfig: Record<string, string>, fromDate?: string, toDate?: string): Promise<BankTransaction[]> {
    // TODO: Integrate with Finom API for transaction history
    // GET /api/v1/transactions
    return generateDummyTransactions(iban, fromDate, toDate, "Finom");
  }

  async initiatePayment(_accountId: number, _iban: string, _apiConfig: Record<string, string>, payment: PaymentRequest): Promise<PaymentResult> {
    // TODO: Integrate with Finom payment API
    // POST /api/v1/payments
    return {
      success: false,
      message: `Zahlung an ${payment.recipientName} über ${payment.amount} EUR vorbereitet. Finom API-Integration noch nicht implementiert.`,
    };
  }
}

function generateDummyTransactions(iban: string, fromDate?: string, toDate?: string, bankName?: string): BankTransaction[] {
  const seed = iban.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const now = new Date();
  const from = fromDate ? new Date(fromDate) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = toDate ? new Date(toDate) : now;

  const counterparts = [
    { name: "Bauhaus AG", iban: "DE89370400440532013000", purpose: "Material Bestellung #4521" },
    { name: "Hornbach Baumarkt", iban: "DE27100777770209299700", purpose: "Werkzeug & Zubehör" },
    { name: "Stadtwerke Hamburg", iban: "DE44200505501015871393", purpose: "Strom Abschlag 03/2026" },
    { name: "DEVK Versicherung", iban: "DE68500105175473412485", purpose: "KFZ-Versicherung PKW HH-FB 123" },
    { name: "Deutsche Rentenversicherung", iban: "DE02120300001020014691", purpose: "SV-Beiträge 03/2026" },
    { name: "Müller Elektrotechnik GmbH", iban: "DE91100000000123456789", purpose: "Subunternehmer RE-2026-0089" },
    { name: "Schmidt Immobilien GmbH", iban: "DE75512108001245126199", purpose: "Miete Büro Wandsbek 04/2026" },
    { name: "Gehalt Mitarbeiter", iban: "DE12500105170648489890", purpose: "Gehalt März 2026" },
    { name: "Meyer Bau GmbH", iban: "DE55300606010004444401", purpose: "Zahlung RE 26-00142" },
    { name: "Krüger & Partner", iban: "DE33100400480532013001", purpose: "Zahlung Rechnung 26-00098" },
    { name: "OBI Baumarkt", iban: "DE81200411110000000012", purpose: "Baustoffe PJ 26-00045" },
    { name: "AOK Gesundheitskasse", iban: "DE02300209005020543210", purpose: "Krankenkassenbeiträge 03/2026" },
    { name: "Finanzamt Hamburg", iban: "DE86200500000101500011", purpose: "USt-Voranmeldung Q1/2026" },
    { name: "Telekom Deutschland", iban: "DE18500105177894561234", purpose: "Mobilfunk & Internet 03/2026" },
    { name: "Wohnungsbau GmbH Nord", iban: "DE40200505501234567890", purpose: "Teilrechnung Projekt Bramfeld" },
  ];

  const transactions: BankTransaction[] = [];
  const daysDiff = Math.max(1, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  const count = Math.min(daysDiff * 2, 50);

  for (let i = 0; i < count; i++) {
    const dayOffset = Math.floor((seed * (i + 1) * 7) % daysDiff);
    const txDate = new Date(from.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    if (txDate > to) continue;

    const cp = counterparts[(seed + i) % counterparts.length];
    const isIncoming = (seed + i * 3) % 5 < 2;
    const baseAmount = ((seed * (i + 1)) % 9000) + 100;
    const amount = isIncoming ? baseAmount : -baseAmount;
    const dateStr = txDate.toISOString().split("T")[0];

    transactions.push({
      externalId: `${bankName || "BANK"}-TX-${dateStr}-${i.toString().padStart(4, "0")}`,
      bookingDate: dateStr,
      valueDate: dateStr,
      amount: Math.round(amount * 100) / 100,
      currency: "EUR",
      purpose: cp.purpose,
      counterpartName: cp.name,
      counterpartIban: cp.iban,
      counterpartBic: "COBADEFFXXX",
      transactionType: isIncoming ? "Gutschrift" : "Lastschrift",
    });
  }

  transactions.sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));
  return transactions;
}

const providers: Record<string, BankProvider> = {
  deutsche_bank: new DeutscheBankProvider(),
  postbank: new PostbankProvider(),
  finom: new FinomProvider(),
};

export function getBankProvider(bankType: string): BankProvider | undefined {
  return providers[bankType];
}

export function getAllBankProviders(): BankProvider[] {
  return Object.values(providers);
}
