import type { AiProvider } from "@shared/schema";
import { db } from "./db";
import { aiSettings } from "@shared/schema";

interface AiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AiCompletionOptions {
  model: string;
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  stream?: boolean;
}

interface AiCompletionResult {
  text: string;
}

async function getAiConfig(): Promise<{ provider: AiProvider; apiKey: string; fastModel: string; standardModel: string }> {
  const [settings] = await db.select().from(aiSettings).limit(1);

  if (!settings) {
    const replitKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    if (replitKey) {
      return {
        provider: "anthropic",
        apiKey: replitKey,
        fastModel: "claude-haiku-4-5",
        standardModel: "claude-sonnet-4-6",
      };
    }
    throw new Error("Keine KI-Einstellungen konfiguriert. Bitte API-Key in den Einstellungen hinterlegen.");
  }

  const provider = settings.activeProvider as AiProvider;
  let apiKey: string | null = null;

  switch (provider) {
    case "anthropic":
      apiKey = settings.anthropicApiKey || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || null;
      break;
    case "openai":
      apiKey = settings.openaiApiKey;
      break;
    case "google":
      apiKey = settings.googleApiKey;
      break;
    case "perplexity":
      apiKey = settings.perplexityApiKey;
      break;
    case "mistral":
      apiKey = settings.mistralApiKey;
      break;
  }

  if (!apiKey) {
    throw new Error(`Kein API-Key für ${provider} hinterlegt. Bitte in den Einstellungen konfigurieren.`);
  }

  return {
    provider,
    apiKey,
    fastModel: settings.fastModel,
    standardModel: settings.standardModel,
  };
}

async function callAnthropic(apiKey: string, opts: AiCompletionOptions): Promise<AiCompletionResult> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const body: any = {
    model: opts.model,
    max_tokens: opts.maxTokens || 8192,
    system: opts.system,
    messages: opts.messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content })),
  };

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API Fehler (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";
  return { text };
}

async function callOpenAI(apiKey: string, opts: AiCompletionOptions): Promise<AiCompletionResult> {
  const messages: any[] = [{ role: "system", content: opts.system }];
  for (const m of opts.messages.filter(m => m.role !== "system")) {
    messages.push({ role: m.role, content: m.content });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens || 8192,
      messages,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API Fehler (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return { text: data.choices?.[0]?.message?.content || "" };
}

async function callGoogle(apiKey: string, opts: AiCompletionOptions): Promise<AiCompletionResult> {
  const contents: any[] = [];
  for (const m of opts.messages.filter(m => m.role !== "system")) {
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.system }] },
        contents,
        generationConfig: { maxOutputTokens: opts.maxTokens || 8192 },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google Gemini API Fehler (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { text };
}

async function callPerplexity(apiKey: string, opts: AiCompletionOptions): Promise<AiCompletionResult> {
  const messages: any[] = [{ role: "system", content: opts.system }];
  for (const m of opts.messages.filter(m => m.role !== "system")) {
    messages.push({ role: m.role, content: m.content });
  }

  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens || 8192,
      messages,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Perplexity API Fehler (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return { text: data.choices?.[0]?.message?.content || "" };
}

async function callMistral(apiKey: string, opts: AiCompletionOptions): Promise<AiCompletionResult> {
  const messages: any[] = [{ role: "system", content: opts.system }];
  for (const m of opts.messages.filter(m => m.role !== "system")) {
    messages.push({ role: m.role, content: m.content });
  }

  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens || 8192,
      messages,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Mistral API Fehler (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return { text: data.choices?.[0]?.message?.content || "" };
}

export async function aiComplete(opts: {
  system: string;
  messages: AiMessage[];
  tier?: "fast" | "standard";
  maxTokens?: number;
}): Promise<AiCompletionResult> {
  const config = await getAiConfig();
  const model = opts.tier === "standard" ? config.standardModel : config.fastModel;

  const completionOpts: AiCompletionOptions = {
    model,
    system: opts.system,
    messages: opts.messages,
    maxTokens: opts.maxTokens || 8192,
  };

  switch (config.provider) {
    case "anthropic":
      return callAnthropic(config.apiKey, completionOpts);
    case "openai":
      return callOpenAI(config.apiKey, completionOpts);
    case "google":
      return callGoogle(config.apiKey, completionOpts);
    case "perplexity":
      return callPerplexity(config.apiKey, completionOpts);
    case "mistral":
      return callMistral(config.apiKey, completionOpts);
    default:
      throw new Error(`Unbekannter KI-Anbieter: ${config.provider}`);
  }
}

export async function aiStream(opts: {
  system: string;
  messages: AiMessage[];
  tier?: "fast" | "standard";
  maxTokens?: number;
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}): Promise<void> {
  const config = await getAiConfig();
  const model = opts.tier === "standard" ? config.standardModel : config.fastModel;

  try {
    if (config.provider === "anthropic") {
      const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
      const resp = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens || 8192,
          system: opts.system,
          messages: opts.messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Anthropic Stream Fehler (${resp.status}): ${err}`);
      }

      let fullText = "";
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "content_block_delta" && event.delta?.text) {
              fullText += event.delta.text;
              opts.onChunk(event.delta.text);
            }
          } catch {}
        }
      }
      opts.onDone(fullText);
    } else {
      let url: string;
      let headers: Record<string, string>;
      let body: any;

      const messages: any[] = [{ role: "system", content: opts.system }];
      for (const m of opts.messages.filter(m => m.role !== "system")) {
        messages.push({ role: m.role, content: m.content });
      }

      if (config.provider === "google") {
        const result = await callGoogle(config.apiKey, { model, system: opts.system, messages: opts.messages, maxTokens: opts.maxTokens });
        opts.onChunk(result.text);
        opts.onDone(result.text);
        return;
      }

      if (config.provider === "openai") {
        url = "https://api.openai.com/v1/chat/completions";
        headers = { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` };
      } else if (config.provider === "perplexity") {
        url = "https://api.perplexity.ai/chat/completions";
        headers = { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` };
      } else {
        url = "https://api.mistral.ai/v1/chat/completions";
        headers = { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` };
      }

      body = { model, max_tokens: opts.maxTokens || 8192, messages, stream: true };

      const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`${config.provider} Stream Fehler (${resp.status}): ${err}`);
      }

      let fullText = "";
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const event = JSON.parse(jsonStr);
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              opts.onChunk(delta);
            }
          } catch {}
        }
      }
      opts.onDone(fullText);
    }
  } catch (error: any) {
    opts.onError(error);
  }
}

export async function aiCompleteWithDocument(opts: {
  system: string;
  documentBase64: string;
  documentMediaType: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<AiCompletionResult> {
  const config = await getAiConfig();
  if (config.provider !== "anthropic") {
    throw new Error("PDF-Analyse benötigt Anthropic als KI-Anbieter. Bitte in den Einstellungen auf Anthropic umstellen.");
  }
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";

  const body = {
    model: config.standardModel || "claude-sonnet-4-6",
    max_tokens: opts.maxTokens || 8192,
    system: opts.system,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: opts.documentMediaType,
            data: opts.documentBase64,
          },
        },
        {
          type: "text",
          text: opts.userMessage,
        },
      ],
    }],
  };

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API Fehler (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";
  return { text };
}

export { getAiConfig };
