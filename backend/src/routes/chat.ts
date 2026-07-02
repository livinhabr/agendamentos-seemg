import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabaseAdmin } from "../supabase";
import { env } from "../env";

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

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.post("/api/chat", async (request, reply) => {
    try {
      const body = chatSchema.parse(request.body);

      // Verify existence of sector
      const { data: setor, error: errSetor } = await supabaseAdmin
        .from('setores')
        .select('id')
        .eq('slug', body.setor_slug)
        .eq('ativo', true)
        .single();
        
      if (errSetor || !setor) {
        return reply.status(400).send({ error: "Setor não encontrado ou inativo" });
      }

      // Check bot
      const { data: bot, error: errBot } = await supabaseAdmin
        .from('bots_agendamento')
        .select('id')
        .eq('slug', body.bot_slug)
        .eq('setor_id', setor.id)
        .eq('ativo', true)
        .single();
        
      if (errBot || !bot) {
        return reply.status(400).send({ error: "Bot não encontrado ou inativo para este setor" });
      }
      
      // Check canal
      const { data: canal, error: errCanal } = await supabaseAdmin
        .from('canais_widget')
        .select('*')
        .eq('id', body.canal_id)
        .eq('bot_id', bot.id)
        .eq('ativo', true)
        .single();
        
      if (errCanal || !canal) {
        return reply.status(400).send({ error: "Canal do widget não encontrado, inativo ou não permitido" });
      }

      // Se permitido_embedar existir no banco, validar também
      if ('permitido_embedar' in canal && canal.permitido_embedar === false) {
        return reply.status(400).send({ error: "Canal do widget não encontrado, inativo ou não permitido" });
      }

      // ── n8n integration (conditional) ──────────────────────────────
      // If N8N_CHAT_WEBHOOK_URL is not configured, return mock response
      if (!env.N8N_CHAT_WEBHOOK_URL) {
        return {
          reply: MOCK_REPLY,
          conversation_id: body.session_id,
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
        context: {
          setor_id: setor.id,
          bot_id: bot.id,
          canal_id: canal.id,
        },
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
            conversation_id: body.session_id,
            status: "error",
          });
        }

        const n8nData = await n8nResponse.json() as Record<string, unknown>;

        // Normalise n8n response
        const replyText = typeof n8nData.reply === "string" && n8nData.reply.trim()
          ? n8nData.reply
          : N8N_FALLBACK_REPLY;

        return {
          reply: replyText,
          conversation_id: (n8nData.conversation_id as string) || body.session_id,
          status: "ok",
        };

      } catch (n8nErr: any) {
        // n8n call failed — do NOT break the user experience
        fastify.log.error({ err: n8nErr.message }, "n8n webhook call failed");
        return reply.status(502).send({
          reply: N8N_ERROR_REPLY,
          conversation_id: body.session_id,
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
