import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabaseAdmin } from "../supabase";
import { env } from "../env";
import { createCalendarEvent, checkCalendarAvailability } from "../services/googleCalendar";

const chatSchema = z.object({
  setor_slug: z.string(),
  bot_slug: z.string(),
  canal_id: z.string().uuid(),
  session_id: z.string(),
  message: z.string(),
  user: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
});

const MOCK_REPLY = "Recebi sua mensagem. Em breve este chat será conectado ao fluxo de agendamento.";
const N8N_FALLBACK_REPLY = "Recebi sua mensagem, mas ainda não consegui gerar uma resposta do fluxo de atendimento.";
const N8N_ERROR_REPLY = "Não consegui conectar ao fluxo de atendimento neste momento. Tente novamente em instantes.";

/** Helper: run a supplementary Supabase query; on failure log safely and return []. */
async function safeQuery<T>(
  label: string,
  queryFn: () => PromiseLike<{ data: T[] | null; error: any }>,
  logger: FastifyInstance["log"],
): Promise<T[]> {
  try {
    const { data, error } = await queryFn();
    if (error) {
      logger.warn({ context_query: label, code: error.code }, "Context query returned error – sending empty array");
      return [];
    }
    return data ?? [];
  } catch (err: any) {
    logger.warn({ context_query: label, err: err.message }, "Context query threw – sending empty array");
    return [];
  }
}

// ── Conversation persistence helpers ─────────────────────────────────────

interface ConversaRecord {
  id: string;
  status: string;
  estado_json: Record<string, unknown>;
  nome_usuario?: string;
  email_usuario?: string;
}

interface MensagemRecord {
  papel: string;
  conteudo: string;
  created_at: string;
}

/**
 * Find an existing open conversation for the given session/bot/canal combo,
 * or create a new one. Returns the conversation record, or null on failure.
 */
async function findOrCreateConversa(
  sessionId: string,
  botId: string,
  canalId: string,
  userName: string | undefined,
  userEmail: string | undefined,
  logger: FastifyInstance["log"],
): Promise<ConversaRecord | null> {
  try {
    // Try to find an existing open conversation
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("conversas_chat")
      .select("id, status, estado_json, nome_usuario, email_usuario")
      .eq("external_user_id", sessionId)
      .eq("bot_id", botId)
      .eq("canal_widget_id", canalId)
      .eq("status", "aberta")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr) {
      logger.warn({ op: "find_conversa", code: findErr.code }, "Failed to find existing conversation");
    }

    if (existing) {
      return existing as ConversaRecord;
    }

    // Create a new conversation
    const { data: created, error: createErr } = await supabaseAdmin
      .from("conversas_chat")
      .insert({
        bot_id: botId,
        canal_widget_id: canalId,
        external_user_id: sessionId,
        nome_usuario: userName ?? null,
        email_usuario: userEmail ?? null,
        status: "aberta",
        contexto_json: {},
        estado_json: {},
      })
      .select("id, status, estado_json, nome_usuario, email_usuario")
      .single();

    if (createErr || !created) {
      logger.warn({ op: "create_conversa", code: createErr?.code }, "Failed to create conversation");
      return null;
    }

    logger.info({ conversa_id: created.id }, "New conversation created");
    return created as ConversaRecord;
  } catch (err: any) {
    logger.warn({ op: "find_or_create_conversa", err: err.message }, "Conversation persistence threw");
    return null;
  }
}

/**
 * Save a single message to mensagens_chat.
 * Fails silently — never breaks the chat flow.
 */
async function saveMessage(
  conversaId: string,
  papel: "usuario" | "assistente",
  conteudo: string,
  metadados: Record<string, unknown>,
  logger: FastifyInstance["log"],
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("mensagens_chat")
      .insert({
        conversa_id: conversaId,
        papel,
        conteudo,
        metadados,
      });

    if (error) {
      logger.warn({ op: "save_message", papel, code: error.code }, "Failed to save message");
    }
  } catch (err: any) {
    logger.warn({ op: "save_message", papel, err: err.message }, "Save message threw");
  }
}

/**
 * Save conversation state (estado_json) after n8n returns a new state.
 * Fails silently — never breaks the chat flow.
 */
async function saveConversationState(
  conversaId: string,
  state: Record<string, unknown>,
  logger: FastifyInstance["log"],
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("conversas_chat")
      .update({ estado_json: state, updated_at: new Date().toISOString() })
      .eq("id", conversaId);

    if (error) {
      logger.warn({ op: "save_state", code: error.code }, "Failed to save conversation state");
    }
  } catch (err: any) {
    logger.warn({ op: "save_state", err: err.message }, "Save conversation state threw");
  }
}

/**
 * Fetch the last N messages for a conversation, oldest-first.
 */
async function fetchHistory(
  conversaId: string,
  limit: number,
  logger: FastifyInstance["log"],
): Promise<{ role: "user" | "assistant"; content: string; created_at: string }[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("mensagens_chat")
      .select("papel, conteudo, created_at")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn({ op: "fetch_history", code: error.code }, "Failed to fetch message history");
      return [];
    }

    // Reverse to oldest-first and map papel → role
    return (data ?? []).reverse().map((m: MensagemRecord) => ({
      role: m.papel === "usuario" ? "user" as const : "assistant" as const,
      content: m.conteudo,
      created_at: m.created_at,
    }));
  } catch (err: any) {
    logger.warn({ op: "fetch_history", err: err.message }, "Fetch history threw");
    return [];
  }
}

// ── Availability context builder ─────────────────────────────────────────

interface AvailabilityContext {
  servico: Record<string, unknown> | null;
  atendentes_servico: Record<string, unknown>[];
  calendarios: Record<string, unknown>[];
  janelas_atendimento: Record<string, unknown>[];
  excecoes_atendimento: Record<string, unknown>[];
  agendamentos_existentes: Record<string, unknown>[];
  can_schedule: boolean;
  reason: string | null;
}

/**
 * Build availability context for a selected service.
 * Returns null when no servico_id is present in conversation state.
 * Never throws — failures are logged and result in empty arrays.
 */
async function buildAvailabilityContext(
  servicoId: string | undefined | null,
  setorId: string,
  logger: FastifyInstance["log"],
): Promise<AvailabilityContext | null> {
  if (!servicoId) return null;

  // A. Fetch the selected service
  let servico: Record<string, unknown> | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("servicos_agendamento")
      .select("id, nome, tipo, servico_pai_id, duracao_minutos, intervalo_slots_minutos, antecedencia_minima_horas, antecedencia_maxima_dias, local_atendimento, instrucoes_confirmacao, ativo, calendario_id")
      .eq("id", servicoId)
      .maybeSingle();
    if (error) {
      logger.warn({ op: "avail_servico", code: error.code }, "Failed to fetch selected service");
    } else {
      servico = data;
    }
  } catch (err: any) {
    logger.warn({ op: "avail_servico", err: err.message }, "Fetch selected service threw");
  }

  // If service not found or inactive
  if (!servico) {
    return {
      servico: null,
      atendentes_servico: [],
      calendarios: [],
      janelas_atendimento: [],
      excecoes_atendimento: [],
      agendamentos_existentes: [],
      can_schedule: false,
      reason: "Serviço não encontrado.",
    };
  }

  // If it's a menu (not schedulable)
  if (servico.tipo === "menu") {
    return {
      servico,
      atendentes_servico: [],
      calendarios: [],
      janelas_atendimento: [],
      excecoes_atendimento: [],
      agendamentos_existentes: [],
      can_schedule: false,
      reason: "Este item é um menu/assunto e não permite agendamento direto. Escolha um subserviço.",
    };
  }

  if (!servico.ativo) {
    return {
      servico,
      atendentes_servico: [],
      calendarios: [],
      janelas_atendimento: [],
      excecoes_atendimento: [],
      agendamentos_existentes: [],
      can_schedule: false,
      reason: "Este serviço está inativo no momento.",
    };
  }

  const today = new Date().toISOString();

  // B–E. Fetch related data in parallel (all resilient)
  const [atendentes_servico, calendarios, janelas_atendimento, excecoes_atendimento, agendamentos_existentes] = await Promise.all([
    // B. Attendants linked to this service
    safeQuery("avail_atendentes_servico", () =>
      supabaseAdmin
        .from("atendentes_servicos")
        .select("atendente_id, servico_id, ativo")
        .eq("servico_id", servicoId)
        .eq("ativo", true),
      logger,
    ).then(async (links) => {
      if (links.length === 0) return [];
      const attendantIds = links.map((l: any) => l.atendente_id);
      return safeQuery("avail_atendentes_detail", () =>
        supabaseAdmin
          .from("atendentes")
          .select("id, nome, email, cargo, calendario_id, ativo")
          .in("id", attendantIds)
          .eq("ativo", true),
        logger,
      );
    }),

    // C. Sector calendars
    safeQuery("avail_calendarios", () =>
      supabaseAdmin
        .from("calendarios_setor")
        .select("id, nome, google_calendar_id, modo_conexao, status_conexao, ativo")
        .eq("setor_id", setorId)
        .eq("ativo", true),
      logger,
    ),

    // D. Schedule windows (filtered by setor; also by servico if applicable)
    safeQuery("avail_janelas", () =>
      supabaseAdmin
        .from("janelas_atendimento")
        .select("id, dia_semana, tipo_janela, hora_inicio, hora_fim, timezone, atendente_id, servico_id, ativo")
        .eq("setor_id", setorId)
        .eq("ativo", true)
        .or(`servico_id.eq.${servicoId},servico_id.is.null`),
      logger,
    ),

    // E. Exceptions (future only)
    safeQuery("avail_excecoes", () =>
      supabaseAdmin
        .from("excecoes_atendimento")
        .select("id, data_inicio, data_fim, tipo, motivo, atendente_id, servico_id, ativo")
        .eq("setor_id", setorId)
        .eq("ativo", true)
        .gte("data_fim", today)
        .or(`servico_id.eq.${servicoId},servico_id.is.null`),
      logger,
    ),

    // F. Existing appointments for this service (to detect conflicts)
    safeQuery("avail_agendamentos", () =>
      supabaseAdmin
        .from("agendamentos")
        .select("id, inicio, fim, atendente_id, status")
        .eq("servico_id", servicoId)
        .gte("inicio", today)
        .in("status", ["confirmado", "pendente"]),
      logger,
    ),
  ]);

  // Determine if scheduling is possible
  let can_schedule = true;
  let reason: string | null = null;

  if (janelas_atendimento.length === 0) {
    can_schedule = false;
    reason = "Não há janelas de atendimento configuradas para este serviço.";
  } else if (atendentes_servico.length === 0) {
    can_schedule = false;
    reason = "Não há atendentes vinculados a este serviço.";
  } else if (calendarios.length === 0) {
    can_schedule = false;
    reason = "Não há calendários configurados para este setor.";
  }

  logger.info({
    servico_id: servicoId,
    atendentes: atendentes_servico.length,
    calendarios: calendarios.length,
    janelas: janelas_atendimento.length,
    excecoes: excecoes_atendimento.length,
    agendamentos: agendamentos_existentes.length,
    can_schedule,
  }, "Availability context built");

  return {
    servico,
    atendentes_servico,
    calendarios,
    janelas_atendimento,
    excecoes_atendimento,
    agendamentos_existentes,
    can_schedule,
    reason,
  };
}

// ── Slot generation engine ───────────────────────────────────────────────

interface Slot {
  id: number;
  inicio: string;
  fim: string;
  atendente_id: string;
  atendente_nome: string;
  atendente_email: string | null;
  calendario_id: string | null;
}

/**
 * Generate available time slots based on janelas_atendimento, excluding
 * exceptions and existing appointments. Pure computation — no Google Calendar.
 */
function generateAvailableSlots(
  avail: AvailabilityContext,
  maxDays: number = 14,
  maxSlots: number = 20,
): Slot[] {
  const servico = avail.servico;
  if (!servico) return [];

  const duracaoMin = (servico.duracao_minutos as number) || 30;
  const antecedenciaMinH = (servico.antecedencia_minima_horas as number) || 1;
  const antecedenciaMaxD = (servico.antecedencia_maxima_dias as number) || 30;
  const effectiveMaxDays = Math.min(maxDays, antecedenciaMaxD);

  const now = new Date();
  const minTime = new Date(now.getTime() + antecedenciaMinH * 60 * 60 * 1000);

  // Map atendentes to their calendario_id and email
  const atendenteMap = new Map<string, { nome: string; email: string | null; calendario_id: string | null }>();
  for (const att of avail.atendentes_servico) {
    const a = att as any;
    atendenteMap.set(a.id, { nome: a.nome, email: a.email ?? null, calendario_id: a.calendario_id ?? null });
  }

  // Build a set of attendant IDs linked to this service
  const linkedAttendantIds = new Set(atendenteMap.keys());

  // If there's a service-level calendario_id, use it as fallback
  const servicoCalendarioId = (servico.calendario_id as string) ?? null;
  // Use first calendar from sector as last fallback
  const sectorCalendarioId = avail.calendarios.length > 0
    ? (avail.calendarios[0] as any).id as string
    : null;

  // Parse exceptions into intervals for quick overlap check
  const exceptions: { start: number; end: number; atendente_id: string | null }[] = [];
  for (const exc of avail.excecoes_atendimento) {
    const e = exc as any;
    if (e.tipo !== "bloqueio") continue;
    exceptions.push({
      start: new Date(e.data_inicio).getTime(),
      end: new Date(e.data_fim).getTime(),
      atendente_id: e.atendente_id ?? null,
    });
  }

  // Parse existing appointments for conflict detection
  const appointments: { start: number; end: number; atendente_id: string | null }[] = [];
  for (const apt of avail.agendamentos_existentes) {
    const a = apt as any;
    appointments.push({
      start: new Date(a.inicio).getTime(),
      end: new Date(a.fim).getTime(),
      atendente_id: a.atendente_id ?? null,
    });
  }

  function isBlocked(slotStart: number, slotEnd: number, atendenteId: string): boolean {
    // Check exceptions
    for (const exc of exceptions) {
      if (exc.atendente_id && exc.atendente_id !== atendenteId) continue;
      if (slotStart < exc.end && slotEnd > exc.start) return true;
    }
    // Check existing appointments
    for (const apt of appointments) {
      if (apt.atendente_id && apt.atendente_id !== atendenteId) continue;
      if (slotStart < apt.end && slotEnd > apt.start) return true;
    }
    return false;
  }

  // Generate slots day by day
  const slots: Slot[] = [];
  let slotId = 1;

  for (let dayOffset = 0; dayOffset <= effectiveMaxDays && slots.length < maxSlots; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);

    // JS getDay(): 0=Sunday ... 6=Saturday
    const jsDow = date.getDay();

    // Find matching janelas for this day of week
    // janelas_atendimento.dia_semana: check both conventions (0=Sun or 1=Mon)
    const matchingJanelas = avail.janelas_atendimento.filter((j: any) => {
      if (j.tipo_janela !== "trabalho") return false;
      // Support dia_semana as either 0-based (0=Sun) or 1-based (1=Mon)
      // Try matching both: dia_semana === jsDow OR dia_semana === (jsDow===0?7:jsDow)
      const d = j.dia_semana as number;
      return d === jsDow || d === (jsDow === 0 ? 7 : jsDow);
    });

    for (const janela of matchingJanelas) {
      const j = janela as any;

      // Determine which attendant this window is for
      // If janela has atendente_id, use it; otherwise generate for all linked attendants
      const targetAttendants: string[] = j.atendente_id
        ? (linkedAttendantIds.has(j.atendente_id) ? [j.atendente_id] : [])
        : [...linkedAttendantIds];

      // Parse window times (format "HH:MM:SS" or "HH:MM")
      const [startH, startM] = (j.hora_inicio as string).split(":").map(Number);
      const [endH, endM] = (j.hora_fim as string).split(":").map(Number);

      const windowStart = new Date(date);
      windowStart.setHours(startH, startM, 0, 0);

      const windowEnd = new Date(date);
      windowEnd.setHours(endH, endM, 0, 0);

      for (const atendenteId of targetAttendants) {
        let cursor = new Date(windowStart);

        while (cursor.getTime() + duracaoMin * 60_000 <= windowEnd.getTime() && slots.length < maxSlots) {
          const slotStart = cursor.getTime();
          const slotEnd = slotStart + duracaoMin * 60_000;

          // Skip past slots and respect antecedência mínima
          if (slotStart >= minTime.getTime() && !isBlocked(slotStart, slotEnd, atendenteId)) {
            const attInfo = atendenteMap.get(atendenteId);
            const calendarioId = servicoCalendarioId ?? attInfo?.calendario_id ?? sectorCalendarioId;

            slots.push({
              id: slotId++,
              inicio: new Date(slotStart).toISOString(),
              fim: new Date(slotEnd).toISOString(),
              atendente_id: atendenteId,
              atendente_nome: attInfo?.nome ?? "Atendente",
              atendente_email: attInfo?.email ?? null,
              calendario_id: calendarioId,
            });
          }

          // Advance by duration (slot-by-slot)
          cursor = new Date(cursor.getTime() + duracaoMin * 60_000);
        }
      }
    }
  }

  // Sort by start time
  slots.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

  return slots;
}

/**
 * Format a slot list into a human-readable message for the chat.
 */
function formatSlotsMessage(slots: Slot[]): string {
  if (slots.length === 0) {
    return "Não encontrei horários disponíveis nos próximos dias. Tente novamente mais tarde ou entre em contato com o setor.";
  }

  const lines = ["Encontrei estes horários disponíveis:\n"];
  for (const slot of slots) {
    const dt = new Date(slot.inicio);
    const dia = dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    const horaInicio = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const dtFim = new Date(slot.fim);
    const horaFim = dtFim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    lines.push(`${slot.id}. ${dia} — ${horaInicio} às ${horaFim}`);
  }
  lines.push("\nDigite o número do horário desejado.");
  return lines.join("\n");
}

// ── Route ────────────────────────────────────────────────────────────────

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.post("/api/chat", async (request, reply) => {
    try {
      const body = chatSchema.parse(request.body);

      // ── Validate setor (with extra fields for context) ──────────
      const { data: setor, error: errSetor } = await supabaseAdmin
        .from('setores')
        .select('id, nome, slug')
        .eq('slug', body.setor_slug)
        .eq('ativo', true)
        .single();
        
      if (errSetor || !setor) {
        return reply.status(400).send({ error: "Setor não encontrado ou inativo" });
      }

      // ── Validate bot (with extra fields for context) ────────────
      const { data: bot, error: errBot } = await supabaseAdmin
        .from('bots_agendamento')
        .select('id, nome, slug, saudacao_inicial, tom_de_voz, mensagem_fora_escopo, instrucoes_especificas')
        .eq('slug', body.bot_slug)
        .eq('setor_id', setor.id)
        .eq('ativo', true)
        .single();
        
      if (errBot || !bot) {
        return reply.status(400).send({ error: "Bot não encontrado ou inativo para este setor" });
      }
      
      // ── Validate canal ──────────────────────────────────────────
      const { data: canal, error: errCanal } = await supabaseAdmin
        .from('canais_widget')
        .select('id, nome')
        .eq('id', body.canal_id)
        .eq('bot_id', bot.id)
        .eq('ativo', true)
        .single();
        
      if (errCanal || !canal) {
        return reply.status(400).send({ error: "Canal do widget não encontrado, inativo ou não permitido" });
      }

      // Se permitido_embedar existir no banco, validar também
      if ('permitido_embedar' in canal && (canal as any).permitido_embedar === false) {
        return reply.status(400).send({ error: "Canal do widget não encontrado, inativo ou não permitido" });
      }

      // ── Fetch supplementary context (safe – never breaks the route) ──
      const [servicos, perguntas_respostas, campos_chat, atendentes] = await Promise.all([
        // 1. Serviços ativos do setor (vinculados ao bot atual ou sem vínculo de bot)
        safeQuery("servicos_agendamento", () =>
          supabaseAdmin
            .from("servicos_agendamento")
            .select("id, nome, categoria, descricao_curta, descricao_para_usuario, duracao_minutos, local_atendimento, instrucoes_confirmacao, ordem, servico_pai_id, tipo")
            .eq("setor_id", setor.id)
            .or(`bot_id.eq.${bot.id},bot_id.is.null`)
            .eq("ativo", true)
            .order("ordem", { ascending: true }),
          fastify.log,
        ),

        // 2. Perguntas frequentes ativas
        safeQuery("perguntas_respostas", () =>
          supabaseAdmin
            .from("perguntas_respostas")
            .select("id, categoria, pergunta, resposta, palavras_chave, ordem")
            .eq("bot_id", bot.id)
            .eq("ativo", true)
            .order("ordem", { ascending: true }),
          fastify.log,
        ),

        // 3. Campos ativos do chat
        safeQuery("campos_formulario_chat", () =>
          supabaseAdmin
            .from("campos_formulario_chat")
            .select("id, nome_campo, rotulo, tipo_campo, obrigatorio, opcoes_json, ordem")
            .eq("bot_id", bot.id)
            .eq("ativo", true)
            .order("ordem", { ascending: true }),
          fastify.log,
        ),

        // 4. Atendentes ativos do setor
        safeQuery("atendentes", () =>
          supabaseAdmin
            .from("atendentes")
            .select("id, nome, email, cargo")
            .eq("setor_id", setor.id)
            .eq("ativo", true),
          fastify.log,
        ),
      ]);

      // ── Conversation persistence (resilient) ───────────────────────
      const conversa = await findOrCreateConversa(
        body.session_id,
        bot.id,
        body.canal_id,
        body.user?.name,
        body.user?.email,
        fastify.log,
      );
      const conversaId = conversa?.id ?? null;

      // Save user message (fire-and-forget-safe: awaited but failures are swallowed)
      if (conversaId) {
        await saveMessage(conversaId, "usuario", body.message, {}, fastify.log);
      }

      // Fetch conversation history for n8n context
      const history = conversaId
        ? await fetchHistory(conversaId, 10, fastify.log)
        : [];

      // ── Build availability context (if service selected) ────────────
      const conversationState = (conversa?.estado_json ?? {}) as Record<string, unknown>;
      const selectedServicoId = conversationState.servico_id as string | undefined;
      const availability_context = await buildAvailabilityContext(
        selectedServicoId,
        setor.id,
        fastify.log,
      );

      // ── Short-circuit: slot generation when etapa = aguardando_horario ──
      if (conversationState.etapa === "aguardando_horario" && availability_context?.can_schedule) {
        fastify.log.info({ etapa: "aguardando_horario", servico_id: selectedServicoId }, "Generating available slots");

        const slots = generateAvailableSlots(availability_context);
        const replyText = formatSlotsMessage(slots);

        const newState: Record<string, unknown> = {
          ...conversationState,
          etapa: slots.length > 0 ? "escolhendo_horario" : "aguardando_horario",
          horarios_disponiveis: slots,
        };

        // Persist
        if (conversaId) {
          await saveMessage(conversaId, "assistente", replyText, {}, fastify.log);
          await saveConversationState(conversaId, newState, fastify.log);
        }

        return {
          reply: replyText,
          horarios: slots,
          conversation_id: conversaId ?? body.session_id,
          conversation_state: newState,
          status: "ok",
        };
      }

      // If etapa is aguardando_horario but can't schedule, inform user
      if (conversationState.etapa === "aguardando_horario" && availability_context && !availability_context.can_schedule) {
        const reason = availability_context.reason ?? "Não foi possível montar a agenda neste momento.";
        const newState: Record<string, unknown> = {
          ...conversationState,
          etapa: "erro_agenda",
        };

        if (conversaId) {
          await saveMessage(conversaId, "assistente", reason, {}, fastify.log);
          await saveConversationState(conversaId, newState, fastify.log);
        }

        return {
          reply: reason,
          conversation_id: conversaId ?? body.session_id,
          conversation_state: newState,
          status: "ok",
        };
      }

      // ── Short-circuit: selection when etapa = escolhendo_horario ──
      if (conversationState.etapa === "escolhendo_horario") {
        const slots = (conversationState.horarios_disponiveis || []) as Slot[];
        const userMsg = body.message.trim();
        const optionNum = parseInt(userMsg, 10);
        const selectedSlot = slots.find(s => s.id === optionNum);

        if (!selectedSlot) {
          const reason = "Não encontrei essa opção. Escolha um dos horários listados.";
          if (conversaId) {
            await saveMessage(conversaId, "assistente", reason, {}, fastify.log);
            // state remains the same
          }
          return {
            reply: reason,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: conversationState,
            status: "ok",
          };
        }

        // Slot selected successfully. Build confirmation reply.
        const dtInicio = new Date(selectedSlot.inicio);
        const dtFim = new Date(selectedSlot.fim);
        const dia = dtInicio.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
        const hora = `${dtInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} às ${dtFim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
        
        const servicoNome = availability_context?.servico?.nome ?? "Serviço";
        const nomeUsuario = conversa?.nome_usuario ?? body.user?.name ?? "Não informado";
        const emailUsuario = conversa?.email_usuario ?? body.user?.email ?? "Não informado";

        const replyText = `Resumo do Agendamento:

Nome: ${nomeUsuario}
E-mail: ${emailUsuario}
Serviço: ${servicoNome}
Data: ${dia}
Horário: ${hora}

Confirma este agendamento?
1. Confirmar
2. Escolher outro horário
3. Voltar ao menu principal`;

        const newState: Record<string, unknown> = {
          ...conversationState,
          etapa: "confirmando_agendamento",
          horario_selecionado: selectedSlot,
        };

        if (conversaId) {
          await saveMessage(conversaId, "assistente", replyText, {}, fastify.log);
          await saveConversationState(conversaId, newState, fastify.log);
        }

        return {
          reply: replyText,
          conversation_id: conversaId ?? body.session_id,
          conversation_state: newState,
          status: "ok",
        };
      }

      // ── Short-circuit: confirmation when etapa = confirmando_agendamento ──
      if (conversationState.etapa === "confirmando_agendamento") {
        const userMsg = body.message.trim().toLowerCase();
        
        // Prevent duplicate confirmation
        if (conversationState.agendamento_id) {
          const dt = new Date((conversationState.horario_selecionado as any).inicio);
          const replyText = `Seu agendamento já está confirmado para ${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
          return {
            reply: replyText,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: conversationState,
            status: "ok",
          };
        }

        if (userMsg === "1" || userMsg === "confirmar" || userMsg === "confirmo" || userMsg === "sim") {
          const selectedSlot = conversationState.horario_selecionado as Slot;
          
          if (!selectedSlot || !conversationState.servico_id) {
            const reason = "Ocorreu um erro ao recuperar seu horário. Por favor, escolha outra opção de horário.";
            return {
              reply: reason,
              conversation_id: conversaId ?? body.session_id,
              conversation_state: { ...conversationState, etapa: "aguardando_horario" },
              status: "ok",
            };
          }

          // 1. Local Conflict Check (Supabase)
          const { data: localConflicts, error: localConflictErr } = await supabaseAdmin
            .from("agendamentos")
            .select("id")
            .eq("calendario_id", selectedSlot.calendario_id)
            .lt("inicio", selectedSlot.fim)
            .gt("fim", selectedSlot.inicio)
            .in("status", ["pendente_google_calendar", "confirmado", "confirmado_localmente"]);

          if (localConflictErr) {
            fastify.log.error({ err: localConflictErr }, "Failed to check local conflicts");
          }

          if (localConflicts && localConflicts.length > 0) {
            fastify.log.warn({ slot: selectedSlot }, "Local conflict detected before insert.");
            
            const newState: Record<string, unknown> = {
              ...conversationState,
              etapa: "aguardando_horario",
            };
            delete newState.horario_selecionado;

            const replyText = "Esse horário acabou de ficar indisponível. Por favor, escolha outro horário.";

            if (conversaId) {
              await saveMessage(conversaId, "assistente", replyText, {}, fastify.log);
              await saveConversationState(conversaId, newState, fastify.log);
            }

            return {
              reply: replyText,
              conversation_id: conversaId ?? body.session_id,
              conversation_state: newState,
              status: "ok",
            };
          }

          // Determine the actual google_calendar_id
          const calDef = availability_context?.calendarios?.find((c: any) => c.id === selectedSlot.calendario_id) as any;
          const realGoogleCalendarId = calDef?.google_calendar_id;

          // 2. Google Calendar Conflict Check (FreeBusy)
          if (realGoogleCalendarId) {
            const gcalAvail = await checkCalendarAvailability({
              calendarId: realGoogleCalendarId,
              start: selectedSlot.inicio,
              end: selectedSlot.fim,
              timezone: "America/Sao_Paulo",
              logger: fastify.log,
            });

            if (!gcalAvail.available) {
              fastify.log.warn({ slot: selectedSlot, conflicts: gcalAvail.conflicts }, "Google Calendar conflict detected.");
              
              const newState: Record<string, unknown> = {
                ...conversationState,
                etapa: "conflito_horario",
              };
              delete newState.horario_selecionado;

              const replyText = "Esse horário acabou de ficar indisponível no calendário da equipe. Por favor, escolha outro horário.";

              if (conversaId) {
                await saveMessage(conversaId, "assistente", replyText, {}, fastify.log);
                await saveConversationState(conversaId, newState, fastify.log);
              }

              return {
                reply: replyText,
                conversation_id: conversaId ?? body.session_id,
                conversation_state: newState,
                status: "ok",
              };
            }
          }

          // Insert into public.agendamentos
          const nomeUsr = conversationState.dados_coletados ? (conversationState.dados_coletados as any).nome_completo || (conversationState.dados_coletados as any).nome : conversa?.nome_usuario;
          const emailUsr = conversationState.dados_coletados ? (conversationState.dados_coletados as any).email : conversa?.email_usuario;

          const { data: agendamento, error: insertErr } = await supabaseAdmin
            .from("agendamentos")
            .insert({
              setor_id: setor.id,
              bot_id: bot.id,
              servico_id: conversationState.servico_id as string,
              atendente_id: selectedSlot.atendente_id,
              calendario_id: selectedSlot.calendario_id,
              conversa_id: conversaId,
              nome_usuario: nomeUsr,
              email_usuario: emailUsr,
              inicio: selectedSlot.inicio,
              fim: selectedSlot.fim,
              status: "pendente_google_calendar",
            })
            .select("id")
            .single();

          if (insertErr || !agendamento) {
            fastify.log.error({ err: insertErr }, "Failed to insert local agendamento");
            const reason = "Ocorreu um erro ao registrar seu agendamento. Tente novamente.";
            return {
              reply: reason,
              conversation_id: conversaId ?? body.session_id,
              conversation_state: conversationState,
              status: "ok",
            };
          }

          // Call Google Calendar API
          let gcalStatus = "erro_google_calendar";
          let gcalEventId = null;

          if (realGoogleCalendarId) {
            const servicoNome = availability_context?.servico?.nome ?? "Serviço";
            
            // Collect unique attendees
            const attendeesSet = new Set<string>();
            if (emailUsr) attendeesSet.add(emailUsr);
            if (selectedSlot.atendente_email) attendeesSet.add(selectedSlot.atendente_email);
            
            const gcalResponse = await createCalendarEvent({
              calendarId: realGoogleCalendarId,
              summary: `Agendamento - ${servicoNome} - ${nomeUsr}`,
              description: `Nome: ${nomeUsr}\nE-mail: ${emailUsr}\nServiço: ${servicoNome}\nConversa ID: ${conversaId}\nAgendamento ID: ${agendamento.id}\nOrigem: Agenda Setorial SEE-MG`,
              start: selectedSlot.inicio,
              end: selectedSlot.fim,
              attendees: Array.from(attendeesSet),
              timezone: "America/Sao_Paulo",
              logger: fastify.log,
            });

            if (gcalResponse.eventId) {
              gcalStatus = "confirmado";
              gcalEventId = gcalResponse.eventId;
            }
          } else {
            fastify.log.warn({ agendamento_id: agendamento.id }, "No real google_calendar_id found, leaving pending.");
          }

          // Update local status
          await supabaseAdmin
            .from("agendamentos")
            .update({
              status: gcalStatus,
              google_event_id: gcalEventId,
            })
            .eq("id", agendamento.id);

          const dt = new Date(selectedSlot.inicio);
          const dia = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
          const hora = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          
          let replyText = `Agendamento confirmado com sucesso para ${dia} às ${hora}!`;
          let nextEtapa = "agendamento_confirmado";

          if (gcalStatus !== "confirmado") {
            replyText = "Recebi sua solicitação, mas não consegui concluir a confirmação no calendário neste momento. Nossa equipe poderá verificar ou você pode tentar novamente em instantes.";
            nextEtapa = "erro_confirmacao_agendamento";
          }

          const newState: Record<string, unknown> = {
            ...conversationState,
            etapa: nextEtapa,
            agendamento_id: agendamento.id,
            google_event_id: gcalEventId,
            servico_nome: availability_context?.servico?.nome,
          };

          if (conversaId) {
            await saveMessage(conversaId, "assistente", replyText, {}, fastify.log);
            await saveConversationState(conversaId, newState, fastify.log);
          }

          return {
            reply: replyText,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: newState,
            status: "ok",
          };
        } else if (userMsg === "2") {
          const newState: Record<string, unknown> = {
            ...conversationState,
            etapa: "aguardando_horario",
          };
          delete newState.horario_selecionado;

          const replyText = "Tudo bem, vou buscar outras opções de horário para você.";

          if (conversaId) {
            await saveMessage(conversaId, "assistente", replyText, {}, fastify.log);
            await saveConversationState(conversaId, newState, fastify.log);
          }

          return {
            reply: replyText,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: newState,
            status: "ok",
          };
        } else if (userMsg === "3") {
          const newState: Record<string, unknown> = {
            ...conversationState,
            etapa: "escolhendo_servico",
          };
          delete newState.servico_id;
          delete newState.servico_nome;
          delete newState.horario_selecionado;
          delete newState.assunto_atendimento;
          delete newState.horarios_disponiveis;

          const replyText = "Voltando ao menu principal. Por favor, digite 'oi' para ver as opções novamente.";

          if (conversaId) {
            await saveMessage(conversaId, "assistente", replyText, {}, fastify.log);
            await saveConversationState(conversaId, newState, fastify.log);
          }

          return {
            reply: replyText,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: newState,
            status: "ok",
          };
        } else {
          const reason = "Por favor, escolha uma das opções:\n1. Confirmar agendamento\n2. Escolher outro horário\n3. Voltar ao menu principal";
          if (conversaId) {
            await saveMessage(conversaId, "assistente", reason, {}, fastify.log);
          }
          return {
            reply: reason,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: conversationState,
            status: "ok",
          };
        }
      }

      // ── n8n integration (conditional) ──────────────────────────────
      // If N8N_CHAT_WEBHOOK_URL is not configured, return mock response
      if (!env.N8N_CHAT_WEBHOOK_URL) {
        return {
          reply: MOCK_REPLY,
          conversation_id: conversaId ?? body.session_id,
          status: "ok"
        };
      }

      // Build standardised payload for n8n
      const n8nPayload = {
        source: "agenda-setorial-preview",
        setor_slug: body.setor_slug,
        bot_slug: body.bot_slug,
        canal_id: body.canal_id,
        session_id: body.session_id,
        message: body.message,
        user: body.user,
        history,
        conversation: {
          id: conversaId,
          session_id: body.session_id,
          status: conversa?.status ?? "aberta",
          state: conversa?.estado_json ?? {},
        },
        context: {
          setor: {
            id: setor.id,
            nome: setor.nome,
            slug: setor.slug,
          },
          bot: {
            id: bot.id,
            nome: bot.nome,
            slug: bot.slug,
            saudacao_inicial: bot.saudacao_inicial,
            tom_de_voz: bot.tom_de_voz,
            mensagem_fora_escopo: bot.mensagem_fora_escopo,
            instrucoes_especificas: bot.instrucoes_especificas,
          },
          canal: {
            id: canal.id,
            nome: canal.nome,
          },
          servicos,
          perguntas_respostas,
          campos_chat,
          atendentes,
        },
        availability_context,
        request_meta: {
          origin: request.headers.origin || null,
        },
      };

      // Build headers for n8n request
      const n8nHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (env.N8N_SHARED_SECRET) {
        n8nHeaders["X-Agenda-Secret"] = env.N8N_SHARED_SECRET;
      }

      try {
        fastify.log.info("Calling n8n chat webhook");

        const n8nResponse = await fetch(env.N8N_CHAT_WEBHOOK_URL, {
          method: "POST",
          headers: n8nHeaders,
          body: JSON.stringify(n8nPayload),
          signal: AbortSignal.timeout(15_000), // 15s timeout
        });

        fastify.log.info({ status: n8nResponse.status }, "n8n response received");

        if (!n8nResponse.ok) {
          fastify.log.error({ status: n8nResponse.status }, "n8n returned non-OK status");
          return reply.status(502).send({
            reply: N8N_ERROR_REPLY,
            conversation_id: conversaId ?? body.session_id,
            status: "error",
          });
        }

        const n8nData = await n8nResponse.json() as Record<string, unknown>;

        // Normalise n8n response
        const replyText = typeof n8nData.reply === "string" && n8nData.reply.trim()
          ? n8nData.reply
          : N8N_FALLBACK_REPLY;

        // Save assistant reply (resilient)
        if (conversaId) {
          await saveMessage(conversaId, "assistente", replyText as string, {}, fastify.log);
        }

        // Persist conversation state returned by n8n (resilient)
        const newState = (n8nData.conversation_state ?? n8nData.state) as Record<string, unknown> | undefined;
        if (conversaId && newState && typeof newState === "object" && !Array.isArray(newState)) {
          await saveConversationState(conversaId, newState, fastify.log);
        }

        return {
          reply: replyText,
          conversation_id: conversaId ?? body.session_id,
          status: "ok",
        };

      } catch (n8nErr: any) {
        // n8n call failed — do NOT break the user experience
        fastify.log.error({ err: n8nErr.message }, "n8n webhook call failed");
        return reply.status(502).send({
          reply: N8N_ERROR_REPLY,
          conversation_id: conversaId ?? body.session_id,
          status: "error",
        });
      }

    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Payload inválido", details: err.errors });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: "Erro interno do servidor" });
    }
  });
}


