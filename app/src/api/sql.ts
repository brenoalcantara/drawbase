import type { DatabaseDialect, ProjectSchema } from '../model/schema';

export type SqlGenerateResponse = {
  dialect: DatabaseDialect;
  sql: string;
  warnings: Array<{ code: string; message: string; path?: Array<string | number> }>;
  stats: {
    tables: number;
    relationships: number;
  };
};

export type SqlExecutionTargetId = 'postgres-test' | 'mysql-test' | 'sqlite-sandbox';

export type SqlExecuteResponse = {
  target: {
    id: SqlExecutionTargetId;
    label: string;
    dialect: DatabaseDialect;
  };
  dialect: DatabaseDialect;
  sql: string;
  warnings: SqlGenerateResponse['warnings'];
  policy: {
    allowedStatements: number;
    blockedStatements: Array<{
      index: number;
      reason: string;
      preview: string;
    }>;
  };
  execution: {
    status: 'executed' | 'failed';
    statementsAttempted: number;
    durationMs: number;
    executedAt: string;
    logId: string;
    error?: {
      message: string;
      statementIndex?: number;
    };
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function generateSql(project: ProjectSchema, signal?: AbortSignal): Promise<SqlGenerateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/sql/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project,
      options: {
        dialect: project.dialect,
        includeComments: true,
      },
    }),
    signal,
  });

  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message ?? 'SQL generation failed.';
    throw new Error(message);
  }

  return payload as SqlGenerateResponse;
}

export async function executeSql(
  project: ProjectSchema,
  targetId: SqlExecutionTargetId,
  confirmation: string,
  signal?: AbortSignal,
): Promise<SqlExecuteResponse> {
  const response = await fetch(`${API_BASE_URL}/api/sql/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project,
      targetId,
      confirmation,
      options: {
        includeComments: true,
      },
    }),
    signal,
  });

  const payload = await response.json();

  if (!response.ok) {
    const details = payload?.error?.details?.blockedStatements?.[0]?.reason;
    const message = details ? `${payload?.error?.message ?? 'SQL execution failed.'} ${details}` : payload?.error?.message ?? 'SQL execution failed.';
    throw new Error(message);
  }

  return payload as SqlExecuteResponse;
}
