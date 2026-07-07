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
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("VITE_API_BASE_URL não configurada no frontend.");
  }

  const response = await fetch(`${baseUrl}/api/admin/agendamentos?setor_id=${setorId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    let errorMsg = "Erro ao buscar agendamentos";
    try {
      const errorData = await response.json();
      if (errorData.error) errorMsg = errorData.error;
    } catch (e) {}
    throw new Error(errorMsg);
  }

  return response.json();
}
