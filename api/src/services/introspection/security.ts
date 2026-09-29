import path from 'node:path';

export class IntrospectionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'IntrospectionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'postgres-test', 'mysql-test'];

export function assertHostAllowed(host: string) {
  const normalizedHost = host.trim().toLowerCase();
  const allowedHosts = getAllowedHosts();

  if (!allowedHosts.has(normalizedHost)) {
    throw new IntrospectionError(
      'INTROSPECTION_HOST_NOT_ALLOWED',
      `Host ${host} is not allowed for introspection.`,
      403,
    );
  }
}

export function resolveAllowedSqlitePath(filePath: string) {
  const sqliteDataDir = path.resolve(process.env.SQLITE_DATA_DIR ?? path.resolve(process.cwd(), 'data/sqlite'));
  const resolvedPath = path.resolve(path.isAbsolute(filePath) ? filePath : path.join(sqliteDataDir, filePath));
  const isInsideDataDir = resolvedPath === sqliteDataDir || resolvedPath.startsWith(`${sqliteDataDir}${path.sep}`);

  if (!isInsideDataDir) {
    throw new IntrospectionError(
      'SQLITE_PATH_NOT_ALLOWED',
      'SQLite files must be inside SQLITE_DATA_DIR.',
      403,
    );
  }

  return resolvedPath;
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new IntrospectionError('INTROSPECTION_TIMEOUT', `${label} timed out after ${timeoutMs}ms.`, 408));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function getAllowedHosts() {
  return new Set(
    (process.env.INTROSPECTION_ALLOWED_HOSTS ?? DEFAULT_ALLOWED_HOSTS.join(','))
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}
