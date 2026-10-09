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

export const sqlExecutionTargetIdSchema = z.enum(['postgres-test', 'mysql-test', 'sqlite-sandbox']);

export const sqlExecuteRequestSchema = z
  .object({
    project: projectSchema,
    targetId: sqlExecutionTargetIdSchema,
    confirmation: z.literal('EXECUTE_DDL'),
    options: sqlGenerationOptionsSchema.default({ includeComments: true }),
  })
  .strict();

export const sqlExecutionTargetSchema = z
  .object({
    id: sqlExecutionTargetIdSchema,
    label: z.string().trim().min(1),
    dialect: databaseDialectSchema,
  })
  .strict();

export const sqlExecutionPolicySchema = z
  .object({
    allowedStatements: z.number().int().min(0),
    blockedStatements: z.array(
      z
        .object({
          index: z.number().int().min(1),
          reason: z.string().trim().min(1),
          preview: z.string().trim().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const sqlExecutionResultSchema = z
  .object({
    status: z.enum(['executed', 'failed']),
    statementsAttempted: z.number().int().min(0),
    durationMs: z.number().int().min(0),
    executedAt: z.string().datetime(),
    logId: z.string().trim().min(1),
    error: z
      .object({
        message: z.string().trim().min(1),
        statementIndex: z.number().int().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const sqlExecuteResponseSchema = z
  .object({
    target: sqlExecutionTargetSchema,
    dialect: databaseDialectSchema,
    sql: z.string(),
    warnings: z.array(sqlWarningSchema),
    policy: sqlExecutionPolicySchema,
    execution: sqlExecutionResultSchema,
  })
  .strict();

export type SqlGenerationOptions = z.infer<typeof sqlGenerationOptionsSchema>;
export type SqlGenerateRequest = z.infer<typeof sqlGenerateRequestSchema>;
export type SqlWarning = z.infer<typeof sqlWarningSchema>;
export type SqlGenerateResponse = z.infer<typeof sqlGenerateResponseSchema>;
export type SqlExecutionTargetId = z.infer<typeof sqlExecutionTargetIdSchema>;
export type SqlExecuteRequest = z.infer<typeof sqlExecuteRequestSchema>;
export type SqlExecuteResponse = z.infer<typeof sqlExecuteResponseSchema>;
