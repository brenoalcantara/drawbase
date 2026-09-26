import type { DatabaseDialect } from '../domain/schema-model';
import { mysqlDialect } from './mysql';
import { postgresDialect } from './postgres';
import { sqliteDialect } from './sqlite';
import type { SqlDialect } from './types';

const dialects: Record<DatabaseDialect, SqlDialect> = {
  postgres: postgresDialect,
  mysql: mysqlDialect,
  sqlite: sqliteDialect,
};

export function getDialect(name: DatabaseDialect) {
  return dialects[name];
}

export type { SqlDialect } from './types';

