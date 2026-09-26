import type { FastifyPluginAsync } from 'fastify';

import { DRAWBASE_SCHEMA_VERSION } from '../domain/schema-model';

const startedAt = new Date().toISOString();

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'drawbase-api',
    schemaVersion: DRAWBASE_SCHEMA_VERSION,
    startedAt,
  }));
};

