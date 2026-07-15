/**
 * Knowledge base AI helper — uses Azure OpenAI as primary, falls back to OpenAI.
 *
 * Priority:
 *   1. If AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY + AZURE_OPENAI_MODEL are set → use Azure
 *   2. Else if OPENAI_API_KEY is set → use legacy OpenAI
 *   3. Else → return { answered: false }
 *
 * NEVER logs API keys or tokens.
 */

import { callAzureAgent } from "./azureOpenAI.ts";

export interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface KnowledgeBaseEntry {
  id?: string;
  titulo?: string;
  agendavel?: boolean;
  link_acesso?: string;
  instrucoes_agente?: string;
  documento_texto_extraido?: string;
  documento_nome?: string;
  documento_status?: string;
  servico_id?: string;
}

export interface KnowledgeBaseResult {
  answered: boolean;
  reply?: string;
  agendavel?: boolean;
  link_acesso?: string;
  intent?: "informacao" | "agendamento" | "nao_encontrado";
  servico_id?: string;
}

// ── Format knowledge base for prompt ────────────────────────────────────

function formatKnowledgeBase(
  entries: KnowledgeBaseEntry[],
  servicosMap: Record<string, string>,
): string {
  if (entries.length === 0) return "";

  const lines: string[] = ["=== BASE DE CONHECIMENTO OFICIAL POR SERVIÇO ===\n"];

  for (const entry of entries) {
    const servicoNome = entry.servico_id
      ? (servicosMap[entry.servico_id] || entry.titulo || "Serviço")
      : (entry.titulo || "Geral");

    lines.push(`━━━ SERVIÇO: ${servicoNome} (id: ${entry.servico_id || "geral"}) ━━━`);

    if (entry.agendavel) {
      lines.push(`Agendável: SIM (o usuário pode agendar atendimento sobre este serviço)`);
    } else {
      lines.push(`Agendável: NÃO (apenas orientação, NÃO oferecer agendamento)`);
    }

    if (entry.link_acesso) {
      lines.push(`Link oficial: ${entry.link_acesso}`);
    }

    if (entry.instrucoes_agente) {
      lines.push(`Instruções para o agente: ${entry.instrucoes_agente}`);
    }

    if (entry.documento_texto_extraido) {
      lines.push(`\nDOCUMENTO OFICIAL (${entry.documento_nome || "documento"}):`);
      lines.push(entry.documento_texto_extraido);
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ── System prompt builder ───────────────────────────────────────────────

function buildSystemPrompt(
  kbText: string,
  faqText: string | null,
  botContext?: { nome?: string; tom_de_voz?: string; saudacao_inicial?: string },
  setorContext?: { nome?: string },
): string {
  let referenceDoc = "";
  if (kbText) referenceDoc += kbText + "\n";
  if (faqText) referenceDoc += "\n=== PERGUNTAS FREQUENTES (FAQ) ===\n" + faqText + "\n";

  const setorNome = setorContext?.nome || "Setor";
  const botNome = botContext?.nome || "Assistente";

  return `Você é ${botNome}, o agente de atendimento da Agenda Setorial SEE-MG, setor "${setorNome}".
${botContext?.tom_de_voz ? `Tom de voz: ${botContext.tom_de_voz}` : "Seja educado, claro e conciso."}

REGRAS OBRIGATÓRIAS:
1. Responda EXCLUSIVAMENTE com base nas informações cadastradas pelo gestor (documentos oficiais, links, instruções) fornecidas abaixo.
2. NÃO invente informações. Se não encontrar a resposta nos documentos, responda com intent "nao_encontrado".
3. Respeite as instruções específicas de cada serviço.

REGRAS SOBRE AGENDAMENTO:
- Se o serviço for Agendável: NÃO → responda a orientação, NÃO ofereça agendamento. Intent: "informacao".
- Se o serviço for Agendável: SIM → responda a orientação e, se fizer sentido, pergunte se o usuário deseja agendar. Intent: "informacao".
- Se o usuário pedir EXPLICITAMENTE para agendar → NÃO invente horário. Retorne intent: "agendamento".

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):
Responda SEMPRE em JSON válido com esta estrutura:
{
  "reply": "sua resposta ao usuário aqui",
  "intent": "informacao" | "agendamento" | "nao_encontrado",
  "servico_id": "id do serviço encontrado ou null",
  "agendavel": true ou false,
  "link_acesso": "link oficial se houver ou null"
}

Exemplos de intent:
- "informacao": respondeu dúvida com base no documento
- "agendamento": usuário quer agendar (não responda com horários, apenas confirme a intenção)
- "nao_encontrado": não achou informação na base

DOCUMENTOS DE REFERÊNCIA:
${referenceDoc}`;
}

// ── Main function ───────────────────────────────────────────────────────

export async function askKnowledgeBaseOpenAI(
  userMessage: string,
  kbEntries: KnowledgeBaseEntry[],
  servicosMap: Record<string, string>,
  faqText: string | null,
  logger: Logger,
  botContext?: { nome?: string; tom_de_voz?: string; saudacao_inicial?: string },
  setorContext?: { nome?: string },
): Promise<KnowledgeBaseResult> {
  const kbText = formatKnowledgeBase(kbEntries, servicosMap);

  if (!kbText && !faqText) {
    return { answered: false };
  }

  const systemPrompt = buildSystemPrompt(kbText, faqText, botContext, setorContext);

  // ── Try Azure first ─────────────────────────────────────────────────
  const azureConfigured = !!(
    Deno.env.get("AZURE_OPENAI_ENDPOINT") &&
    Deno.env.get("AZURE_OPENAI_API_KEY") &&
    Deno.env.get("AZURE_OPENAI_MODEL")
  );

  if (azureConfigured) {
    logger.info({}, "Using Azure OpenAI for knowledge base query");

    const azureResult = await callAzureAgent(
      {
        systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        temperature: 0.2,
        maxTokens: 700,
      },
      logger,
    );

    if (azureResult.ok) {
      // Handle "nao_encontrado" intent
      if (azureResult.intent === "nao_encontrado") {
        return {
          answered: true,
          reply: azureResult.reply || "Não encontrei essa informação na base cadastrada para este setor. Recomendo entrar em contato com o atendimento responsável.",
          agendavel: false,
          intent: "nao_encontrado",
        };
      }

      // Handle "agendamento" intent
      if (azureResult.intent === "agendamento") {
        return {
          answered: true,
          reply: azureResult.reply,
          intent: "agendamento",
          servico_id: azureResult.servico_id,
          agendavel: true,
        };
      }

      // Handle "informacao" intent (default)
      return {
        answered: true,
        reply: azureResult.reply,
        agendavel: azureResult.agendavel,
        link_acesso: azureResult.link_acesso,
        intent: azureResult.intent || "informacao",
        servico_id: azureResult.servico_id,
      };
    }

    // Azure failed but we may have OpenAI fallback
    logger.warn({ error: azureResult.error }, "Azure OpenAI failed, checking fallback");
  }

  // ── Fallback to legacy OpenAI ────────────────────────────────────────
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    if (azureConfigured) {
      // Azure was configured but failed
      return {
        answered: true,
        reply: "Desculpe, o assistente está temporariamente indisponível. Tente novamente em instantes.",
        intent: "nao_encontrado",
      };
    }
    logger.warn({}, "No AI provider configured (Azure or OpenAI)");
    return { answered: false };
  }

  logger.info({}, "Using legacy OpenAI fallback for knowledge base query");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, data: errText.substring(0, 200) }, "OpenAI API returned error");
      return { answered: false };
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "";

    if (!rawContent) return { answered: false };

    // Try to parse JSON response
    const parsed = tryParseJSON(rawContent);
    if (parsed) {
      return {
        answered: true,
        reply: parsed.reply || rawContent,
        agendavel: parsed.agendavel,
        link_acesso: parsed.link_acesso,
        intent: parsed.intent || "informacao",
        servico_id: parsed.servico_id,
      };
    }

    // Plain text fallback
    return {
      answered: true,
      reply: rawContent,
      intent: "informacao",
    };
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMessage }, "Exception calling OpenAI API");
    return { answered: false };
  }
}

// ── JSON parse helper ───────────────────────────────────────────────────

function tryParseJSON(raw: string): {
  reply: string;
  intent?: "informacao" | "agendamento" | "nao_encontrado";
  servico_id?: string;
  agendavel?: boolean;
  link_acesso?: string;
} | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  if (!cleaned.startsWith("{")) return null;
  try {
    const obj = JSON.parse(cleaned);
    if (typeof obj.reply === "string") return obj;
  } catch { /* not JSON */ }
  return null;
}

/**
 * Legacy function kept for backward compatibility.
 */
export async function askFAQOpenAI(
  userMessage: string,
  faqText: string,
  logger: Logger,
): Promise<{ answered: boolean; reply?: string }> {
  const result = await askKnowledgeBaseOpenAI(userMessage, [], {}, faqText, logger);
  return { answered: result.answered, reply: result.reply };
}
