import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env";

import healthRoutes from "./routes/health";
import chatRoutes from "./routes/chat";
import widgetRoutes from "./routes/widget";
import meRoutes from "./routes/me";
import syncSheetRoutes from "./routes/syncSheet";
import adminRoutes from "./routes/admin";

const fastify = Fastify({
  logger: true,
});

async function start() {
  // Security Plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false // Allowing script execution for widget.js
  });

  await fastify.register(cors, {
    origin: env.ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Routes
  await fastify.register(healthRoutes);
  await fastify.register(chatRoutes);
  await fastify.register(widgetRoutes);
  await fastify.register(meRoutes);
  await fastify.register(syncSheetRoutes);
  await fastify.register(adminRoutes);

  // Error Handler
  fastify.setErrorHandler((error, request, reply) => {
    if (error.statusCode === 429) {
      return reply.status(429).send({ error: "Rate limit exceeded" });
    }
    
    fastify.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: "Erro interno do servidor",
    });
  });

  try {
    await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`🚀 Backend secure server listening on ${env.PUBLIC_BASE_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
