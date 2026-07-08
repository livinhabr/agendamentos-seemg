export interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export async function askFAQOpenAI(
  userMessage: string,
  faqText: string,
  logger: Logger
): Promise<{ answered: boolean; reply?: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    logger.warn({}, "OPENAI_API_KEY not set, skipping AI FAQ.");
    return { answered: false };
  }

  // System prompt to instruct the AI
  const systemPrompt = `Você é um assistente virtual de atendimento ao cidadão para agendamento de serviços públicos.
Seu objetivo é responder dúvidas do usuário baseando-se EXCLUSIVAMENTE no documento fornecido abaixo.
Se a dúvida do usuário não for respondida pelo documento, ou se o usuário expressar claramente a intenção de agendar um serviço, responda EXATAMENTE com a string: "__INTENCAO_AGENDAMENTO__".
Seja educado, claro e conciso. Não invente informações.

DOCUMENTO DE REFERÊNCIA:
${faqText}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // or gpt-3.5-turbo if you prefer
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, data: errText }, "OpenAI API returned error");
      return { answered: false };
    }

    const data = await response.json();
    const aiReply = data.choices[0]?.message?.content?.trim() || "";

    if (aiReply === "__INTENCAO_AGENDAMENTO__" || aiReply.includes("__INTENCAO_AGENDAMENTO__")) {
      return { answered: false };
    }

    return { answered: true, reply: aiReply };
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMessage }, "Exception calling OpenAI API");
    return { answered: false };
  }
}
