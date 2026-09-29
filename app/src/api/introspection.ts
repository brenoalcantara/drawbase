import type { DatabaseDialect, ProjectSchema } from '../model/schema';

export type IntrospectionConnection =
  | {
      dialect: 'postgres';
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      schemas?: string[];
      ssl: boolean;
      timeoutMs: number;
    }
  | {
      dialect: 'mysql';
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      timeoutMs: number;
    }
  | {
      dialect: 'sqlite';
      filePath: string;
      timeoutMs: number;
    };

export type IntrospectionImportResponse = {
  dialect: DatabaseDialect;
  project: ProjectSchema;
  warnings: Array<{ code: string; message: string; path?: Array<string | number> }>;
  stats: {
    tables: number;
    columns: number;
    relationships: number;
    indexes: number;
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function importDatabaseSchema(
  connection: IntrospectionConnection,
  project: { id?: string; name?: string },
  signal?: AbortSignal,
): Promise<IntrospectionImportResponse> {
  const response = await fetch(`${API_BASE_URL}/api/introspection/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ connection, project }),
    signal,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Database import failed.');
  }

  return payload as IntrospectionImportResponse;
}
