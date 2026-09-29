import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app';

let app: FastifyInstance | undefined;
let projectsDataDir: string;

const project = {
  schemaVersion: '1.0.0',
  id: 'project_persistence_test',
  name: 'Persistence Test',
  dialect: 'postgres',
  tables: [],
  relationships: [],
  layout: {
    viewport: { x: 0, y: 0, zoom: 1 },
    tables: [],
  },
};

beforeEach(async () => {
  projectsDataDir = await mkdtemp(path.join(os.tmpdir(), 'drawbase-projects-'));
  app = await createApp({ logger: false, projectsDataDir });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(projectsDataDir, { recursive: true, force: true });
});

describe('project routes', () => {
  it('saves, lists and loads a project from JSON storage', async () => {
    const saveResponse = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { project },
    });

    expect(saveResponse.statusCode).toBe(201);
    expect(saveResponse.json()).toMatchObject({
      project: {
        id: project.id,
        name: project.name,
      },
    });

    const listResponse = await app!.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      projects: [
        {
          id: project.id,
          name: project.name,
          tables: 0,
          relationships: 0,
        },
      ],
    });

    const getResponse = await app!.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      project: {
        id: project.id,
        metadata: {
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      },
    });
  });

  it('updates an existing project with the same JSON file identity', async () => {
    await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { project },
    });

    const updateResponse = await app!.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}`,
      payload: {
        project: {
          ...project,
          name: 'Updated Persistence Test',
          dialect: 'sqlite',
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      project: {
        id: project.id,
        name: 'Updated Persistence Test',
        dialect: 'sqlite',
      },
    });

    const listResponse = await app!.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(listResponse.json().projects).toHaveLength(1);
  });

  it('rejects update requests where route id and project id differ', async () => {
    const response = await app!.inject({
      method: 'PUT',
      url: '/api/projects/another_project',
      payload: { project },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'PROJECT_ID_MISMATCH',
      },
    });
  });

  it('deletes a saved project', async () => {
    await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { project },
    });

    const deleteResponse = await app!.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await app!.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
    });

    expect(getResponse.statusCode).toBe(404);
  });

  it('returns validation errors for invalid project payloads', async () => {
    const response = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        project: {
          ...project,
          schemaVersion: '0.0.0',
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
});
