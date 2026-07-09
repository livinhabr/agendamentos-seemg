import { supabase } from "@/integrations/supabase/client";

export async function sendChatMessage(payload: {
  setor_slug: string;
  bot_slug: string;
  canal_id: string;
  session_id: string;
  message: string;
  user?: {
    name?: string;
    email?: string;
  };
}) {
  const { data, error } = await supabase.functions.invoke("chat", {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || "Erro desconhecido ao chamar o chat");
  }
  if (data?.error) {
    throw new Error(data.error);
  }

  return data as {
    reply: string;
    conversation_id: string;
    status: "ok";
  };
}

export async function getAdminAgendamentos(setorId: string, token: string) {
  const { data, error } = await supabase
    .from("agendamentos")
    .select(`
      *,
      servico:servicos_agendamento(nome),
      atendente:atendentes(nome),
      calendario:calendarios_setor(nome)
    `)
    .eq("setor_id", setorId)
    .order("inicio", { ascending: true });

  if (error) {
    throw new Error(error.message || "Erro ao buscar agendamentos");
  }

  return { data };
}
