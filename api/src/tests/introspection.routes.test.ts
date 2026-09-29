import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../app';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('introspection routes', () => {
  it('returns validation errors for invalid import payloads', async () => {
    app = await createApp({ logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/introspection/import',
      payload: {
        connection: {
          dialect: 'postgres',
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('blocks hosts outside the introspection allowlist before connecting', async () => {
    app = await createApp({ logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/introspection/import',
      payload: {
        connection: {
          dialect: 'postgres',
          host: 'example.com',
          port: 5432,
          database: 'drawbase',
          user: 'drawbase',
          password: 'secret',
          timeoutMs: 500,
        },
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'INTROSPECTION_HOST_NOT_ALLOWED',
      },
    });
  });
});
