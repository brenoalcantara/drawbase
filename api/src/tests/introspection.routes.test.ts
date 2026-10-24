import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../app';

let app: FastifyInstance | undefined;
const originalAllowedHosts = process.env.INTROSPECTION_ALLOWED_HOSTS;

afterEach(async () => {
  await app?.close();
  app = undefined;

  if (originalAllowedHosts === undefined) {
    delete process.env.INTROSPECTION_ALLOWED_HOSTS;
  } else {
    process.env.INTROSPECTION_ALLOWED_HOSTS = originalAllowedHosts;
  }
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

  it('blocks every network host when no introspection allowlist is configured', async () => {
    delete process.env.INTROSPECTION_ALLOWED_HOSTS;
    app = await createApp({ logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/introspection/import',
      payload: {
        connection: {
          dialect: 'postgres',
          host: '127.0.0.1',
          port: 5432,
          database: 'drawbase',
          user: 'drawbase',
          password: 'temporary-test-password',
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
