/**
 * Azure OpenAI / Azure AI Foundry — shared helper for Supabase Edge Functions.
 *
 * Reads secrets from Deno.env:
 *   AZURE_OPENAI_ENDPOINT  – full URL for chat/completions
 *   AZURE_OPENAI_API_KEY   – api-key header value
 *   AZURE_OPENAI_MODEL     – deployment/model name (e.g. grok-4-20-non-reasoning)
 *
 * NEVER log the API key or any token.
 */

export interface AzureMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AzureAgentRequest {
  systemPrompt: string;
  messages: AzureMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AzureAgentResponse {
  ok: boolean;
  reply: string;
  /** Structured intent parsed from model JSON output */
  intent?: "informacao" | "agendamento" | "nao_encontrado";
  servico_id?: string;
  agendavel?: boolean;
  link_acesso?: string;
  /** Raw error (safe — never contains credentials) */
  error?: string;
}

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * Call the Azure OpenAI chat/completions endpoint.
 *
 * Returns a structured response with `ok`, `reply` and optional intent fields.
 * On any failure the function returns a user-friendly fallback — it NEVER throws.
 */
export async function callAzureAgent(
  req: AzureAgentRequest,
  logger: Logger,
): Promise<AzureAgentResponse> {
  const endpoint = Deno.env.get("AZURE_OPENAI_ENDPOINT");
  const apiKey = Deno.env.get("AZURE_OPENAI_API_KEY");
  const model = Deno.env.get("AZURE_OPENAI_MODEL");

  // ── Pre-flight checks ─────────────────────────────────────────────────
  if (!endpoint || !apiKey || !model) {
    const missing: string[] = [];
    if (!endpoint) missing.push("AZURE_OPENAI_ENDPOINT");
    if (!apiKey) missing.push("AZURE_OPENAI_API_KEY");
    if (!model) missing.push("AZURE_OPENAI_MODEL");
    logger.warn({ missing }, "Azure OpenAI secrets not configured");
    return {
      ok: false,
      reply: "IA não configurada.",
      error: `Missing secrets: ${missing.join(", ")}`,
    };
  }

  // ── Build request ─────────────────────────────────────────────────────
  const allMessages: AzureMessage[] = [
    { role: "system", content: req.systemPrompt },
    ...req.messages,
  ];

  const body = {
    model,
    messages: allMessages,
    temperature: req.temperature ?? 0.2,
    max_tokens: req.maxTokens ?? 700,
  };

  // ── Call Azure ────────────────────────────────────────────────────────
  try {
    logger.info({ model, messageCount: allMessages.length }, "Calling Azure OpenAI");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000), // 20s timeout
    });

    if (!response.ok) {
      const statusText = response.statusText || "Unknown";
      // Read error body but NEVER log credentials
      let errorDetail = "";
      try {
        const errBody = await response.text();
        // Only log a safe substring
        errorDetail = errBody.substring(0, 200);
      } catch { /* ignore */ }

      logger.error(
        { status: response.status, statusText, errorDetail },
        "Azure OpenAI returned non-OK status",
      );

      return {
        ok: false,
        reply: "Desculpe, houve um erro ao consultar o assistente. Tente novamente em instantes.",
        error: `Azure returned ${response.status} ${statusText}`,
      };
    }

    // ── Parse response ──────────────────────────────────────────────────
    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!rawContent) {
      logger.warn({}, "Azure OpenAI returned empty content");
      return {
        ok: false,
        reply: "O assistente não retornou resposta. Tente novamente.",
        error: "Empty content from Azure",
      };
    }

    // ── Try to parse structured JSON from the model ─────────────────────
    const parsed = tryParseStructuredResponse(rawContent);

    if (parsed) {
      return {
        ok: true,
        reply: parsed.reply || rawContent,
        intent: parsed.intent,
        servico_id: parsed.servico_id,
        agendavel: parsed.agendavel,
        link_acesso: parsed.link_acesso,
      };
    }

    // Fallback: plain text response (no JSON)
    return {
      ok: true,
      reply: rawContent,
      intent: "informacao",
    };
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.name : "UnknownError";
    const errMsg = err instanceof Error ? err.message : String(err);

    logger.error({ errName, errMsg }, "Azure OpenAI call failed");

    if (errName === "TimeoutError" || errName === "AbortError") {
      return {
        ok: false,
        reply: "O assistente demorou para responder. Tente novamente em instantes.",
        error: "Timeout",
      };
    }

    return {
      ok: false,
      reply: "Desculpe, não consegui consultar o assistente neste momento.",
      error: errMsg,
    };
  }
}

// ── JSON parsing helper ─────────────────────────────────────────────────

interface StructuredResponse {
  reply: string;
  intent?: "informacao" | "agendamento" | "nao_encontrado";
  servico_id?: string;
  agendavel?: boolean;
  link_acesso?: string;
}

/**
 * Attempt to parse a JSON response from the model.
 * The model may wrap JSON in ```json fences or return it raw.
 * Returns null if parsing fails (meaning the response is plain text).
 */
function tryParseStructuredResponse(raw: string): StructuredResponse | null {
  // Strip markdown JSON fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  // Only attempt parse if it looks like JSON
  if (!cleaned.startsWith("{")) return null;

  try {
    const obj = JSON.parse(cleaned);
    if (typeof obj.reply === "string") {
      return {
        reply: obj.reply,
        intent: ["informacao", "agendamento", "nao_encontrado"].includes(obj.intent)
          ? obj.intent
          : undefined,
        servico_id: typeof obj.servico_id === "string" ? obj.servico_id : undefined,
        agendavel: typeof obj.agendavel === "boolean" ? obj.agendavel : undefined,
        link_acesso: typeof obj.link_acesso === "string" ? obj.link_acesso : undefined,
      };
    }
  } catch { /* not valid JSON, that's fine */ }

  return null;
}
