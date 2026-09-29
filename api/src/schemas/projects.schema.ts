import { z } from 'zod';

import { databaseDialectSchema, modelIdSchema, projectSchema } from './project.schema';

export const projectSaveRequestSchema = z
  .object({
    project: projectSchema,
  })
  .strict();

export const projectParamsSchema = z
  .object({
    id: modelIdSchema,
  })
  .strict();

export const projectRecordSchema = z
  .object({
    storageVersion: z.literal('1.0.0'),
    project: projectSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const projectSummarySchema = z
  .object({
    id: modelIdSchema,
    name: z.string().trim().min(1).max(160),
    dialect: databaseDialectSchema,
    tables: z.number().int().min(0),
    relationships: z.number().int().min(0),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const projectListResponseSchema = z
  .object({
    projects: z.array(projectSummarySchema),
  })
  .strict();

export type ProjectSaveRequest = z.infer<typeof projectSaveRequestSchema>;
export type ProjectRecord = z.infer<typeof projectRecordSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
