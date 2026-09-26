import Fastify, { type FastifyInstance } from 'fastify';

import { healthRoutes } from './routes/health.routes';
import { sqlRoutes } from './routes/sql.routes';

type CreateAppOptions = {
  logger?: boolean;
};

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 1024 * 1024,
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} was not found.`,
      },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled request error');

    const statusCode = getErrorStatusCode(error);
    const message = error instanceof Error ? error.message : 'Unexpected request error.';

    return reply.status(statusCode).send({
      error: {
        code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
        message: statusCode === 500 ? 'Unexpected internal error.' : message,
      },
    });
  });

  await app.register(healthRoutes);
  await app.register(sqlRoutes);

  return app;
}

function getErrorStatusCode(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400
  ) {
    return error.statusCode;
  }

  return 500;
}
