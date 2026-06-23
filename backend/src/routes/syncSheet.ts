import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getUserFromToken } from "../supabase";

const syncSchema = z.object({
  setor_id: z.string().uuid(),
  bot_id: z.string().uuid(),
  google_sheet_id: z.string(),
  aba: z.string(),
});

export default async function syncSheetRoutes(fastify: FastifyInstance) {
  fastify.post("/api/config/sync-sheet", async (request, reply) => {
    const authHeader = request.headers.authorization as string | undefined;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Token não fornecido" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { user, error } = await getUserFromToken(token);

    if (error || !user) {
      return reply.status(401).send({ error: "Token inválido ou expirado" });
    }

    try {
      const body = syncSchema.parse(request.body);

      // Future: Check if user has access to this sector

      return {
        status: "pending",
        message: "Sincronização via n8n será implementada em etapa posterior."
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Payload inválido", details: err.errors });
      }
      return reply.status(500).send({ error: "Erro interno do servidor" });
    }
  });
}
