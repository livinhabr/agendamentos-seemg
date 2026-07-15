// Camada de acesso a dados do Agenda Setorial SEE-MG.
// Usa apenas o Supabase client externo (publishable key + sessão do usuário).
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type PgErr = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null;

export function toErr(e: any): PgErr {
  if (!e) return null;
  return { message: e.message, code: e.code, details: e.details, hint: e.hint };
}

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentProfile(userId: string) {
  const { data, error } = await db
    .from("perfis_usuario")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return { data, error: toErr(error) };
}

export async function upsertProfile(payload: { user_id: string; nome: string; email: string }) {
  // Procura por user_id ou email
  const existing = await db
    .from("perfis_usuario")
    .select("user_id, email")
    .or(`user_id.eq.${payload.user_id},email.eq.${payload.email}`)
    .maybeSingle();

  if (existing.data) {
    const targetUserId = existing.data.user_id || payload.user_id;
    const { data, error } = await db
      .from("perfis_usuario")
      .update({ nome: payload.nome, email: payload.email })
      .eq("user_id", targetUserId)
      .select()
      .maybeSingle();
    return { data, error: toErr(error) };
  }

  const { data, error } = await db
    .from("perfis_usuario")
    .insert(payload)
    .select()
    .maybeSingle();
  return { data, error: toErr(error) };
}

export async function getUserSectorLinks(userId: string) {
  const { data, error } = await db
    .from("gestores_setor")
    .select("*")
    .eq("user_id", userId);
  return { data: data ?? [], error: toErr(error) };
}

export async function getSectorsByIds(ids: string[]) {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await db.from("setores").select("*").in("id", ids);
  return { data: data ?? [], error: toErr(error) };
}

export async function getBotsBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("bots_agendamento")
    .select("*")
    .in("setor_id", setorIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getServicesBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("servicos_agendamento")
    .select("*")
    .in("setor_id", setorIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getAttendantsBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data: atendentes, error } = await db
    .from("atendentes")
    .select("*")
    .in("setor_id", setorIds);
    
  if (error || !atendentes) return { data: [], error: toErr(error) };
  
  const attendantIds = atendentes.map((a: any) => a.id);
  const { data: connections } = await db
    .from("atendente_google_connections")
    .select("atendente_id, google_email, status, calendar_id")
    .in("atendente_id", attendantIds);
    
  const connMap = new Map();
  if (connections) {
    connections.forEach((c: any) => connMap.set(c.atendente_id, c));
  }
  
  const merged = atendentes.map((a: any) => ({
    ...a,
    google_connection: connMap.get(a.id) || null,
  }));

  return { data: merged, error: null };
}


export async function getSchedulesBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("janelas_atendimento")
    .select("*")
    .in("setor_id", setorIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getExceptionsBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("excecoes_atendimento")
    .select("*")
    .in("setor_id", setorIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getFaqsByBot(botIds: string[]) {
  if (botIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("perguntas_respostas")
    .select("*")
    .in("bot_id", botIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getChatFieldsByBot(botIds: string[]) {
  if (botIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("campos_formulario_chat")
    .select("*")
    .in("bot_id", botIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getCanalWidgetByBot(botIds: string[]) {
  if (botIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("canais_widget")
    .select("*")
    .in("bot_id", botIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getCalendarsBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("calendarios_setor")
    .select("*")
    .in("setor_id", setorIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getAppointmentsBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("agendamentos")
    .select("*")
    .in("setor_id", setorIds)
    .order("inicio", { ascending: false })
    .limit(200);
  return { data: data ?? [], error: toErr(error) };
}


// Upserts genéricos. Não usam service_role: dependem da sessão + RLS.
export async function upsertRow(table: string, row: Record<string, any>, idColumn = "id") {
  // Sanitize empty strings on UUID columns (keys ending in _id) to null
  const sanitized = { ...row };
  for (const key of Object.keys(sanitized)) {
    if (key.endsWith("_id") && key !== idColumn && sanitized[key] === "") {
      sanitized[key] = null;
    }
  }

  if (sanitized[idColumn]) {
    const id = sanitized[idColumn];
    const update = { ...sanitized };
    delete update[idColumn];
    const { data, error } = await db
      .from(table)
      .update(update)
      .eq(idColumn, id)
      .select()
      .maybeSingle();
    return { data, error: toErr(error) };
  }
  const { data, error } = await db.from(table).insert(sanitized).select().maybeSingle();
  return { data, error: toErr(error) };
}

export async function deleteRow(table: string, id: string) {
  const { error } = await db.from(table).delete().eq("id", id);
  return { error: toErr(error) };
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isInstitutionalEmail(email: string) {
  return /@educacao\.mg\.gov\.br$/i.test(email.trim());
}

export async function getAttendantServicesBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data: attendants } = await getAttendantsBySector(setorIds);
  const attendantIds = attendants.map((a: any) => a.id);
  if (attendantIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("atendentes_servicos")
    .select("*")
    .in("atendente_id", attendantIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function saveAttendantWithServices(attendant: any, serviceIds: string[]) {
  const attendantData = { ...attendant };
  delete attendantData.servicos_ids;
  delete attendantData.google_connection;

  const { data, error } = await upsertRow("atendentes", attendantData);
  if (error || !data) return { data, error };

  const attendantId = data.id;

  // Deleta associações existentes
  const { error: delErr } = await db
    .from("atendentes_servicos")
    .delete()
    .eq("atendente_id", attendantId);
  if (delErr) return { error: toErr(delErr) };

  // Insere novas associações
  if (serviceIds.length > 0) {
    const links = serviceIds.map((sid) => ({
      atendente_id: attendantId,
      servico_id: sid,
    }));
    const { error: insErr } = await db
      .from("atendentes_servicos")
      .insert(links);
    if (insErr) return { error: toErr(insErr) };
  }

  return { data, error: null };
}

export async function getKnowledgeBaseBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("base_conhecimento_agente")
    .select("*")
    .in("setor_id", setorIds)
    .order("ordem", { ascending: true, nullsFirst: false })
    .order("titulo", { ascending: true });
  return { data: data ?? [], error: toErr(error) };
}

// ─── Publicação ──────────────────────────────────────────────────────────────

export type PublicationChecklist = {
  servicosAtivos: number;
  basesAtivas: number;
  docsProcessados: number;
  docsPendentes: number;
  atendentesAtivos: number;
  atendentesComGoogle: number;
  totalAtendentes: number;
  horariosAtivos: number;
  excecoesCount: number;
  botAtivo: boolean;
  statusPublicacao: string;
  dataEnvioPublicacao: string | null;
};

export async function getPublicationChecklistData(
  setorIds: string[],
  botId: string | null,
): Promise<{ data: PublicationChecklist; error: PgErr }> {
  const empty: PublicationChecklist = {
    servicosAtivos: 0,
    basesAtivas: 0,
    docsProcessados: 0,
    docsPendentes: 0,
    atendentesAtivos: 0,
    atendentesComGoogle: 0,
    totalAtendentes: 0,
    horariosAtivos: 0,
    excecoesCount: 0,
    botAtivo: false,
    statusPublicacao: "rascunho",
    dataEnvioPublicacao: null,
  };

  if (setorIds.length === 0 || !botId) return { data: empty, error: null };

  const [servicos, bases, atendentes, horarios, excecoes, bot] =
    await Promise.all([
      db
        .from("servicos_agendamento")
        .select("id", { count: "exact", head: true })
        .in("setor_id", setorIds)
        .eq("ativo", true),
      db
        .from("base_conhecimento_agente")
        .select("id, documento_status, ativo")
        .in("setor_id", setorIds)
        .eq("ativo", true),
      getAttendantsBySector(setorIds),
      db
        .from("janelas_atendimento")
        .select("id", { count: "exact", head: true })
        .in("setor_id", setorIds)
        .eq("ativo", true),
      db
        .from("excecoes_atendimento")
        .select("id", { count: "exact", head: true })
        .in("setor_id", setorIds),
      db
        .from("bots_agendamento")
        .select("ativo, status_publicacao, data_envio_publicacao")
        .eq("id", botId)
        .maybeSingle(),
    ]);

  const basesData = (bases.data ?? []) as any[];
  const atendentesData = (atendentes.data ?? []) as any[];
  const atendentesAtivos = atendentesData.filter((a: any) => a.ativo !== false);
  const comGoogle = atendentesAtivos.filter(
    (a: any) =>
      a.google_connection && a.google_connection.status === "connected",
  );

  const result: PublicationChecklist = {
    servicosAtivos: servicos.count ?? 0,
    basesAtivas: basesData.length,
    docsProcessados: basesData.filter(
      (b: any) => b.documento_status === "processado",
    ).length,
    docsPendentes: basesData.filter(
      (b: any) =>
        b.documento_status === "pendente" || b.documento_status === "erro",
    ).length,
    atendentesAtivos: atendentesAtivos.length,
    atendentesComGoogle: comGoogle.length,
    totalAtendentes: atendentesData.length,
    horariosAtivos: horarios.count ?? 0,
    excecoesCount: excecoes.count ?? 0,
    botAtivo: bot.data?.ativo ?? false,
    statusPublicacao: bot.data?.status_publicacao ?? "rascunho",
    dataEnvioPublicacao: bot.data?.data_envio_publicacao ?? null,
  };

  return { data: result, error: null };
}

export async function updateBotPublicationStatus(
  botId: string,
  userId: string,
) {
  const { data, error } = await db
    .from("bots_agendamento")
    .update({
      status_publicacao: "em_revisao",
      data_envio_publicacao: new Date().toISOString(),
      enviado_publicacao_por: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", botId)
    .select()
    .maybeSingle();
  return { data, error: toErr(error) };
}

