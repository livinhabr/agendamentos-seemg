import { FastifyInstance } from "fastify";

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async (request, reply) => {
    return {
      status: "ok",
      service: "agenda-setorial-api"
    };
  });
}
