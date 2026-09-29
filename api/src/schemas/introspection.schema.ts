import { z } from 'zod';

import { databaseDialectSchema, projectSchema } from './project.schema';
import { sqlWarningSchema } from './sql.schema';

const hostSchema = z.string().trim().min(1).max(255);
const databaseNameSchema = z.string().trim().min(1).max(255);
const usernameSchema = z.string().trim().min(1).max(255);
const passwordSchema = z.string().max(1000).default('');
const timeoutMsSchema = z.number().int().min(500).max(30000).default(5000);

export const postgresIntrospectionConnectionSchema = z
  .object({
    dialect: z.literal('postgres'),
    host: hostSchema,
    port: z.number().int().min(1).max(65535).default(5432),
    database: databaseNameSchema,
    user: usernameSchema,
    password: passwordSchema,
    schemas: z.array(z.string().trim().min(1).max(128)).min(1).max(20).optional(),
    ssl: z.boolean().default(false),
    timeoutMs: timeoutMsSchema,
  })
  .strict();

export const mysqlIntrospectionConnectionSchema = z
  .object({
    dialect: z.literal('mysql'),
    host: hostSchema,
    port: z.number().int().min(1).max(65535).default(3306),
    database: databaseNameSchema,
    user: usernameSchema,
    password: passwordSchema,
    timeoutMs: timeoutMsSchema,
  })
  .strict();

export const sqliteIntrospectionConnectionSchema = z
  .object({
    dialect: z.literal('sqlite'),
    filePath: z.string().trim().min(1).max(1000),
    timeoutMs: timeoutMsSchema,
  })
  .strict();

export const introspectionConnectionSchema = z.discriminatedUnion('dialect', [
  postgresIntrospectionConnectionSchema,
  mysqlIntrospectionConnectionSchema,
  sqliteIntrospectionConnectionSchema,
]);

export const introspectionProjectOptionsSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(160).optional(),
  })
  .strict()
  .default({});

export const introspectionImportRequestSchema = z
  .object({
    connection: introspectionConnectionSchema,
    project: introspectionProjectOptionsSchema,
  })
  .strict();

export const introspectionStatsSchema = z
  .object({
    tables: z.number().int().min(0),
    columns: z.number().int().min(0),
    relationships: z.number().int().min(0),
    indexes: z.number().int().min(0),
  })
  .strict();

export const introspectionImportResponseSchema = z
  .object({
    dialect: databaseDialectSchema,
    project: projectSchema,
    warnings: z.array(sqlWarningSchema),
    stats: introspectionStatsSchema,
  })
  .strict();

export type PostgresIntrospectionConnection = z.infer<typeof postgresIntrospectionConnectionSchema>;
export type MysqlIntrospectionConnection = z.infer<typeof mysqlIntrospectionConnectionSchema>;
export type SqliteIntrospectionConnection = z.infer<typeof sqliteIntrospectionConnectionSchema>;
export type IntrospectionConnection = z.infer<typeof introspectionConnectionSchema>;
export type IntrospectionImportRequest = z.infer<typeof introspectionImportRequestSchema>;
export type IntrospectionImportResponse = z.infer<typeof introspectionImportResponseSchema>;
export type IntrospectionStats = z.infer<typeof introspectionStatsSchema>;
