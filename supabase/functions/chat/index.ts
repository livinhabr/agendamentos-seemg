
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
import "@supabase/functions-js/edge-runtime.d.ts";
import { logger, Logger } from "../_shared/logger.ts";
import { z } from "zod";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { createCalendarEvent, checkCalendarAvailability } from "../_shared/googleCalendar.ts";
import { processChatFlow, ChatPayload } from "../_shared/chatFlow.ts";

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
  queryFn: () => PromiseLike<{ data: T[] | null; error: { code: string } | null }>,
  logger: Logger,
): Promise<T[]> {
  try {
    const { data, error } = await queryFn();
    if (error) {
      logger.warn({ context_query: label, code: error.code }, "Context query returned error – sending empty array");
      return [];
    }
    return data ?? [];
  } catch (err: unknown) {
    logger.warn({ context_query: label, err: err instanceof Error ? err.message : String(err) }, "Context query threw – sending empty array");
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
  logger: Logger,
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
  } catch (err: unknown) {
    logger.warn({ op: "find_or_create_conversa", err: err instanceof Error ? err.message : String(err) }, "Conversation persistence threw");
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
  logger: Logger,
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
  } catch (err: unknown) {
    logger.warn({ op: "save_message", papel, err: err instanceof Error ? err.message : String(err) }, "Save message threw");
  }
}

/**
 * Save conversation state (estado_json) after n8n returns a new state.
 * Fails silently — never breaks the chat flow.
 */
async function saveConversationState(
  conversaId: string,
  state: Record<string, unknown>,
  logger: Logger,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("conversas_chat")
      .update({ estado_json: state, updated_at: new Date().toISOString() })
      .eq("id", conversaId);

    if (error) {
      logger.warn({ op: "save_state", code: error.code }, "Failed to save conversation state");
    }
  } catch (err: unknown) {
    logger.warn({ op: "save_state", err: err instanceof Error ? err.message : String(err) }, "Save conversation state threw");
  }
}

/**
 * Fetch the last N messages for a conversation, oldest-first.
 */
async function fetchHistory(
  conversaId: string,
  limit: number,
  logger: Logger,
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
  } catch (err: unknown) {
    logger.warn({ op: "fetch_history", err: err instanceof Error ? err.message : String(err) }, "Fetch history threw");
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
  google_freebusy: { start: number; end: number; atendente_id: string }[];
  can_schedule: boolean;
  reason: string | null;
  bot_calendario_id: string | null;
}

/**
 * Build availability context for a selected service.
 * Returns null when no servico_id is present in conversation state.
 * Never throws — failures are logged and result in empty arrays.
 */
async function buildAvailabilityContext(
  servicoId: string | undefined | null,
  setorId: string,
  botCalendarioId: string | null,
  logger: Logger,
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
  } catch (err: unknown) {
    logger.warn({ op: "avail_servico", err: err instanceof Error ? err.message : String(err) }, "Fetch selected service threw");
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
      google_freebusy: [],
      can_schedule: false,
      reason: "Serviço não encontrado.",
      bot_calendario_id: botCalendarioId,
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
      google_freebusy: [],
      can_schedule: false,
      reason: "Este item é um menu/assunto e não permite agendamento direto. Escolha um subserviço.",
      bot_calendario_id: botCalendarioId,
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
      google_freebusy: [],
      can_schedule: false,
      reason: "Este serviço está inativo no momento.",
      bot_calendario_id: botCalendarioId,
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
      const attendantIds = links.map((l: Record<string, unknown>) => l.atendente_id as string);
      
      const { data: atendentes } = await supabaseAdmin
        .from("atendentes")
        .select("id, nome, email, cargo, calendario_id, ativo")
        .in("id", attendantIds)
        .eq("ativo", true);
        
      if (!atendentes || atendentes.length === 0) return [];
      
      // Filter by active Google Connections (include google_email)
      const { data: connections } = await supabaseAdmin
        .from("atendente_google_connections")
        .select("atendente_id, calendar_id, google_email")
        .in("atendente_id", attendantIds)
        .eq("status", "connected");
        
      const connMap = new Map<string, { calendar_id: string; google_email: string | null }>();
      if (connections) {
        connections.forEach(c => connMap.set(c.atendente_id, {
          calendar_id: c.calendar_id || "primary",
          google_email: c.google_email || null,
        }));
      }
      
      // Map to include the specific calendar_id and google_email for freebusy check
      return atendentes
        .filter(a => connMap.has(a.id))
        .map(a => {
          const conn = connMap.get(a.id)!;
          return { ...a, google_calendar_id: conn.calendar_id, google_email: conn.google_email };
        });
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
    safeQuery("avail_janelas", () => {
      let q = supabaseAdmin
        .from("janelas_atendimento")
        .select("id, dia_semana, tipo_janela, hora_inicio, hora_fim, timezone, atendente_id, servico_id, ativo")
        .eq("setor_id", setorId)
        .eq("ativo", true);
      if (servico?.servico_pai_id) {
        q = q.or(`servico_id.eq.${servicoId},servico_id.eq.${servico.servico_pai_id},servico_id.is.null`);
      } else {
        q = q.or(`servico_id.eq.${servicoId},servico_id.is.null`);
      }
      return q;
    }, logger),

    // E. Exceptions (future only)
    safeQuery("avail_excecoes", () => {
      let q = supabaseAdmin
        .from("excecoes_atendimento")
        .select("id, data_inicio, data_fim, tipo, motivo, atendente_id, servico_id, ativo")
        .eq("setor_id", setorId)
        .eq("ativo", true)
        .gte("data_fim", today);
      if (servico?.servico_pai_id) {
        q = q.or(`servico_id.eq.${servicoId},servico_id.eq.${servico.servico_pai_id},servico_id.is.null`);
      } else {
        q = q.or(`servico_id.eq.${servicoId},servico_id.is.null`);
      }
      return q;
    }, logger),

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

  // Aplicar fallback/hierarquia para janelas_atendimento
  let janelas_filtradas = janelas_atendimento;
  const attendantIds = new Set(atendentes_servico.map((a: Record<string, unknown>) => a.id as string));

  const j_servico = janelas_atendimento.filter((j: Record<string, unknown>) => j.servico_id === servicoId);
  const j_pai = janelas_atendimento.filter((j: Record<string, unknown>) => servico.servico_pai_id && j.servico_id === servico.servico_pai_id);
  const j_atendente = janelas_atendimento.filter((j: Record<string, unknown>) => j.servico_id === null && j.atendente_id && attendantIds.has(j.atendente_id as string));
  const j_gerais = janelas_atendimento.filter((j: Record<string, unknown>) => j.servico_id === null && j.atendente_id === null);

  if (j_servico.length > 0) janelas_filtradas = j_servico;
  else if (j_pai.length > 0) janelas_filtradas = j_pai;
  else if (j_atendente.length > 0) janelas_filtradas = j_atendente;
  else janelas_filtradas = j_gerais;

  // Determine if scheduling is possible
  let can_schedule = true;
  let reason: string | null = null;

  if (janelas_filtradas.length === 0) {
    can_schedule = false;
    reason = "Não há janelas de atendimento configuradas para este serviço.";
  } else if (atendentes_servico.length === 0) {
    can_schedule = false;
    reason = "Não há atendentes vinculados a este serviço.";
  } else if (calendarios.length === 0) {
    // Note: calendarios_setor might be empty if we rely entirely on atendente_google_connections,
    // so we should not fail if calendarios.length === 0. We'll just continue.
  }

  // Fetch Google Calendar FreeBusy for connected attendants
  const google_freebusy: { start: number; end: number; atendente_id: string }[] = [];
  if (can_schedule && atendentes_servico.length > 0) {
    const antecedenciaMinH = (servico.antecedencia_minima_horas as number) || 1;
    const maxDays = Math.min(14, (servico.antecedencia_maxima_dias as number) || 30);
    
    const minTime = new Date();
    minTime.setHours(minTime.getHours() + antecedenciaMinH);
    
    const maxTime = new Date();
    maxTime.setDate(maxTime.getDate() + maxDays + 1); // +1 to cover end of the last day
    
    for (const att of atendentes_servico) {
      const a = att as Record<string, unknown>;
      const gcalId = (a.google_calendar_id as string) || "primary";
      
      const fb = await checkCalendarAvailability({
        atendente_id: a.id as string,
        calendarId: gcalId,
        start: minTime.toISOString(),
        end: maxTime.toISOString(),
        timezone: "America/Sao_Paulo",
        logger,
      });
      
      if (fb.conflicts) {
        for (const conflict of fb.conflicts) {
          google_freebusy.push({
            start: new Date(conflict.start).getTime(),
            end: new Date(conflict.end).getTime(),
            atendente_id: a.id as string,
          });
        }
      }
    }
  }

  logger.info({
    servico_id: servicoId,
    atendentes: atendentes_servico.length,
    calendarios: calendarios.length,
    janelas: janelas_filtradas.length,
    excecoes: excecoes_atendimento.length,
    agendamentos: agendamentos_existentes.length,
    can_schedule,
  }, "Availability context built");

  return {
    servico,
    atendentes_servico,
    calendarios,
    janelas_atendimento: janelas_filtradas,
    excecoes_atendimento,
    agendamentos_existentes,
    google_freebusy,
    can_schedule,
    reason,
    bot_calendario_id: botCalendarioId,
  };
}

// ── Slot generation engine ───────────────────────────────────────────────

interface SlotAttendant {
  atendente_id: string;
  atendente_nome: string;
  atendente_email: string | null;
  calendario_id: string | null;
  google_email: string | null;
  oauth_calendar_id: string;
}

interface Slot {
  id: number;
  inicio: string;
  fim: string;
  atendente_id?: string;
  atendente_nome?: string;
  atendente_email?: string | null;
  calendario_id?: string | null;
  google_email?: string | null;
  oauth_calendar_id?: string;
  atendentes_livres?: SlotAttendant[];
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

  // Map atendentes to their calendario_id, email, google_calendar_id and google_email
  const atendenteMap = new Map<string, { nome: string; email: string | null; calendario_id: string | null; google_calendar_id: string; google_email: string | null }>();
  for (const att of avail.atendentes_servico) {
    const a = att as Record<string, unknown>;
    atendenteMap.set(a.id as string, {
      nome: a.nome as string,
      email: (a.email as string | null) ?? null,
      calendario_id: (a.calendario_id as string | null) ?? null,
      google_calendar_id: (a.google_calendar_id as string) || "primary",
      google_email: (a.google_email as string | null) ?? null,
    });
  }

  // Build a set of attendant IDs linked to this service
  const linkedAttendantIds = new Set(atendenteMap.keys());

  // If there's a service-level calendario_id, use it as fallback
  const servicoCalendarioId = (servico.calendario_id as string) ?? null;
  // Use bot calendar as 3rd priority
  const botCalendarioId = avail.bot_calendario_id ?? null;
  // Use first calendar from sector as last fallback
  const sectorCalendarioId = avail.calendarios.length > 0
    ? (avail.calendarios[0] as Record<string, unknown>).id as string
    : null;

  // Parse exceptions into intervals for quick overlap check
  const exceptions: { start: number; end: number; atendente_id: string | null }[] = [];
  for (const exc of avail.excecoes_atendimento) {
    const e = exc as Record<string, unknown>;
    if (e.tipo !== "bloqueio") continue;
    exceptions.push({
      start: new Date(e.data_inicio as string).getTime(),
      end: new Date(e.data_fim as string).getTime(),
      atendente_id: (e.atendente_id as string | null) ?? null,
    });
  }

  // Parse existing appointments for conflict detection
  const appointments: { start: number; end: number; atendente_id: string | null }[] = [];
  for (const apt of avail.agendamentos_existentes) {
    const a = apt as Record<string, unknown>;
    appointments.push({
      start: new Date(a.inicio as string).getTime(),
      end: new Date(a.fim as string).getTime(),
      atendente_id: (a.atendente_id as string | null) ?? null,
    });
  }

  const freebusy = avail.google_freebusy || [];

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
    // Check Google Calendar FreeBusy
    for (const fb of freebusy) {
      if (fb.atendente_id === atendenteId) {
        if (slotStart < fb.end && slotEnd > fb.start) return true;
      }
    }
    return false;
  }

  // Generate slots day by day
  const rawSlots: Slot[] = [];

  for (let dayOffset = 0; dayOffset <= effectiveMaxDays && rawSlots.length < maxSlots * linkedAttendantIds.size; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);

    // JS getDay(): 0=Sunday ... 6=Saturday
    const jsDow = date.getDay();

    // Find matching janelas for this day of week
    // janelas_atendimento.dia_semana: check both conventions (0=Sun or 1=Mon)
    const matchingJanelas = avail.janelas_atendimento.filter((j: Record<string, unknown>) => {
      if (j.tipo_janela !== "trabalho") return false;
      // Support dia_semana as either 0-based (0=Sun) or 1-based (1=Mon)
      // Try matching both: dia_semana === jsDow OR dia_semana === (jsDow===0?7:jsDow)
      const d = j.dia_semana as number;
      return d === jsDow || d === (jsDow === 0 ? 7 : jsDow);
    });

    for (const janela of matchingJanelas) {
      const j = janela as Record<string, unknown>;

      // Determine which attendant this window is for
      // If janela has atendente_id, use it; otherwise generate for all linked attendants
      const targetAttendants: string[] = j.atendente_id
        ? (linkedAttendantIds.has(j.atendente_id as string) ? [j.atendente_id as string] : [])
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

        while (cursor.getTime() + duracaoMin * 60_000 <= windowEnd.getTime()) {
          const slotStart = cursor.getTime();
          const slotEnd = slotStart + duracaoMin * 60_000;

          // Skip past slots and respect antecedência mínima
          if (slotStart >= minTime.getTime() && !isBlocked(slotStart, slotEnd, atendenteId)) {
            const attInfo = atendenteMap.get(atendenteId);
            const calendarioId = servicoCalendarioId ?? attInfo?.calendario_id ?? botCalendarioId ?? sectorCalendarioId;

            const isoStart = new Date(slotStart).toISOString();
            const existingSlot = rawSlots.find(s => s.inicio === isoStart);
            
            const freeAtt: SlotAttendant = {
              atendente_id: atendenteId,
              atendente_nome: attInfo?.nome ?? "Atendente",
              atendente_email: attInfo?.email ?? null,
              calendario_id: calendarioId,
              google_email: attInfo?.google_email ?? null,
              oauth_calendar_id: attInfo?.google_calendar_id ?? "primary",
            };

            if (existingSlot) {
              if (!existingSlot.atendentes_livres?.find(a => a.atendente_id === atendenteId)) {
                existingSlot.atendentes_livres?.push(freeAtt);
              }
            } else {
              rawSlots.push({
                id: 0, // temporary
                inicio: isoStart,
                fim: new Date(slotEnd).toISOString(),
                atendentes_livres: [freeAtt],
              });
            }
          }

          // Advance by duration (slot-by-slot)
          cursor = new Date(cursor.getTime() + duracaoMin * 60_000);
        }
      }
    }
  }

  // Sort by start time
  rawSlots.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  
  // Truncate to maxSlots and assign sequential IDs
  const finalSlots = rawSlots.slice(0, maxSlots);
  for (let i = 0; i < finalSlots.length; i++) {
    finalSlots[i].id = i + 1;
  }

  return finalSlots;
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

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    
    if (request.method !== "POST") {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    try {
      const requestBody = await request.json();
      const body = chatSchema.parse(requestBody);

      // ── Validate setor (with extra fields for context) ──────────
      const { data: setor, error: errSetor } = await supabaseAdmin
        .from('setores')
        .select('id, nome, slug')
        .eq('slug', body.setor_slug)
        .eq('ativo', true)
        .single();
        
      if (errSetor || !setor) {
        return new Response(JSON.stringify({ error: "Setor não encontrado ou inativo" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Validate bot (with extra fields for context) ────────────
      const { data: bot, error: errBot } = await supabaseAdmin
        .from('bots_agendamento')
        .select('id, nome, slug, saudacao_inicial, tom_de_voz, mensagem_fora_escopo, instrucoes_especificas, calendario_id')
        .eq('slug', body.bot_slug)
        .eq('setor_id', setor.id)
        .eq('ativo', true)
        .single();
        
      if (errBot || !bot) {
        return new Response(JSON.stringify({ error: "Bot não encontrado ou inativo para este setor" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        return new Response(JSON.stringify({ error: "Canal do widget não encontrado, inativo ou não permitido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Se permitido_embedar existir no banco, validar também
      if ('permitido_embedar' in canal && (canal as Record<string, unknown>).permitido_embedar === false) {
        return new Response(JSON.stringify({ error: "Canal do widget não encontrado, inativo ou não permitido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
          logger,
        ),

        // 2. Perguntas frequentes ativas
        safeQuery("perguntas_respostas", () =>
          supabaseAdmin
            .from("perguntas_respostas")
            .select("id, categoria, pergunta, resposta, palavras_chave, ordem")
            .eq("bot_id", bot.id)
            .eq("ativo", true)
            .order("ordem", { ascending: true }),
          logger,
        ),

        // 3. Campos ativos do chat
        safeQuery("campos_formulario_chat", () =>
          supabaseAdmin
            .from("campos_formulario_chat")
            .select("id, nome_campo, rotulo, tipo_campo, obrigatorio, opcoes_json, ordem")
            .eq("bot_id", bot.id)
            .eq("ativo", true)
            .order("ordem", { ascending: true }),
          logger,
        ),

        // 4. Atendentes ativos do setor
        safeQuery("atendentes", () =>
          supabaseAdmin
            .from("atendentes")
            .select("id, nome, email, cargo")
            .eq("setor_id", setor.id)
            .eq("ativo", true),
          logger,
        ),
      ]);

      // ── Conversation persistence (resilient) ───────────────────────
      const conversa = await findOrCreateConversa(
        body.session_id,
        bot.id,
        body.canal_id,
        body.user?.name,
        body.user?.email,
        logger,
      );
      const conversaId = conversa?.id ?? null;

      // Save user message (fire-and-forget-safe: awaited but failures are swallowed)
      if (conversaId) {
        await saveMessage(conversaId, "usuario", body.message, {}, logger);
      }

      // Fetch conversation history for n8n context
      const history = conversaId
        ? await fetchHistory(conversaId, 10, logger)
        : [];

      // ── Build availability context (if service selected) ────────────
      let rawState = conversa?.estado_json ?? {};
      if (typeof rawState === "string") {
        try { rawState = JSON.parse(rawState); } catch(_e) { rawState = {}; }
      }
      const conversationState = rawState as Record<string, unknown>;
      const selectedServicoId = conversationState.servico_id as string | undefined;
      const availability_context = await buildAvailabilityContext(
        selectedServicoId,
        setor.id,
        (bot.calendario_id as string) ?? null,
        logger,
      );

      // ── Short-circuit: slot generation when etapa = aguardando_horario ──
      if (conversationState.etapa === "aguardando_horario" && availability_context?.can_schedule) {
        logger.info({ etapa: "aguardando_horario", servico_id: selectedServicoId }, "Generating available slots");

        const slots = generateAvailableSlots(availability_context);
        const replyText = formatSlotsMessage(slots);

        const newState: Record<string, unknown> = {
          ...conversationState,
          etapa: slots.length > 0 ? "escolhendo_horario" : "aguardando_horario",
          horarios_disponiveis: slots,
        };

        // Persist
        if (conversaId) {
          await saveMessage(conversaId, "assistente", replyText, {}, logger);
          await saveConversationState(conversaId, newState, logger);
        }

        return new Response(JSON.stringify({
          reply: replyText,
          horarios: slots,
          conversation_id: conversaId ?? body.session_id,
          conversation_state: newState,
          status: "ok",
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // If etapa is aguardando_horario but can't schedule, inform user
      if (conversationState.etapa === "aguardando_horario" && availability_context && !availability_context.can_schedule) {
        const reason = availability_context.reason ?? "Não foi possível montar a agenda neste momento.";
        const newState: Record<string, unknown> = {
          ...conversationState,
          etapa: "erro_agenda",
        };

        if (conversaId) {
          await saveMessage(conversaId, "assistente", reason, {}, logger);
          await saveConversationState(conversaId, newState, logger);
        }

        return new Response(JSON.stringify({
          reply: reason,
          conversation_id: conversaId ?? body.session_id,
          conversation_state: newState,
          status: "ok",
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
            await saveMessage(conversaId, "assistente", reason, {}, logger);
            // state remains the same
          }
          return new Response(JSON.stringify({
            reply: reason,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: conversationState,
            status: "ok",
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
          await saveMessage(conversaId, "assistente", replyText, {}, logger);
          await saveConversationState(conversaId, newState, logger);
        }

        return new Response(JSON.stringify({
          reply: replyText,
          conversation_id: conversaId ?? body.session_id,
          conversation_state: newState,
          status: "ok",
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ── Short-circuit: confirmation when etapa = confirmando_agendamento ──
      if (conversationState.etapa === "confirmando_agendamento") {
        const userMsg = body.message.trim().toLowerCase();
        
        // Prevent duplicate confirmation
        if (conversationState.agendamento_id) {
          const dt = new Date((conversationState.horario_selecionado as Record<string, unknown>).inicio as string);
          const replyText = `Seu agendamento já está confirmado para ${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
          return new Response(JSON.stringify({
            reply: replyText,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: conversationState,
            status: "ok",
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (userMsg === "1" || userMsg === "confirmar" || userMsg === "confirmo" || userMsg === "sim") {
          const selectedSlot = conversationState.horario_selecionado as Slot;
          
          if (!selectedSlot || !conversationState.servico_id) {
            const reason = "Ocorreu um erro ao recuperar seu horário. Por favor, escolha outra opção de horário.";
            return new Response(JSON.stringify({
              reply: reason,
              conversation_id: conversaId ?? body.session_id,
              conversation_state: { ...conversationState, etapa: "aguardando_horario" },
              status: "ok",
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Resolve attendant from pool
          const pool: SlotAttendant[] = selectedSlot.atendentes_livres || [];
          if (pool.length === 0) {
            if (selectedSlot.atendente_id) {
              pool.push({
                atendente_id: selectedSlot.atendente_id,
                atendente_nome: selectedSlot.atendente_nome || "Atendente",
                atendente_email: selectedSlot.atendente_email || null,
                calendario_id: selectedSlot.calendario_id || null,
                google_email: selectedSlot.google_email || null,
                oauth_calendar_id: selectedSlot.oauth_calendar_id || "primary",
              });
            }
          }

          if (pool.length === 0) {
            logger.warn({ slot: selectedSlot.id }, "Hor\u00e1rio sem atendente vinculado no pool.");
            const reason = "Hor\u00e1rio n\u00e3o possui atendente vinculado. Por favor, escolha outro hor\u00e1rio.";
            if (conversaId) {
              await saveMessage(conversaId, "assistente", reason, {}, logger);
            }
            return new Response(JSON.stringify({
              reply: reason,
              conversation_id: conversaId ?? body.session_id,
              conversation_state: { ...conversationState, etapa: "aguardando_horario" },
              status: "ok",
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Fetch day appointments to balance load
          const dayStart = new Date(selectedSlot.inicio);
          dayStart.setHours(0,0,0,0);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);

          const { data: dayApts } = await supabaseAdmin
            .from("agendamentos")
            .select("atendente_id")
            .in("atendente_id", pool.map(a => a.atendente_id))
            .gte("inicio", dayStart.toISOString())
            .lt("inicio", dayEnd.toISOString())
            .in("status", ["pendente_google_calendar", "confirmado", "confirmado_localmente"]);

          const aptCount = new Map();
          for (const apt of dayApts || []) {
            aptCount.set(apt.atendente_id, (aptCount.get(apt.atendente_id) || 0) + 1);
          }

          // Sort pool by count, then name
          pool.sort((a, b) => {
            const countA = aptCount.get(a.atendente_id) || 0;
            const countB = aptCount.get(b.atendente_id) || 0;
            if (countA !== countB) return countA - countB;
            return a.atendente_nome.localeCompare(b.atendente_nome);
          });

          let resolvedAttendant = null;
          let realGoogleCalendarId = undefined;

          for (const candidate of pool) {
            // 1. Local Conflict Check (Supabase) \u2014 by atendente_id, not calendario_id
            const { data: localConflicts } = await supabaseAdmin
              .from("agendamentos")
              .select("id")
              .eq("atendente_id", candidate.atendente_id)
              .lt("inicio", selectedSlot.fim)
              .gt("fim", selectedSlot.inicio)
              .in("status", ["pendente_google_calendar", "confirmado", "confirmado_localmente"]);

            if (localConflicts && localConflicts.length > 0) {
              logger.info({ atendente_id: candidate.atendente_id, conflicts: localConflicts.length }, "Atendente com conflito local, pulando.");
              continue;
            }

            // 2. Use the OAuth calendar_id from the attendant's Google connection
            //    This is typically "primary" \u2014 the attendant's own calendar
            const candOAuthCalId = candidate.oauth_calendar_id || "primary";

            // 3. Google Calendar Conflict Check (FreeBusy) using OAuth calendar
            const gcalAvail = await checkCalendarAvailability({
              atendente_id: candidate.atendente_id,
              calendarId: candOAuthCalId,
              start: selectedSlot.inicio,
              end: selectedSlot.fim,
              timezone: "America/Sao_Paulo",
              logger: logger,
            });

            if (!gcalAvail.available) {
              logger.info({ atendente_id: candidate.atendente_id, oauth_cal: candOAuthCalId }, "Atendente ocupado no Google Calendar, pulando.");
              continue;
            }

            resolvedAttendant = candidate;
            realGoogleCalendarId = candOAuthCalId;
            break;
          }

          if (!resolvedAttendant) {
            logger.warn({ slot: selectedSlot }, "No free attendant available after conflict checks.");
            
            const newState: Record<string, unknown> = {
              ...conversationState,
              etapa: "aguardando_horario",
            };
            delete newState.horario_selecionado;

            const replyText = "Esse horário acabou de ficar indisponível. Por favor, escolha outro horário.";

            if (conversaId) {
              await saveMessage(conversaId, "assistente", replyText, {}, logger);
              await saveConversationState(conversaId, newState, logger);
            }

            return new Response(JSON.stringify({
              reply: replyText,
              conversation_id: conversaId ?? body.session_id,
              conversation_state: newState,
              status: "ok",
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Insert into public.agendamentos
          const dadosColetados = conversationState.dados_coletados as Record<string, unknown> | undefined;
          const nomeUsr = (dadosColetados?.nome_completo as string)
            || (dadosColetados?.nome as string)
            || conversa?.nome_usuario
            || body.user?.name
            || "N\u00e3o informado";
          const emailUsr = (dadosColetados?.email as string)
            || conversa?.email_usuario
            || body.user?.email
            || "nao_informado@agendamento.local";

          logger.info({
            atendente_id: resolvedAttendant.atendente_id,
            atendente_nome: resolvedAttendant.atendente_nome,
            oauth_calendar_id: realGoogleCalendarId,
            inicio: selectedSlot.inicio,
            fim: selectedSlot.fim,
          }, "Resolved attendant for booking");

          const agendamentoData: Record<string, unknown> = {
            setor_id: setor.id,
            bot_id: bot.id,
            servico_id: conversationState.servico_id as string,
            atendente_id: resolvedAttendant.atendente_id,
            calendario_id: resolvedAttendant.calendario_id,
            nome_usuario: nomeUsr,
            email_usuario: emailUsr,
            inicio: selectedSlot.inicio,
            fim: selectedSlot.fim,
            status: "pendente_google_calendar",
          };
          if (conversaId) {
            agendamentoData.conversa_id = conversaId;
          }

          const { data: agendamento, error: insertErr } = await supabaseAdmin
            .from("agendamentos")
            .insert(agendamentoData)
            .select("id")
            .single();

          if (insertErr || !agendamento) {
            logger.error({ err: insertErr?.message, code: insertErr?.code, details: insertErr?.details }, "Failed to insert local agendamento");
            const reason = "Erro ao salvar agendamento no banco. Tente novamente.";
            return new Response(JSON.stringify({
              reply: reason,
              conversation_id: conversaId ?? body.session_id,
              conversation_state: conversationState,
              status: "ok",
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Call Google Calendar API using the attendant's OAuth calendar
          let gcalStatus = "erro_google_calendar";
          let gcalEventId = null;

          if (realGoogleCalendarId) {
            const servicoNome = availability_context?.servico?.nome ?? "Serviço";
            
            // Collect unique attendees (exclude the attendant — they are the organizer)
            const attendeesSet = new Set<string>();
            if (emailUsr && emailUsr !== "nao_informado@agendamento.local") attendeesSet.add(emailUsr);
            
            logger.info({
              agendamento_id: agendamento.id,
              atendente_id: resolvedAttendant.atendente_id,
              calendarId: realGoogleCalendarId,
            }, "Creating Google Calendar event");

            const gcalResponse = await createCalendarEvent({
              atendente_id: resolvedAttendant.atendente_id,
              calendarId: realGoogleCalendarId,
              summary: `Agendamento - ${servicoNome} - ${nomeUsr}`,
              description: `Nome: ${nomeUsr}\nE-mail: ${emailUsr}\nServiço: ${servicoNome}\nConversa ID: ${conversaId || 'N/A'}\nAgendamento ID: ${agendamento.id}\nOrigem: Agenda Setorial SEE-MG`,
              start: selectedSlot.inicio,
              end: selectedSlot.fim,
              attendees: Array.from(attendeesSet),
              timezone: "America/Sao_Paulo",
              logger: logger,
            });

            if (gcalResponse.eventId) {
              gcalStatus = "confirmado";
              gcalEventId = gcalResponse.eventId;
              logger.info({ agendamento_id: agendamento.id, google_event_id: gcalEventId }, "Google Calendar event created successfully");
            } else {
              logger.warn({ agendamento_id: agendamento.id, gcalError: gcalResponse.error }, "Failed to create Google Calendar event");
            }
          } else {
            logger.warn({ agendamento_id: agendamento.id, atendente_id: resolvedAttendant.atendente_id }, "No OAuth calendar_id resolved for attendant, saving as confirmado_localmente.");
            gcalStatus = "confirmado_localmente";
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

          if (gcalStatus === "erro_google_calendar") {
            replyText = "Não foi possível criar evento no Google Calendar. Seu agendamento foi salvo localmente e nossa equipe poderá verificar.";
            nextEtapa = "erro_confirmacao_agendamento";
          } else if (gcalStatus === "confirmado_localmente") {
            replyText = `Agendamento registrado para ${dia} às ${hora}. Não encontrei conexão Google ativa para o atendente, mas seu agendamento está salvo.`;
            nextEtapa = "agendamento_confirmado";
          }

          const newState: Record<string, unknown> = {
            ...conversationState,
            etapa: nextEtapa,
            agendamento_id: agendamento.id,
            google_event_id: gcalEventId,
            servico_nome: availability_context?.servico?.nome,
          };

          if (conversaId) {
            await saveMessage(conversaId, "assistente", replyText, {}, logger);
            await saveConversationState(conversaId, newState, logger);
          }

          return new Response(JSON.stringify({
            reply: replyText,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: newState,
            status: "ok",
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else if (userMsg === "2") {
          const newState: Record<string, unknown> = {
            ...conversationState,
            etapa: "aguardando_horario",
          };
          delete newState.horario_selecionado;

          const replyText = "Tudo bem, vou buscar outras opções de horário para você.";

          if (conversaId) {
            await saveMessage(conversaId, "assistente", replyText, {}, logger);
            await saveConversationState(conversaId, newState, logger);
          }

          return new Response(JSON.stringify({
            reply: replyText,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: newState,
            status: "ok",
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
            await saveMessage(conversaId, "assistente", replyText, {}, logger);
            await saveConversationState(conversaId, newState, logger);
          }

          return new Response(JSON.stringify({
            reply: replyText,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: newState,
            status: "ok",
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          const reason = "Por favor, escolha uma das opções:\n1. Confirmar agendamento\n2. Escolher outro horário\n3. Voltar ao menu principal";
          if (conversaId) {
            await saveMessage(conversaId, "assistente", reason, {}, logger);
          }
          return new Response(JSON.stringify({
            reply: reason,
            conversation_id: conversaId ?? body.session_id,
            conversation_state: conversationState,
            status: "ok",
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
      // Build standardised payload for chatFlow and n8n
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
          origin: request.headers.get("origin") || null,
        },
      };

      // ── Process Chat Flow (Local vs N8N) ──────────────────────────────
      let replyText = N8N_FALLBACK_REPLY;
      let newState: Record<string, unknown> | undefined = undefined;

      if (!(Deno.env.get("USE_N8N_CHAT") === "true")) {
        // Use local chat engine
        logger.info("Using local chat flow engine");
        const flowResponse = await processChatFlow(n8nPayload as unknown as ChatPayload);
        replyText = flowResponse.reply;
        newState = flowResponse.conversation_state;
      } else {
        // If N8N_CHAT_WEBHOOK_URL is not configured, return mock response
        if (!Deno.env.get("N8N_CHAT_WEBHOOK_URL")) {
          return new Response(JSON.stringify({
            reply: MOCK_REPLY,
            conversation_id: conversaId ?? body.session_id,
            status: "ok"
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Build headers for n8n request
        const n8nHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const n8nSecret = Deno.env.get("N8N_SHARED_SECRET");
        if (n8nSecret) {
          n8nHeaders["X-Agenda-Secret"] = n8nSecret;
        }

        try {
          logger.info("Calling n8n chat webhook");

          const n8nResponse = await fetch(Deno.env.get("N8N_CHAT_WEBHOOK_URL")!, {
            method: "POST",
            headers: n8nHeaders,
            body: JSON.stringify(n8nPayload),
            signal: AbortSignal.timeout(15_000), // 15s timeout
          });

          logger.info({ status: n8nResponse.status }, "n8n response received");

          if (!n8nResponse.ok) {
            logger.error({ status: n8nResponse.status }, "n8n returned non-OK status");
            return new Response(JSON.stringify({
              reply: N8N_ERROR_REPLY,
              conversation_id: conversaId ?? body.session_id,
              status: "error",
            }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const n8nData = await n8nResponse.json() as Record<string, unknown>;

          // Normalise n8n response
          replyText = typeof n8nData.reply === "string" && n8nData.reply.trim()
            ? n8nData.reply
            : N8N_FALLBACK_REPLY;

          // Persist conversation state returned by n8n (resilient)
          newState = (n8nData.conversation_state ?? n8nData.state) as Record<string, unknown> | undefined;
        } catch (err: unknown) {
          logger.error({ err: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.name : "UnknownError" }, "n8n webhook failed");
          if ((err instanceof Error ? err.name : "") === "TimeoutError" || (err instanceof Error ? err.name : "") === "AbortError") {
            return new Response(JSON.stringify({
              reply: "Desculpe, o serviço de atendimento demorou muito para responder. Tente novamente em instantes.",
              conversation_id: conversaId ?? body.session_id,
              status: "timeout",
            }), { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({
            reply: N8N_ERROR_REPLY,
            conversation_id: conversaId ?? body.session_id,
            status: "error",
          }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
        let horariosList: Slot[] | undefined = undefined;

        // ── Intercept: generate slots immediately if n8n transitioned to aguardando_horario ──
        if (newState?.etapa === "aguardando_horario") {
          if (availability_context?.can_schedule) {
            logger.info({ etapa: "aguardando_horario", servico_id: selectedServicoId }, "Generating available slots after n8n");
            
            const slots = generateAvailableSlots(availability_context);
            const slotsMsg = formatSlotsMessage(slots);
            
            replyText = replyText + "\n\n" + slotsMsg;
            newState = {
              ...newState,
              etapa: slots.length > 0 ? "escolhendo_horario" : "aguardando_horario",
              horarios_disponiveis: slots,
            };
            horariosList = slots;
          } else {
            const reason = availability_context?.reason ?? "Não encontrei horários disponíveis para este serviço no momento.";
            replyText = replyText + "\n\n" + reason;
            newState = {
              ...newState,
              etapa: "erro_agenda",
            };
          }
        }

        // Save assistant reply (resilient)
        if (conversaId) {
          await saveMessage(conversaId, "assistente", replyText as string, {}, logger);
        }

        if (conversaId && newState && typeof newState === "object" && !Array.isArray(newState)) {
          await saveConversationState(conversaId, newState, logger);
        }

        return new Response(JSON.stringify({
          reply: replyText,
          horarios: horariosList,
          conversation_id: conversaId ?? body.session_id,
          conversation_state: newState,
          status: "ok",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });


    } catch (err) {
      if (err instanceof z.ZodError) {
        return new Response(JSON.stringify({ error: "Payload inválido", details: err.errors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      logger.error(err);
      return new Response(JSON.stringify({ error: "Erro interno do servidor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};


