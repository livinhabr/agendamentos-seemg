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
  const { data, error } = await db
    .from("atendentes")
    .select("*")
    .in("setor_id", setorIds);
  return { data: data ?? [], error: toErr(error) };
}

export async function getAgendamentosBySector(setorIds: string[]) {
  if (setorIds.length === 0) return { data: [], error: null };
  const { data, error } = await db
    .from("agendamentos")
    .select(`
      *,
      servico:servicos_agendamento(nome),
      atendente:atendentes(nome),
      calendario:calendarios_setor(nome)
    `)
    .in("setor_id", setorIds)
    .order("inicio", { ascending: true });
  return { data: data ?? [], error: toErr(error) };
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
  if (row[idColumn]) {
    const id = row[idColumn];
    const update = { ...row };
    delete update[idColumn];
    const { data, error } = await db
      .from(table)
      .update(update)
      .eq(idColumn, id)
      .select()
      .maybeSingle();
    return { data, error: toErr(error) };
  }
  const { data, error } = await db.from(table).insert(row).select().maybeSingle();
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

