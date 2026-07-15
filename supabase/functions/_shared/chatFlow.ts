import { askKnowledgeBaseOpenAI } from "./openai.ts";
import { logger } from "./logger.ts";

export interface ConversationState extends Record<string, unknown> {
  etapa?: string;
  current_parent_id?: string | null;
  servico_id?: string;
  servico_nome?: string;
  dados_coletados?: {
    nome?: string;
    nome_completo?: string;
    email?: string;
  };
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

export interface ChatPayload {
  message: string;
  user?: { name?: string; email?: string };
  history: unknown[];
  conversation: {
    id: string | null;
    session_id: string;
    status: string;
    state: ConversationState;
  };
  context: {
    bot: {
      saudacao_inicial?: string;
      nome?: string;
      tom_de_voz?: string;
      [key: string]: unknown;
    };
    setor?: { id?: string; nome?: string; slug?: string };
    servicos: {
      id?: string;
      nome?: string;
      tipo?: string;
      descricao_para_usuario?: string;
      servico_pai_id?: string | null;
      ordem?: number;
      [key: string]: unknown;
    }[];
    perguntas_respostas?: { texto?: string; [key: string]: unknown } | null;
    atendentes?: { [key: string]: unknown }[];
    base_conhecimento?: KnowledgeBaseEntry[];
  };
  availability_context?: unknown;
}

export interface ChatResponse {
  reply: string;
  conversation_state: ConversationState;
}

export async function processChatFlow(
  payload: ChatPayload,
): Promise<ChatResponse> {
  const { message, conversation, context } = payload;
  const state = conversation.state || {};
  let etapa = state.etapa || "inicio";
  let reply = "";
  const newState: ConversationState = { ...state };
  const userMsg = message.trim();

  // Reset if user says "oi" or "olá" etc when stuck
  const lowerMsg = userMsg.toLowerCase();
  if (lowerMsg === "oi" || lowerMsg === "ola" || lowerMsg === "olá") {
    etapa = "inicio";
    newState.etapa = "inicio";
    delete newState.current_parent_id;
    delete newState.servico_id;
    delete newState.servico_nome;
    delete newState.dados_coletados;
  }

  // Helper to get root services (menus)
  const rootServices = context.servicos
    .filter((s) => !s.servico_pai_id)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  if (etapa === "inicio") {
    // ── AI-powered response using knowledge base ──────────────────────
    if (lowerMsg !== "oi" && lowerMsg !== "ola" && lowerMsg !== "olá") {
      // Filter KB entries that have processed documents
      const kbEntries = (context.base_conhecimento ?? []).filter(
        (e) =>
          e.documento_status === "processado" && e.documento_texto_extraido,
      );
      const faqText = context.perguntas_respostas?.texto;

      // Build service name mapping
      const servicosMap: Record<string, string> = {};
      for (const svc of context.servicos) {
        if (svc.id && svc.nome) servicosMap[svc.id] = svc.nome;
      }

      if (kbEntries.length > 0 || faqText) {
        logger.info(
          { kb_entries: kbEntries.length, has_faq: !!faqText },
          "Checking knowledge base via AI agent",
        );

        const aiResult = await askKnowledgeBaseOpenAI(
          userMsg,
          kbEntries,
          servicosMap,
          faqText || null,
          logger,
          // Pass bot & setor context for personalized responses
          {
            nome: context.bot.nome as string | undefined,
            tom_de_voz: context.bot.tom_de_voz as string | undefined,
            saudacao_inicial: context.bot.saudacao_inicial as string | undefined,
          },
          context.setor
            ? { nome: context.setor.nome }
            : undefined,
        );

        if (aiResult.answered && aiResult.reply) {
          // ── Intent: "agendamento" → redirect to scheduling flow ────
          if (aiResult.intent === "agendamento") {
            // If the AI identified a specific service, pre-select it
            if (aiResult.servico_id) {
              const svc = context.servicos.find(
                (s) => s.id === aiResult.servico_id,
              );
              if (svc) {
                newState.servico_id = svc.id;
                newState.servico_nome = svc.nome;
                newState.etapa = "pedindo_nome";
                return {
                  reply: `${aiResult.reply}\n\nPara agendar, preciso de algumas informações. Qual é o seu nome?`,
                  conversation_state: newState,
                };
              }
            }
            // No specific service identified — ask user to choose
            newState.etapa = "pedindo_nome";
            return {
              reply: `${aiResult.reply}\n\nPara agendar, preciso de algumas informações. Qual é o seu nome?`,
              conversation_state: newState,
            };
          }

          // ── Intent: "informacao" or "nao_encontrado" ───────────────
          let finalReply = aiResult.reply;

          // Append link if available
          if (aiResult.link_acesso) {
            finalReply += `\n\nVocê também pode consultar: ${aiResult.link_acesso}`;
          }

          // If content is schedulable and the AI didn't already ask
          if (
            aiResult.agendavel &&
            aiResult.intent !== "nao_encontrado" &&
            !finalReply.includes("agendar")
          ) {
            finalReply +=
              "\n\nDeseja agendar um atendimento sobre esse assunto?";
          }

          return {
            reply: finalReply,
            conversation_state: newState, // stays in inicio
          };
        }
      }
    }

    // ── Default greeting (no AI match) ────────────────────────────────
    newState.etapa = "pedindo_nome";
    reply = `${context.bot.saudacao_inicial || "Olá!"}\n\nPara começarmos, por favor, me diga o seu nome:`;
  } else if (etapa === "pedindo_nome") {
    const nome = userMsg;
    newState.dados_coletados = {
      ...(newState.dados_coletados || {}),
      nome,
      nome_completo: nome,
    };
    newState.etapa = "escolhendo_servico";

    reply = `Muito prazer, ${nome}! Como posso ajudar você hoje?\n\nEscolha uma das opções abaixo digitando o número correspondente:\n`;
    rootServices.forEach((s, idx) => {
      reply += `${idx + 1}. ${s.nome}\n`;
    });
  } else if (etapa === "escolhendo_servico") {
    const currentParentId = state.current_parent_id || null;
    const currentOptions = context.servicos
      .filter((s) => s.servico_pai_id === currentParentId)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    const optionIdx = parseInt(userMsg, 10) - 1;

    if (
      isNaN(optionIdx) ||
      optionIdx < 0 ||
      optionIdx >= currentOptions.length + (currentParentId ? 1 : 0)
    ) {
      if (
        currentParentId &&
        parseInt(userMsg, 10) === currentOptions.length + 1
      ) {
        newState.current_parent_id = null;
        reply = `Retornando ao menu principal...\n\nEscolha uma opção:\n`;
        rootServices.forEach((s, idx) => {
          reply += `${idx + 1}. ${s.nome}\n`;
        });
      } else {
        reply =
          "Opção inválida. Por favor, digite apenas o número correspondente à opção desejada.";
      }
    } else {
      if (
        currentParentId &&
        parseInt(userMsg, 10) === currentOptions.length + 1
      ) {
        newState.current_parent_id = null;
        reply = `Retornando ao menu principal...\n\nEscolha uma opção:\n`;
        rootServices.forEach((s, idx) => {
          reply += `${idx + 1}. ${s.nome}\n`;
        });
      } else {
        const selected = currentOptions[optionIdx];
        if (selected.tipo === "menu") {
          newState.current_parent_id = selected.id;
          const subOptions = context.servicos
            .filter((s) => s.servico_pai_id === selected.id)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

          reply = `${selected.descricao_para_usuario || `Opções para ${selected.nome}`}\n\n`;
          subOptions.forEach((s, idx) => {
            reply += `${idx + 1}. ${s.nome}\n`;
          });
          reply += `${subOptions.length + 1}. Voltar ao menu anterior\n`;
        } else {
          newState.servico_id = selected.id;
          newState.servico_nome = selected.nome;
          newState.etapa = "pedindo_email";
          reply = `Ótima escolha! Para podermos enviar as confirmações do agendamento, por favor, informe seu e-mail:`;
        }
      }
    }
  } else if (etapa === "pedindo_email") {
    if (!userMsg.includes("@") || !userMsg.includes(".")) {
      reply =
        "Este e-mail parece inválido. Por favor, digite um e-mail válido (exemplo: seu.nome@email.com):";
    } else {
      newState.dados_coletados = {
        ...(newState.dados_coletados || {}),
        email: userMsg,
      };
      newState.etapa = "confirmando_retomada";
      reply = `Perfeito!\n\nSeus dados informados:\nNome: ${newState.dados_coletados.nome}\nE-mail: ${newState.dados_coletados.email}\n\n1. Prosseguir e escolher data/horário\n2. Voltar e corrigir`;
    }
  } else if (etapa === "confirmando_retomada") {
    if (userMsg === "1") {
      newState.etapa = "aguardando_horario";
      reply = `A próxima etapa será consultar e escolher um horário disponível para o atendimento.`;
    } else if (userMsg === "2") {
      newState.etapa = "inicio";
      delete newState.dados_coletados;
      delete newState.servico_id;
      reply = "Tudo bem, vamos recomeçar. Qual é o seu nome?";
    } else {
      reply =
        "Opção inválida. Digite 1 para prosseguir ou 2 para corrigir os dados.";
    }
  } else {
    reply =
      "Não entendi sua resposta ou estamos em um estado inválido. Por favor, digite 'oi' para recomeçar.";
  }

  return {
    reply,
    conversation_state: newState,
  };
}
