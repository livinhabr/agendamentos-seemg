import { askKnowledgeBaseOpenAI } from "./openai.ts";
import { logger } from "./logger.ts";

export interface ConversationState extends Record<string, unknown> {
  etapa?: string;
  current_parent_id?: string | null;
  servico_id?: string;
  servico_nome?: string;
  servico_sugerido_id?: string;
  servico_sugerido_nome?: string;
  aguardando_confirmacao_agendamento?: boolean;
  // Contexto do atendimento informativo (Q&A com documento)
  kb_contexto_servico_id?: string;
  kb_contexto_titulo?: string;
  kb_contexto_agendavel?: boolean;
  kb_contexto_link?: string;
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
    delete newState.servico_sugerido_id;
    delete newState.servico_sugerido_nome;
    delete newState.aguardando_confirmacao_agendamento;
    delete newState.kb_contexto_servico_id;
    delete newState.kb_contexto_titulo;
    delete newState.kb_contexto_agendavel;
    delete newState.kb_contexto_link;
    delete newState.dados_coletados;
  }

  // Helper to get root services (menus)
  const rootServices = context.servicos
    .filter((s) => !s.servico_pai_id)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  if (etapa === "inicio") {
    // ── Check if user is confirming a suggested schedulable service ──
    if (state.aguardando_confirmacao_agendamento && state.servico_sugerido_id) {
      const confirmWords = ["sim", "quero", "quero agendar", "sim quero agendar", "pode agendar", "quero marcar", "quero marcar horario", "quero marcar horário", "agendar", "ok", "pode ser", "vamos", "bora"];
      const negWords = ["nao", "não", "nope", "agora nao", "agora não", "depois", "talvez"];

      if (negWords.some((w) => lowerMsg === w || lowerMsg.startsWith(w))) {
        // User declined — clear suggestion, stay in inicio
        delete newState.servico_sugerido_id;
        delete newState.servico_sugerido_nome;
        delete newState.aguardando_confirmacao_agendamento;
        return {
          reply: "Tudo bem! Se precisar de mais alguma informação ou quiser agendar depois, é só me chamar.",
          conversation_state: newState,
        };
      }

      if (confirmWords.some((w) => lowerMsg === w || lowerMsg.includes(w))) {
        // User confirmed — start scheduling with the suggested service
        newState.servico_id = state.servico_sugerido_id;
        newState.servico_nome = state.servico_sugerido_nome;
        delete newState.servico_sugerido_id;
        delete newState.servico_sugerido_nome;
        delete newState.aguardando_confirmacao_agendamento;

        // If we already have the user's name, skip to email
        if (newState.dados_coletados?.nome) {
          newState.etapa = "pedindo_email";
          return {
            reply: `Claro! Vou agendar ${newState.servico_nome} para você, ${newState.dados_coletados.nome}.\n\nPor favor, informe seu e-mail para enviarmos a confirmação:`,
            conversation_state: newState,
          };
        }

        newState.etapa = "pedindo_nome";
        return {
          reply: `Claro! Vou agendar ${newState.servico_nome} para você.\n\nPara seguir, me informe seu nome completo:`,
          conversation_state: newState,
        };
      }
      // Not a clear confirm/deny — clear the suggestion flag and let AI handle normally
      delete newState.aguardando_confirmacao_agendamento;
    }

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

          // If AI identified a specific service, transition to informative Q&A
          if (aiResult.intent !== "nao_encontrado" && aiResult.servico_id) {
            const svcName = servicosMap[aiResult.servico_id] || "este serviço";
            newState.kb_contexto_servico_id = aiResult.servico_id;
            newState.kb_contexto_titulo = svcName;
            newState.kb_contexto_agendavel = !!aiResult.agendavel;
            newState.kb_contexto_link = aiResult.link_acesso || undefined;
            newState.etapa = "atendimento_informativo";

            if (aiResult.agendavel) {
              finalReply += "\n\nTem alguma dúvida sobre esse assunto? Se preferir, posso agendar um atendimento para você.";
            } else {
              finalReply += "\n\nTem alguma dúvida sobre esse assunto?";
            }
          } else if (
            aiResult.agendavel &&
            aiResult.intent !== "nao_encontrado" &&
            !finalReply.includes("agendar")
          ) {
            // agendavel but no servico_id — fallback
            finalReply +=
              "\n\nDeseja agendar um atendimento sobre esse assunto?";
          }

          return {
            reply: finalReply,
            conversation_state: newState,
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

    // If service is already pre-selected (e.g. from AI suggestion), skip service selection
    if (newState.servico_id) {
      newState.etapa = "pedindo_email";
      reply = `Muito prazer, ${nome}! Para podermos enviar as confirmações do agendamento de ${newState.servico_nome || "seu atendimento"}, por favor, informe seu e-mail:`;
    } else {
      newState.etapa = "escolhendo_servico";
      reply = `Muito prazer, ${nome}! Como posso ajudar você hoje?\n\nEscolha uma das opções abaixo digitando o número correspondente:\n`;
      rootServices.forEach((s, idx) => {
        reply += `${idx + 1}. ${s.nome}\n`;
      });
    }
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
  } else if (etapa === "atendimento_informativo") {
    // ── Conversational Q&A using the specific document ────────────────
    const scheduleWords = ["quero agendar", "pode agendar", "agendar", "quero marcar", "marcar horario", "marcar horário"];
    const doneWords = ["obrigado", "obrigada", "valeu", "é isso", "e isso", "era isso", "era só isso", "so isso", "só isso", "nao tenho", "não tenho", "sem duvida", "sem dúvida", "tudo certo", "ok obrigado", "ok obrigada"];

    // Check if user wants to schedule (only if service is schedulable)
    if (
      state.kb_contexto_agendavel &&
      state.kb_contexto_servico_id &&
      scheduleWords.some((w) => lowerMsg.includes(w))
    ) {
      newState.servico_id = state.kb_contexto_servico_id;
      newState.servico_nome = state.kb_contexto_titulo;
      delete newState.kb_contexto_servico_id;
      delete newState.kb_contexto_titulo;
      delete newState.kb_contexto_agendavel;
      delete newState.kb_contexto_link;

      if (newState.dados_coletados?.nome) {
        newState.etapa = "pedindo_email";
        return {
          reply: `Claro! Vou agendar ${newState.servico_nome} para você, ${newState.dados_coletados.nome}.\n\nPor favor, informe seu e-mail para enviarmos a confirmação:`,
          conversation_state: newState,
        };
      }

      newState.etapa = "pedindo_nome";
      return {
        reply: `Claro! Vou agendar ${newState.servico_nome} para você.\n\nPara seguir, me informe seu nome completo:`,
        conversation_state: newState,
      };
    }

    // Check if user is done / satisfied
    if (
      doneWords.some((w) => lowerMsg === w || lowerMsg.includes(w)) ||
      (lowerMsg === "nao" || lowerMsg === "não")
    ) {
      delete newState.kb_contexto_servico_id;
      delete newState.kb_contexto_titulo;
      delete newState.kb_contexto_agendavel;
      delete newState.kb_contexto_link;
      newState.etapa = "inicio";
      return {
        reply: "De nada! Se precisar de mais alguma informação ou quiser agendar um atendimento, é só me chamar. 😊",
        conversation_state: newState,
      };
    }

    // Answer the follow-up question using the specific document
    const kbEntry = (context.base_conhecimento ?? []).find(
      (e) => e.servico_id === state.kb_contexto_servico_id &&
             e.documento_status === "processado" &&
             e.documento_texto_extraido,
    );

    if (kbEntry) {
      // Build service name mapping
      const servicosMap: Record<string, string> = {};
      for (const svc of context.servicos) {
        if (svc.id && svc.nome) servicosMap[svc.id] = svc.nome;
      }

      const aiResult = await askKnowledgeBaseOpenAI(
        userMsg,
        [kbEntry],  // Only the relevant document
        servicosMap,
        null,  // No FAQ in follow-up mode
        logger,
        {
          nome: context.bot.nome as string | undefined,
          tom_de_voz: context.bot.tom_de_voz as string | undefined,
          saudacao_inicial: context.bot.saudacao_inicial as string | undefined,
        },
        context.setor ? { nome: context.setor.nome } : undefined,
      );

      if (aiResult.answered && aiResult.reply) {
        let followUpReply = aiResult.reply;

        // If user explicitly asks to schedule within their question
        if (aiResult.intent === "agendamento" && state.kb_contexto_agendavel) {
          newState.servico_id = state.kb_contexto_servico_id;
          newState.servico_nome = state.kb_contexto_titulo;
          delete newState.kb_contexto_servico_id;
          delete newState.kb_contexto_titulo;
          delete newState.kb_contexto_agendavel;
          delete newState.kb_contexto_link;
          newState.etapa = "pedindo_nome";
          return {
            reply: `${followUpReply}\n\nPara agendar, preciso de algumas informações. Qual é o seu nome?`,
            conversation_state: newState,
          };
        }

        // Continue in informative Q&A
        if (state.kb_contexto_agendavel) {
          followUpReply += "\n\nTem mais alguma dúvida ou deseja agendar um atendimento?";
        } else {
          followUpReply += "\n\nTem mais alguma dúvida sobre esse assunto?";
        }
        return {
          reply: followUpReply,
          conversation_state: newState,
        };
      }
    }

    // Couldn't answer from the specific document
    const topicName = state.kb_contexto_titulo || "este assunto";
    let cantAnswerReply = `Não encontrei essa informação específica no documento sobre ${topicName}.`;
    if (state.kb_contexto_agendavel) {
      cantAnswerReply += " Posso agendar um atendimento para que você tire essa dúvida diretamente. Deseja agendar?";
    } else {
      cantAnswerReply += " Tem outra pergunta que eu possa ajudar?";
      if (state.kb_contexto_link) {
        cantAnswerReply += `\n\nVocê também pode consultar: ${state.kb_contexto_link}`;
      }
    }
    return {
      reply: cantAnswerReply,
      conversation_state: newState,
    };
  } else {
    reply =
      "Não entendi sua resposta ou estamos em um estado inválido. Por favor, digite 'oi' para recomeçar.";
  }

  return {
    reply,
    conversation_state: newState,
  };
}
