import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import mysql from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import initSqlJs from 'sql.js';

import type { ProjectSchema } from '../domain/schema-model';
import type {
  SqlExecuteResponse,
  SqlExecutionTargetId,
  SqlGenerationOptions,
} from '../schemas/sql.schema';
import { generateSql } from './sql-generator.service';

type ExecutionTarget = SqlExecuteResponse['target'];

type ExecuteSqlOptions = {
  confirmation: 'EXECUTE_DDL';
  options: SqlGenerationOptions;
  project: ProjectSchema;
  targetId: SqlExecutionTargetId;
};

type SqlStatement = {
  index: number;
  sql: string;
};

type BlockedStatement = SqlExecuteResponse['policy']['blockedStatements'][number];

export class SqlExecutionError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'SqlExecutionError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const nodeRequire = createRequire(__filename);

export async function executeGeneratedSql({
  confirmation,
  options,
  project,
  targetId,
}: ExecuteSqlOptions): Promise<SqlExecuteResponse> {
  assertSqlExecutionEnabled();

  if (confirmation !== 'EXECUTE_DDL') {
    throw new SqlExecutionError('SQL_EXECUTION_CONFIRMATION_REQUIRED', 'Execution requires explicit confirmation.');
  }

  const target = resolveExecutionTarget(targetId);
  const generationResult = generateSql(project, {
    ...options,
    dialect: target.dialect,
  });
  const statements = splitSqlStatements(generationResult.sql);
  const blockedStatements = findBlockedStatements(statements);

  if (blockedStatements.length > 0) {
    throw new SqlExecutionError(
      'SQL_EXECUTION_BLOCKED',
      'SQL execution policy allows only CREATE TABLE and CREATE INDEX statements.',
      400,
      { blockedStatements },
    );
  }

  const startedAt = Date.now();
  const executedAt = new Date().toISOString();
  const logId = createExecutionLogId();
  const execution = await executeStatements(target, statements, executedAt, startedAt, logId);
  const response: SqlExecuteResponse = {
    target: {
      id: target.id,
      label: target.label,
      dialect: target.dialect,
    },
    dialect: target.dialect,
    sql: generationResult.sql,
    warnings: generationResult.warnings,
    policy: {
      allowedStatements: statements.length,
      blockedStatements: [],
    },
    execution,
  };

  await appendExecutionLog({
    id: logId,
    projectId: project.id,
    projectName: project.name,
    targetId: target.id,
    dialect: target.dialect,
    status: execution.status,
    statementsAttempted: execution.statementsAttempted,
    durationMs: execution.durationMs,
    executedAt,
    error: execution.error,
  });

  return response;
}

function resolveExecutionTarget(targetId: SqlExecutionTargetId): ExecutionTarget {
  if (targetId === 'postgres-test') {
    return {
      id: 'postgres-test',
      label: 'PostgreSQL test',
      dialect: 'postgres',
    };
  }

  if (targetId === 'mysql-test') {
    return {
      id: 'mysql-test',
      label: 'MySQL test',
      dialect: 'mysql',
    };
  }

  return {
    id: 'sqlite-sandbox',
    label: 'SQLite sandbox',
    dialect: 'sqlite',
  };
}

async function executeStatements(
  target: ExecutionTarget,
  statements: SqlStatement[],
  executedAt: string,
  startedAt: number,
  logId: string,
): Promise<SqlExecuteResponse['execution']> {
  if (statements.length === 0) {
    return {
      status: 'executed',
      statementsAttempted: 0,
      durationMs: Date.now() - startedAt,
      executedAt,
      logId,
    };
  }

  try {
    if (target.dialect === 'postgres') {
      await executePostgres(statements);
    } else if (target.dialect === 'mysql') {
      await executeMysql(statements);
    } else {
      await executeSqlite(statements);
    }

    return {
      status: 'executed',
      statementsAttempted: statements.length,
      durationMs: Date.now() - startedAt,
      executedAt,
      logId,
    };
  } catch (error) {
    const executionError = normalizeExecutionError(error);

    return {
      status: 'failed',
      statementsAttempted: executionError.statementIndex ?? statements.length,
      durationMs: Date.now() - startedAt,
      executedAt,
      logId,
      error: {
        message: executionError.message,
        statementIndex: executionError.statementIndex,
      },
    };
  }
}

async function executePostgres(statements: SqlStatement[]) {
  const client = new PgClient({
    host: readRequiredExecutionEnv('POSTGRES_TEST_HOST'),
    port: readExecutionPort('POSTGRES_TEST_PORT'),
    database: readRequiredExecutionEnv('POSTGRES_TEST_DATABASE'),
    user: readRequiredExecutionEnv('POSTGRES_TEST_USER'),
    password: readRequiredExecutionEnv('POSTGRES_TEST_PASSWORD'),
    statement_timeout: 5000,
    query_timeout: 5000,
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    for (const statement of statements) {
      try {
        await client.query(statement.sql);
      } catch (error) {
        throw withStatementIndex(error, statement.index);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function executeMysql(statements: SqlStatement[]) {
  const connection = await mysql.createConnection({
    host: readRequiredExecutionEnv('MYSQL_TEST_HOST'),
    port: readExecutionPort('MYSQL_TEST_PORT'),
    database: readRequiredExecutionEnv('MYSQL_TEST_DATABASE'),
    user: readRequiredExecutionEnv('MYSQL_TEST_USER'),
    password: readRequiredExecutionEnv('MYSQL_TEST_PASSWORD'),
    connectTimeout: 5000,
    multipleStatements: false,
  });

  try {
    for (const statement of statements) {
      try {
        await connection.query(statement.sql);
      } catch (error) {
        throw withStatementIndex(error, statement.index);
      }
    }
  } finally {
    await connection.end();
  }
}

async function executeSqlite(statements: SqlStatement[]) {
  const sqliteFile = resolveSqliteSandboxPath();
  const wasmPath = path.dirname(nodeRequire.resolve('sql.js/dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({ locateFile: (fileName) => path.join(wasmPath, fileName) });
  const existingFile = await readFile(sqliteFile).catch(() => undefined);
  const db = existingFile ? new SQL.Database(existingFile) : new SQL.Database();

  try {
    db.run('PRAGMA foreign_keys = ON');

    for (const statement of statements) {
      try {
        db.run(statement.sql);
      } catch (error) {
        throw withStatementIndex(error, statement.index);
      }
    }

    await mkdir(path.dirname(sqliteFile), { recursive: true });
    await writeFile(sqliteFile, Buffer.from(db.export()));
  } finally {
    db.close();
  }
}

function splitSqlStatements(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';

    if (inLineComment) {
      current += char;

      if (char === '\n') {
        inLineComment = false;
      }

      continue;
    }

    if (inBlockComment) {
      current += char;

      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        inBlockComment = false;
      }

      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '-' && next === '-') {
      current += char;
      current += next;
      index += 1;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '/' && next === '*') {
      current += char;
      current += next;
      index += 1;
      inBlockComment = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      current += char;

      if (inSingleQuote && next === "'") {
        current += next;
        index += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }

      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      pushStatement(statements, current);
      current = '';
      continue;
    }

    current += char;
  }

  pushStatement(statements, current);

  return statements;
}

function pushStatement(statements: SqlStatement[], sql: string) {
  const statement = stripSqlComments(sql).trim();

  if (!statement) {
    return;
  }

  statements.push({
    index: statements.length + 1,
    sql: statement,
  });
}

function findBlockedStatements(statements: SqlStatement[]): BlockedStatement[] {
  return statements.flatMap((statement) => {
    if (/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\b/i.test(statement.sql)) {
      return [];
    }

    return [
      {
        index: statement.index,
        reason: 'Only CREATE TABLE and CREATE INDEX statements are allowed.',
        preview: statement.sql.slice(0, 160),
      },
    ];
  });
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .trim();
}

function resolveSqliteSandboxPath() {
  const sqliteDataDir = path.resolve(process.env.SQLITE_DATA_DIR ?? path.resolve(process.cwd(), 'data/sqlite'));

  return path.join(sqliteDataDir, 'execution-sandbox.sqlite');
}

function resolveExecutionLogPath() {
  const logDir = path.resolve(process.env.SQL_EXECUTION_LOG_DIR ?? process.env.PROJECTS_DATA_DIR ?? path.resolve(process.cwd(), 'data'));

  return path.join(logDir, 'sql-execution.jsonl');
}

function assertSqlExecutionEnabled() {
  if (process.env.SQL_EXECUTION_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new SqlExecutionError(
      'SQL_EXECUTION_DISABLED',
      'SQL execution is disabled. Set SQL_EXECUTION_ENABLED=true only in a controlled local environment.',
      403,
    );
  }
}

function readRequiredExecutionEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new SqlExecutionError(
      'SQL_EXECUTION_TARGET_UNAVAILABLE',
      `SQL execution target configuration ${name} is missing.`,
      503,
    );
  }

  return value;
}

function readExecutionPort(name: string) {
  const value = readRequiredExecutionEnv(name);
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SqlExecutionError(
      'SQL_EXECUTION_TARGET_UNAVAILABLE',
      `SQL execution target configuration ${name} is invalid.`,
      503,
    );
  }

  return port;
}

async function appendExecutionLog(record: Record<string, unknown>) {
  const logPath = resolveExecutionLogPath();

  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
}

function createExecutionLogId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `sql_exec_${crypto.randomUUID().replaceAll('-', '_')}`;
  }

  return `sql_exec_${Date.now()}_${Math.round(Math.random() * 100000)}`;
}

function withStatementIndex(error: unknown, statementIndex: number) {
  if (error instanceof Error) {
    return Object.assign(error, { statementIndex });
  }

  return Object.assign(new Error('SQL statement failed.'), { statementIndex });
}

function normalizeExecutionError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      statementIndex:
        'statementIndex' in error && typeof error.statementIndex === 'number' ? error.statementIndex : undefined,
    };
  }

  return {
    message: 'SQL execution failed.',
    statementIndex: undefined,
  };
}
