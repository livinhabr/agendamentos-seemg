import { FastifyInstance } from "fastify";
import { getUserFromToken } from "../supabase";
import { maskToken } from "../utils/security";

export default async function meRoutes(fastify: FastifyInstance) {
  fastify.get("/api/me", async (request, reply) => {
    const authHeader = request.headers.authorization as string | undefined;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Token não fornecido" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { user, error } = await getUserFromToken(token);

    if (error || !user) {
      fastify.log.warn(`Token inválido detectado: ${maskToken(token)}`);
      return reply.status(401).send({ error: "Token inválido ou expirado" });
    }

    return {
      authenticated: true,
      email: user.email,
      user_id: user.id
    };
  });
}
