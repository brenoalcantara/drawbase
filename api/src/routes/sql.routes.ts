import type { FastifyPluginAsync } from 'fastify';

import { sqlGenerateRequestSchema, sqlGenerateResponseSchema } from '../schemas/sql.schema';
import { generateSql } from '../services/sql-generator.service';
import { formatZodIssues } from '../utils/validation-error';

export const sqlRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/sql/generate', async (request, reply) => {
    const parsedRequest = sqlGenerateRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body does not match the DrawBase SQL generation contract.',
          issues: formatZodIssues(parsedRequest.error.issues),
        },
      });
    }

    const result = generateSql(parsedRequest.data.project, parsedRequest.data.options);
    const parsedResponse = sqlGenerateResponseSchema.parse(result);

    return reply.send(parsedResponse);
  });
};

