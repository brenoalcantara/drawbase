import type { FastifyPluginAsync } from 'fastify';

import { introspectionImportRequestSchema } from '../schemas/introspection.schema';
import { importDatabaseSchema } from '../services/introspection.service';
import { IntrospectionError } from '../services/introspection/security';
import { formatZodIssues } from '../utils/validation-error';

export const introspectionRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/introspection/import', async (request, reply) => {
    const parsedRequest = introspectionImportRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body does not match the DrawBase introspection contract.',
          issues: formatZodIssues(parsedRequest.error.issues),
        },
      });
    }

    try {
      return reply.send(await importDatabaseSchema(parsedRequest.data));
    } catch (error) {
      if (error instanceof IntrospectionError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      request.log.error({ err: error }, 'Database introspection failed');

      return reply.status(502).send({
        error: {
          code: 'INTROSPECTION_FAILED',
          message: 'Database introspection failed.',
        },
      });
    }
  });
};
