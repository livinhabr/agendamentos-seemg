import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabaseAdmin } from "../supabase";

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

      // Future: Call n8n webhook using N8N_CHAT_WEBHOOK_URL and N8N_SHARED_SECRET

      return {
        reply: "Recebi sua mensagem. Em breve este chat será conectado ao fluxo de agendamento.",
        conversation_id: body.session_id,
        status: "ok"
      };

    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Payload inválido", details: err.errors });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: "Erro interno do servidor" });
    }
  });
}
