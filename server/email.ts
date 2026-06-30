import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY nicht konfiguriert");
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const FROM_EMAIL = "FriStD-Bau ZuB <post@fristd-bau.com>";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : undefined,
      replyTo: options.replyTo || "post@fristd-bau.com",
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (err: any) {
    return { success: false, error: err.message || "Unbekannter Fehler beim E-Mail-Versand" };
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}

const DOC_TYPE_LABELS: Record<string, string> = {
  angebot: "Angebot",
  auftragsbestaetigung: "Auftragsbestätigung",
  abschlagsrechnung: "Abschlagsrechnung",
  rechnung: "Rechnung",
  gutschrift: "Gutschrift",
  lieferschein: "Lieferschein",
  freies_dokument: "Freies Dokument",
};

export function buildDocumentEmailHtml(params: {
  customerName: string;
  documentType: string;
  documentNumber: string;
  companyName?: string;
  senderName?: string;
  customMessage?: string;
}): string {
  const typeLabel = DOC_TYPE_LABELS[params.documentType] || params.documentType;
  const company = params.companyName || "FriStD-Bau ZuB GmbH & Co.KG";
  const message = params.customMessage ? escapeHtml(params.customMessage) : `beiliegend erhalten Sie unser ${typeLabel} Nr. ${escapeHtml(params.documentNumber)}.`;

  return `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
  <div style="padding: 20px;">
    <p>Sehr geehrte Damen und Herren,</p>
    <p>${message}</p>
    <p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
    <p>Mit freundlichen Grüßen</p>
    <p>
      ${params.senderName ? `<strong>${params.senderName}</strong><br>` : ""}
      <strong>${company}</strong><br>
      Haldesdorfer Str. 44<br>
      22179 Hamburg<br>
      Tel: 040 / 696 39 39 - 0<br>
      E-Mail: post@fristd-bau.com
    </p>
  </div>
</body>
</html>`.trim();
}
