import type { FastifyPluginAsync } from 'fastify';

import {
  projectListResponseSchema,
  projectParamsSchema,
  projectRecordSchema,
  projectSaveRequestSchema,
} from '../schemas/projects.schema';
import { JsonProjectStore, ProjectNotFoundError } from '../services/json-project-store.service';
import { formatZodIssues } from '../utils/validation-error';

type ProjectRoutesOptions = {
  dataDir?: string;
};

export const projectRoutes: FastifyPluginAsync<ProjectRoutesOptions> = async (app, options) => {
  const store = new JsonProjectStore({ dataDir: options.dataDir });

  app.get('/api/projects', async () => {
    const projects = await store.listProjects();
    return projectListResponseSchema.parse({ projects });
  });

  app.post('/api/projects', async (request, reply) => {
    const parsedRequest = projectSaveRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body does not match the DrawBase project persistence contract.',
          issues: formatZodIssues(parsedRequest.error.issues),
        },
      });
    }

    const { record, created } = await store.saveProject(parsedRequest.data.project);

    return reply.status(created ? 201 : 200).send(projectRecordSchema.parse(record));
  });

  app.get('/api/projects/:id', async (request, reply) => {
    const parsedParams = projectParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Project id is invalid.',
          issues: formatZodIssues(parsedParams.error.issues),
        },
      });
    }

    try {
      const record = await store.getProject(parsedParams.data.id);
      return reply.send(projectRecordSchema.parse(record));
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.status(404).send({
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.put('/api/projects/:id', async (request, reply) => {
    const parsedParams = projectParamsSchema.safeParse(request.params);
    const parsedRequest = projectSaveRequestSchema.safeParse(request.body);

    if (!parsedParams.success || !parsedRequest.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Project update request is invalid.',
          issues: [
            ...(parsedParams.success ? [] : formatZodIssues(parsedParams.error.issues)),
            ...(parsedRequest.success ? [] : formatZodIssues(parsedRequest.error.issues)),
          ],
        },
      });
    }

    if (parsedParams.data.id !== parsedRequest.data.project.id) {
      return reply.status(409).send({
        error: {
          code: 'PROJECT_ID_MISMATCH',
          message: 'Route project id must match request body project id.',
        },
      });
    }

    const { record, created } = await store.saveProject(parsedRequest.data.project);

    return reply.status(created ? 201 : 200).send(projectRecordSchema.parse(record));
  });

  app.delete('/api/projects/:id', async (request, reply) => {
    const parsedParams = projectParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Project id is invalid.',
          issues: formatZodIssues(parsedParams.error.issues),
        },
      });
    }

    const deleted = await store.deleteProject(parsedParams.data.id);

    if (!deleted) {
      return reply.status(404).send({
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: `Project ${parsedParams.data.id} was not found.`,
        },
      });
    }

    return reply.status(204).send();
  });
};
