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
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("VITE_API_BASE_URL não configurada no frontend.");
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = "Erro ao enviar mensagem";
    try {
      const errorData = await response.json();
      if (errorData.error) errorMsg = errorData.error;
    } catch (e) {
      // Ignorar erro de parsing
    }
    throw new Error(errorMsg);
  }

  return response.json() as Promise<{
    reply: string;
    conversation_id: string;
    status: "ok";
  }>;
}
