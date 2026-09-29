import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import initSqlJs from 'sql.js';

import type { SqliteIntrospectionConnection } from '../../schemas/introspection.schema';
import { customType, mapReferentialAction, parseDefaultExpression } from './mapping';
import { resolveAllowedSqlitePath, withTimeout } from './security';
import type { IntrospectedColumn, IntrospectedDatabase, IntrospectedIndex, IntrospectedRelationship } from './types';

type SqlValue = string | number | Uint8Array | null;
type SqlRow = Record<string, SqlValue>;

const nodeRequire = createRequire(__filename);

export async function introspectSqlite(connection: SqliteIntrospectionConnection): Promise<IntrospectedDatabase> {
  return withTimeout(introspectSqliteUnsafe(connection), connection.timeoutMs, 'SQLite introspection');
}

async function introspectSqliteUnsafe(connection: SqliteIntrospectionConnection): Promise<IntrospectedDatabase> {
  const filePath = resolveAllowedSqlitePath(connection.filePath);
  const file = await readFile(filePath);
  const wasmPath = path.dirname(nodeRequire.resolve('sql.js/dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({ locateFile: (fileName) => path.join(wasmPath, fileName) });
  const db = new SQL.Database(file);

  try {
    const tableRows = queryRows(
      db,
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `,
    );

    return {
      dialect: 'sqlite',
      sourceName: path.basename(filePath),
      warnings: [],
      tables: tableRows.map((row) => {
        const tableName = String(row.name);

        return {
          name: tableName,
          columns: mapSqliteColumns(queryRows(db, `PRAGMA table_info(${quoteSqliteIdentifier(tableName)})`)),
          indexes: mapSqliteIndexes(db, tableName),
        };
      }),
      relationships: tableRows.flatMap((row) => mapSqliteForeignKeys(db, String(row.name))),
    };
  } finally {
    db.close();
  }
}

function mapSqliteColumns(rows: SqlRow[]): IntrospectedColumn[] {
  return rows.map((row) => {
    const typeName = String(row.type ?? '');
    const primaryKeyPosition = Number(row.pk ?? 0);
    const defaultValue = parseDefaultExpression(row.dflt_value === null ? undefined : String(row.dflt_value));

    return {
      name: String(row.name),
      type: mapSqliteType(typeName, primaryKeyPosition > 0),
      nullable: Number(row.notnull ?? 0) === 0 && primaryKeyPosition === 0,
      primaryKey: primaryKeyPosition > 0,
      default: defaultValue,
      ordinal: Number(row.cid ?? 0) + 1,
    };
  });
}

function mapSqliteType(typeName: string, primaryKey: boolean): IntrospectedColumn['type'] {
  const upperType = typeName.toUpperCase();

  if (upperType.includes('INT')) {
    return { kind: 'integer', size: 'standard', autoIncrement: primaryKey };
  }

  if (upperType.includes('CHAR') || upperType.includes('VARCHAR')) {
    const length = upperType.match(/\((\d+)\)/)?.[1];
    return { kind: 'varchar', length: length ? Number(length) : 255 };
  }

  if (upperType.includes('TEXT') || upperType.includes('CLOB')) {
    return { kind: 'text' };
  }

  if (upperType.includes('BOOL')) {
    return { kind: 'boolean' };
  }

  if (upperType.includes('DATE') && !upperType.includes('DATETIME')) {
    return { kind: 'date' };
  }

  if (upperType.includes('TIME') || upperType.includes('DATETIME')) {
    return { kind: 'timestamp', withTimezone: false };
  }

  if (upperType.includes('DECIMAL') || upperType.includes('NUMERIC') || upperType.includes('REAL') || upperType.includes('DOUBLE')) {
    return { kind: 'decimal' };
  }

  if (upperType.includes('BLOB') || upperType.includes('BINARY')) {
    return { kind: 'binary' };
  }

  if (upperType.includes('JSON')) {
    return { kind: 'json' };
  }

  return customType(typeName || 'TEXT');
}

function mapSqliteIndexes(db: initSqlJs.Database, tableName: string): IntrospectedIndex[] {
  return queryRows(db, `PRAGMA index_list(${quoteSqliteIdentifier(tableName)})`)
    .filter((row) => String(row.origin ?? '') !== 'pk')
    .map((row) => {
      const indexName = String(row.name);

      return {
        name: indexName,
        unique: Number(row.unique ?? 0) === 1,
        columns: queryRows(db, `PRAGMA index_xinfo(${quoteSqliteIdentifier(indexName)})`)
          .filter((indexColumn) => Number(indexColumn.key ?? 0) === 1 && indexColumn.name !== null)
          .sort((left, right) => Number(left.seqno ?? 0) - Number(right.seqno ?? 0))
          .map((indexColumn) => ({
            name: String(indexColumn.name),
            order: Number(indexColumn.desc ?? 0) === 1 ? ('desc' as const) : ('asc' as const),
          })),
      };
    })
    .filter((index) => index.columns.length > 0);
}

function mapSqliteForeignKeys(db: initSqlJs.Database, tableName: string): IntrospectedRelationship[] {
  const groups = groupRows(queryRows(db, `PRAGMA foreign_key_list(${quoteSqliteIdentifier(tableName)})`), (row) =>
    String(row.id),
  );

  return [...groups.values()].map((group) => {
    const first = group[0];

    return {
      name: `fk_${tableName}_${String(first.table)}`,
      localTableName: tableName,
      localColumnNames: group.sort(bySequence).map((row) => String(row.from)),
      referencedTableName: String(first.table),
      referencedColumnNames: group.sort(bySequence).map((row) => String(row.to)),
      onDelete: mapReferentialAction(String(first.on_delete ?? 'NO ACTION')),
      onUpdate: mapReferentialAction(String(first.on_update ?? 'NO ACTION')),
    };
  });
}

function queryRows(db: initSqlJs.Database, sql: string): SqlRow[] {
  const result = db.exec(sql)[0];

  if (!result) {
    return [];
  }

  return result.values.map((values) =>
    result.columns.reduce<SqlRow>((row, column, index) => {
      row[column] = values[index] as SqlValue;
      return row;
    }, {}),
  );
}

function quoteSqliteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function bySequence(left: SqlRow, right: SqlRow) {
  return Number(left.seq ?? 0) - Number(right.seq ?? 0);
}

function groupRows<T>(rows: T[], key: (row: T) => string) {
  return rows.reduce((groups, row) => {
    const groupKey = key(row);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
    return groups;
  }, new Map<string, T[]>());
}
