import type { Express, Request, Response } from "express";
import { requireAuth } from "./auth";
import { aiComplete, aiStream } from "./ai-providers";
import { db } from "./db";
import { aiSettings, AI_PROVIDERS } from "@shared/schema";
import { eq } from "drizzle-orm";

function requireChef(req: Request, res: Response, next: Function) {
  const user = req.user as any;
  if (!user || (user.role !== "chef" && user.role !== "admin" && user.role !== "buero")) {
    return res.status(403).json({ error: "Nur Chef/Admin/Büro darf KI-Einstellungen ändern" });
  }
  next();
}

const SYSTEM_PROMPT_BASE = `Du bist ein KI-Assistent für FriStD-Bau ZuB GmbH & Co.KG, ein Zimmerei- und Dachdeckerbetrieb in Hamburg.
Du hilfst bei der Erstellung von Angeboten, Rechnungen und anderen Geschäftsdokumenten.
Antworte IMMER auf Deutsch. Verwende deutsches Zahlenformat (Komma als Dezimaltrenner).
Du kennst dich aus mit: Zimmerei, Dachdeckerei, Holzbau, Sanierung, Trockenbau, Fassaden.`;

export function registerAiRoutes(app: Express): void {

  app.get("/api/ai-settings", requireAuth, requireChef, async (_req: Request, res: Response) => {
    try {
      const [settings] = await db.select().from(aiSettings).limit(1);
      if (!settings) {
        return res.json({
          activeProvider: "anthropic",
          fastModel: "claude-haiku-4-5",
          standardModel: "claude-sonnet-4-6",
          anthropicApiKey: "",
          openaiApiKey: "",
          googleApiKey: "",
          perplexityApiKey: "",
          mistralApiKey: "",
        });
      }
      res.json({
        activeProvider: settings.activeProvider,
        fastModel: settings.fastModel,
        standardModel: settings.standardModel,
        anthropicApiKey: settings.anthropicApiKey ? "••••••••" : "",
        openaiApiKey: settings.openaiApiKey ? "••••••••" : "",
        googleApiKey: settings.googleApiKey ? "••••••••" : "",
        perplexityApiKey: settings.perplexityApiKey ? "••••••••" : "",
        mistralApiKey: settings.mistralApiKey ? "••••••••" : "",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-settings", requireAuth, requireChef, async (req: Request, res: Response) => {
    try {
      const { activeProvider, fastModel, standardModel, anthropicApiKey, openaiApiKey, googleApiKey, perplexityApiKey, mistralApiKey } = req.body;

      const validProviders = AI_PROVIDERS as readonly string[];
      if (activeProvider && !validProviders.includes(activeProvider)) {
        return res.status(400).json({ error: "Ungültiger KI-Anbieter" });
      }

      const [existing] = await db.select().from(aiSettings).limit(1);

      const updates: any = {
        activeProvider: activeProvider || "anthropic",
        fastModel: fastModel || "claude-haiku-4-5",
        standardModel: standardModel || "claude-sonnet-4-6",
      };

      if (anthropicApiKey && anthropicApiKey !== "••••••••") updates.anthropicApiKey = anthropicApiKey;
      if (openaiApiKey && openaiApiKey !== "••••••••") updates.openaiApiKey = openaiApiKey;
      if (googleApiKey && googleApiKey !== "••••••••") updates.googleApiKey = googleApiKey;
      if (perplexityApiKey && perplexityApiKey !== "••••••••") updates.perplexityApiKey = perplexityApiKey;
      if (mistralApiKey && mistralApiKey !== "••••••••") updates.mistralApiKey = mistralApiKey;

      if (existing) {
        await db.update(aiSettings).set(updates).where(eq(aiSettings.id, existing.id));
      } else {
        await db.insert(aiSettings).values(updates);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-settings/test", requireAuth, requireChef, async (req: Request, res: Response) => {
    try {
      const result = await aiComplete({
        system: "Du bist ein hilfreicher Assistent. Antworte mit genau einem Satz auf Deutsch.",
        messages: [{ role: "user", content: "Sage 'Die KI-Verbindung funktioniert einwandfrei.' und nichts anderes." }],
        tier: "fast",
        maxTokens: 100,
      });
      res.json({ success: true, text: result.text });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/ai/generate-text", requireAuth, async (req: Request, res: Response) => {
    try {
      const { prompt, context, type } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt fehlt" });

      let systemPrompt = SYSTEM_PROMPT_BASE;
      if (type === "kopftext") {
        systemPrompt += `\n\nGeneriere einen professionellen Kopftext/Anschreiben für ein Dokument. Der Text soll kurz, professionell und freundlich sein. Nur den reinen Text ausgeben, keine Formatierung.`;
      } else if (type === "fusstext") {
        systemPrompt += `\n\nGeneriere einen professionellen Fußtext/Grußformel für ein Dokument. Kurz und geschäftsmäßig. Nur den reinen Text ausgeben.`;
      } else if (type === "position") {
        systemPrompt += `\n\nGeneriere eine Positionsbeschreibung für ein Angebot/eine Rechnung. Fachlich korrekt und verständlich. Nur den reinen Text ausgeben.`;
      } else if (type === "betreff") {
        systemPrompt += `\n\nGeneriere einen passenden Betreff für ein Geschäftsdokument. Kurz und prägnant, maximal eine Zeile. Nur den reinen Text ausgeben.`;
      }

      const result = await aiComplete({
        system: systemPrompt,
        messages: [{ role: "user", content: context ? `Kontext: ${context}\n\nAufgabe: ${prompt}` : prompt }],
        tier: "fast",
      });

      res.json({ text: result.text });
    } catch (error: any) {
      console.error("AI generate-text error:", error);
      res.status(500).json({ error: "KI-Fehler: " + (error.message || "Unbekannt") });
    }
  });

  app.post("/api/ai/suggest-positions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { projectDescription, documentType, existingPositions } = req.body;
      if (!projectDescription) return res.status(400).json({ error: "Projektbeschreibung fehlt" });

      const systemPrompt = SYSTEM_PROMPT_BASE + `\n\nDu generierst Positionsvorschläge für Angebote/Rechnungen im Handwerk.
Antworte NUR mit einem JSON-Array von Positionen. Jede Position hat:
{
  "type": "titel"|"material"|"lohn"|"leistung"|"manuell"|"titelsumme",
  "title": "Bezeichnung",
  "description": "Langtext (optional)",
  "quantity": Zahl,
  "unit": "Stk"|"m"|"m²"|"m³"|"Std"|"pau"|"lfm"|"kg",
  "unitPrice": Zahl (Netto-VK in Euro, realistisch für Hamburg 2025/2026),
  "materialPrice": Zahl (EK wenn Material)
}

Strukturiere mit Titeln und Titelsummen. Verwende realistische Marktpreise für Hamburg.
Gib NUR das JSON-Array aus, KEIN weiterer Text.`;

      const userMsg = `Erstelle Positionen für folgendes Projekt:
${projectDescription}
${documentType ? `Dokumenttyp: ${documentType}` : ""}
${existingPositions ? `Bereits vorhandene Positionen: ${existingPositions}` : ""}`;

      const result = await aiComplete({
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
        tier: "standard",
      });

      let positions;
      try {
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        positions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        positions = [];
      }

      res.json({ positions });
    } catch (error: any) {
      console.error("AI suggest-positions error:", error);
      res.status(500).json({ error: "KI-Fehler: " + (error.message || "Unbekannt") });
    }
  });

  app.post("/api/ai/optimize-text", requireAuth, async (req: Request, res: Response) => {
    try {
      const { text, instruction } = req.body;
      if (!text) return res.status(400).json({ error: "Text fehlt" });

      const systemPrompt = SYSTEM_PROMPT_BASE + `\n\nOptimiere den gegebenen Text professionell. Behalte den fachlichen Inhalt bei, verbessere nur Formulierung und Klarheit. Nur den optimierten Text ausgeben, keine Erklärungen.`;

      const result = await aiComplete({
        system: systemPrompt,
        messages: [{ role: "user", content: instruction ? `Anweisung: ${instruction}\n\nText zum Optimieren:\n${text}` : `Optimiere folgenden Text professionell:\n${text}` }],
        tier: "fast",
      });

      res.json({ text: result.text });
    } catch (error: any) {
      console.error("AI optimize-text error:", error);
      res.status(500).json({ error: "KI-Fehler: " + (error.message || "Unbekannt") });
    }
  });

  app.post("/api/ai/calculate-price", requireAuth, async (req: Request, res: Response) => {
    try {
      const { description, unit, region } = req.body;
      if (!description) return res.status(400).json({ error: "Beschreibung fehlt" });

      const systemPrompt = SYSTEM_PROMPT_BASE + `\n\nSchätze realistische Preise für Handwerksleistungen/Material ein.
Antworte NUR mit JSON:
{
  "unitPrice": Zahl (VK netto pro Einheit),
  "purchasePrice": Zahl (EK netto, falls Material),
  "confidence": "hoch"|"mittel"|"niedrig",
  "explanation": "Kurze Begründung"
}
Basiere auf aktuellen Marktpreisen für ${region || "Hamburg"} 2025/2026.`;

      const result = await aiComplete({
        system: systemPrompt,
        messages: [{ role: "user", content: `Preis schätzen für: ${description}${unit ? `, Einheit: ${unit}` : ""}` }],
        tier: "fast",
      });

      let parsed;
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        parsed = {};
      }
      res.json(parsed);
    } catch (error: any) {
      console.error("AI calculate-price error:", error);
      res.status(500).json({ error: "KI-Fehler: " + (error.message || "Unbekannt") });
    }
  });

  app.post("/api/ai/chat", requireAuth, async (req: Request, res: Response) => {
    try {
      const { message, history } = req.body;
      if (!message) return res.status(400).json({ error: "Nachricht fehlt" });

      const systemPrompt = SYSTEM_PROMPT_BASE + `\n\nDu bist der Hilfe-Assistent für die FriStD-Bau ERP-Software.
Du kennst dich aus mit:
- Dokumenterstellung (Angebote, Rechnungen, Auftragsbestätigungen, Gutschriften, Lieferscheine)
- Kundenverwaltung, Projektverwaltung
- Materialstamm, Leistungskatalog, Jumbos (Stücklisten/Pakete)
- Kalkulation (EK, VK, Aufschlag, Marge, Deckungsbeitrag)
- Positionstypen: Titel, Material, Leistung, Lohn, Jumbo, Manuell, Titelsumme, Zwischensumme, Abschluss, Freitext, Floskel, Skonto, Zuschlag
- Tastenkürzel: F2=Material, F3=Leistung, F4=Jumbo, F5=Kalkulation, F6=Eigenschaften, Strg+D=Lohn, Strg+S=Speichern
- NAS-Import, Zeiterfassung, Nachkalkulation
Antworte hilfreich und konkret. Beziehe dich auf die Software-Funktionen.`;

      const chatMessages: Array<{role: "user" | "assistant", content: string}> = [];
      if (history && Array.isArray(history)) {
        for (const h of history) {
          chatMessages.push({ role: h.role, content: h.content });
        }
      }
      chatMessages.push({ role: "user", content: message });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      await aiStream({
        system: systemPrompt,
        messages: chatMessages,
        tier: "fast",
        onChunk: (text) => {
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        },
        onDone: (fullContent) => {
          res.write(`data: ${JSON.stringify({ done: true, fullContent })}\n\n`);
          res.end();
        },
        onError: (error) => {
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: "KI-Fehler: " + error.message })}\n\n`);
            res.end();
          } else {
            res.status(500).json({ error: "KI-Fehler: " + error.message });
          }
        },
      });
    } catch (error: any) {
      console.error("AI chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "KI-Fehler: " + (error.message || "Unbekannt") })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "KI-Fehler: " + (error.message || "Unbekannt") });
      }
    }
  });

  app.post("/api/ai/analyze-document", requireAuth, async (req: Request, res: Response) => {
    try {
      const { positions, documentType } = req.body;
      if (!positions || !Array.isArray(positions)) return res.status(400).json({ error: "Positionen fehlen" });

      const systemPrompt = SYSTEM_PROMPT_BASE + `\n\nAnalysiere die Positionen eines Handwerksdokuments und gib Verbesserungsvorschläge.
Antworte auf Deutsch mit JSON:
{
  "summary": "Kurze Zusammenfassung",
  "suggestions": ["Vorschlag 1", "Vorschlag 2", ...],
  "warnings": ["Warnung 1", ...],
  "missingPositions": ["Fehlende Position 1", ...],
  "priceCheck": "Einschätzung der Preise"
}`;

      const posText = positions.map((p: any) =>
        `${p.type}: ${p.title} | Menge: ${p.quantity} ${p.unit} | EP: ${p.unitPrice} | GP: ${p.totalPrice}`
      ).join("\n");

      const result = await aiComplete({
        system: systemPrompt,
        messages: [{ role: "user", content: `Analysiere dieses ${documentType || "Angebot"}:\n${posText}` }],
        tier: "standard",
      });

      let parsed;
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        parsed = { summary: result.text };
      }
      res.json(parsed);
    } catch (error: any) {
      console.error("AI analyze error:", error);
      res.status(500).json({ error: "KI-Fehler: " + (error.message || "Unbekannt") });
    }
  });
}
