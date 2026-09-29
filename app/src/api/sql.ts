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

