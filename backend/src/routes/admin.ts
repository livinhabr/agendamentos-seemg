import { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../supabase";

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.get("/api/admin/agendamentos", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "No authorization header or invalid format" });
      }

      const token = authHeader.replace("Bearer ", "");
      
      // 1. Verify user identity via Supabase token
      const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !user) {
        fastify.log.warn({ userErr }, "Unauthorized user attempting admin access");
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // 2. Extract setor_id from query params
      const { setor_id } = request.query as Record<string, string>;
      if (!setor_id) {
        return reply.status(400).send({ error: "setor_id is required" });
      }

      // 3. Verify user is actually a manager of the requested sector
      const { data: managerLink, error: linkErr } = await supabaseAdmin
        .from("gestores_setor")
        .select("id")
        .eq("user_id", user.id)
        .eq("setor_id", setor_id)
        .maybeSingle();

      if (linkErr || !managerLink) {
        fastify.log.warn({ userId: user.id, setorId: setor_id }, "Forbidden: User is not manager of sector");
        return reply.status(403).send({ error: "Forbidden: Not a manager of this sector" });
      }

      // 4. Fetch the data securely since authorization has passed
      const { data, error } = await supabaseAdmin
        .from("agendamentos")
        .select(`
          *,
          servico:servicos_agendamento(nome),
          atendente:atendentes(nome),
          calendario:calendarios_setor(nome)
        `)
        .eq("setor_id", setor_id)
        .order("inicio", { ascending: true });

      if (error) {
        fastify.log.error({ err: error }, "Failed to fetch agendamentos for admin");
        return reply.status(500).send({ error: "Database error" });
      }

      return { data };
    } catch (err: any) {
      fastify.log.error({ err }, "Exception in admin agendamentos route");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
