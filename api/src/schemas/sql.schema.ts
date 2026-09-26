import { z } from 'zod';

import { databaseDialectSchema, projectSchema } from './project.schema';

export const sqlGenerationOptionsSchema = z
  .object({
    dialect: databaseDialectSchema.optional(),
    includeComments: z.boolean().default(true),
  })
  .strict();

export const sqlGenerateRequestSchema = z
  .object({
    project: projectSchema,
    options: sqlGenerationOptionsSchema.default({ includeComments: true }),
  })
  .strict();

export const sqlWarningSchema = z
  .object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    path: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .strict();

export const sqlGenerateResponseSchema = z
  .object({
    dialect: databaseDialectSchema,
    sql: z.string(),
    warnings: z.array(sqlWarningSchema),
    stats: z
      .object({
        tables: z.number().int().min(0),
        relationships: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export type SqlGenerationOptions = z.infer<typeof sqlGenerationOptionsSchema>;
export type SqlGenerateRequest = z.infer<typeof sqlGenerateRequestSchema>;
export type SqlWarning = z.infer<typeof sqlWarningSchema>;
export type SqlGenerateResponse = z.infer<typeof sqlGenerateResponseSchema>;

