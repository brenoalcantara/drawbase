import mysql, { type RowDataPacket } from 'mysql2/promise';

import type { MysqlIntrospectionConnection } from '../../schemas/introspection.schema';
import { customType, mapReferentialAction, parseDefaultExpression } from './mapping';
import { assertHostAllowed, withTimeout } from './security';
import type { IntrospectedColumn, IntrospectedDatabase, IntrospectedIndex, IntrospectedRelationship } from './types';

type MysqlTableRow = RowDataPacket & {
  table_name: string;
};

type MysqlColumnRow = RowDataPacket & {
  table_name: string;
  column_name: string;
  ordinal_position: number;
  is_nullable: 'YES' | 'NO';
  data_type: string;
  column_type: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  column_default: string | null;
  extra: string;
};

type MysqlPrimaryKeyRow = RowDataPacket & {
  table_name: string;
  column_name: string;
};

type MysqlIndexRow = RowDataPacket & {
  table_name: string;
  index_name: string;
  non_unique: 0 | 1;
  seq_in_index: number;
  column_name: string;
  collation: 'A' | 'D' | null;
  index_type: string;
};

type MysqlForeignKeyRow = RowDataPacket & {
  constraint_name: string;
  table_name: string;
  column_name: string;
  referenced_table_name: string;
  referenced_column_name: string;
  ordinal_position: number;
  delete_rule: string;
  update_rule: string;
};

export async function introspectMysql(connection: MysqlIntrospectionConnection): Promise<IntrospectedDatabase> {
  assertHostAllowed(connection.host);

  return withTimeout(introspectMysqlUnsafe(connection), connection.timeoutMs, 'MySQL introspection');
}

async function introspectMysqlUnsafe(connection: MysqlIntrospectionConnection): Promise<IntrospectedDatabase> {
  const client = await mysql.createConnection({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    connectTimeout: connection.timeoutMs,
    enableKeepAlive: false,
  });

  try {
    const [tables] = await client.query<MysqlTableRow[]>(
      `
        SELECT TABLE_NAME AS table_name
        FROM information_schema.tables
        WHERE TABLE_SCHEMA = ?
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `,
      [connection.database],
    );
    const [columns] = await client.query<MysqlColumnRow[]>(
      `
        SELECT
          TABLE_NAME AS table_name,
          COLUMN_NAME AS column_name,
          ORDINAL_POSITION AS ordinal_position,
          IS_NULLABLE AS is_nullable,
          DATA_TYPE AS data_type,
          COLUMN_TYPE AS column_type,
          CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
          NUMERIC_PRECISION AS numeric_precision,
          NUMERIC_SCALE AS numeric_scale,
          COLUMN_DEFAULT AS column_default,
          EXTRA AS extra
        FROM information_schema.columns
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, ORDINAL_POSITION
      `,
      [connection.database],
    );
    const [primaryKeys] = await client.query<MysqlPrimaryKeyRow[]>(
      `
        SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
        FROM information_schema.key_column_usage
        WHERE TABLE_SCHEMA = ?
          AND CONSTRAINT_NAME = 'PRIMARY'
        ORDER BY TABLE_NAME, ORDINAL_POSITION
      `,
      [connection.database],
    );
    const [indexes] = await client.query<MysqlIndexRow[]>(
      `
        SELECT
          TABLE_NAME AS table_name,
          INDEX_NAME AS index_name,
          NON_UNIQUE AS non_unique,
          SEQ_IN_INDEX AS seq_in_index,
          COLUMN_NAME AS column_name,
          COLLATION AS collation,
          INDEX_TYPE AS index_type
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = ?
          AND INDEX_NAME <> 'PRIMARY'
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
      `,
      [connection.database],
    );
    const [foreignKeys] = await client.query<MysqlForeignKeyRow[]>(
      `
        SELECT
          kcu.CONSTRAINT_NAME AS constraint_name,
          kcu.TABLE_NAME AS table_name,
          kcu.COLUMN_NAME AS column_name,
          kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
          kcu.REFERENCED_COLUMN_NAME AS referenced_column_name,
          kcu.ORDINAL_POSITION AS ordinal_position,
          rc.DELETE_RULE AS delete_rule,
          rc.UPDATE_RULE AS update_rule
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.referential_constraints rc
          ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
         AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        WHERE kcu.TABLE_SCHEMA = ?
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
      `,
      [connection.database],
    );

    const primaryKeyColumns = new Set(primaryKeys.map((row) => tableColumnKey(row.table_name, row.column_name)));
    const columnsByTable = groupRows(columns, (row) => row.table_name);
    const indexesByTable = groupRows(indexes, (row) => row.table_name);

    return {
      dialect: 'mysql',
      sourceName: connection.database,
      warnings: [],
      tables: tables.map((table) => ({
        name: table.table_name,
        columns: (columnsByTable.get(table.table_name) ?? []).map((column) =>
          mapMysqlColumn(column, primaryKeyColumns),
        ),
        indexes: mapMysqlIndexes(indexesByTable.get(table.table_name) ?? []),
      })),
      relationships: mapMysqlForeignKeys(foreignKeys),
    };
  } finally {
    await client.end();
  }
}

function mapMysqlColumn(row: MysqlColumnRow, primaryKeyColumns: Set<string>): IntrospectedColumn {
  const autoIncrement = row.extra.toLowerCase().includes('auto_increment');
  const defaultValue = autoIncrement ? undefined : parseDefaultExpression(row.column_default);

  return {
    name: row.column_name,
    type: mapMysqlType(row, autoIncrement),
    nullable: row.is_nullable === 'YES',
    primaryKey: primaryKeyColumns.has(tableColumnKey(row.table_name, row.column_name)),
    default: defaultValue,
    ordinal: row.ordinal_position,
  };
}

function mapMysqlType(row: MysqlColumnRow, autoIncrement: boolean): IntrospectedColumn['type'] {
  const dataType = row.data_type.toLowerCase();

  switch (dataType) {
    case 'tinyint':
      if (row.column_type.toLowerCase().startsWith('tinyint(1)')) {
        return { kind: 'boolean' };
      }

      return { kind: 'integer', size: 'small', autoIncrement };
    case 'smallint':
      return { kind: 'integer', size: 'small', autoIncrement };
    case 'mediumint':
    case 'int':
    case 'integer':
      return { kind: 'integer', size: 'standard', autoIncrement };
    case 'bigint':
      return { kind: 'integer', size: 'big', autoIncrement };
    case 'decimal':
    case 'numeric':
      return { kind: 'decimal', precision: row.numeric_precision ?? undefined, scale: row.numeric_scale ?? undefined };
    case 'varchar':
    case 'char':
      return { kind: 'varchar', length: row.character_maximum_length ?? 255 };
    case 'tinytext':
    case 'mediumtext':
    case 'longtext':
    case 'text':
      return { kind: 'text' };
    case 'boolean':
    case 'bool':
      return { kind: 'boolean' };
    case 'date':
      return { kind: 'date' };
    case 'time':
      return { kind: 'time' };
    case 'datetime':
    case 'timestamp':
      return { kind: 'timestamp', withTimezone: false };
    case 'json':
      return { kind: 'json' };
    case 'binary':
    case 'varbinary':
    case 'tinyblob':
    case 'mediumblob':
    case 'longblob':
    case 'blob':
      return { kind: 'binary' };
    default:
      return customType(row.column_type || row.data_type);
  }
}

function mapMysqlIndexes(rows: MysqlIndexRow[]): IntrospectedIndex[] {
  return [...groupRows(rows, (row) => row.index_name).entries()].map(([indexName, indexRows]) => ({
    name: indexName,
    unique: indexRows.every((row) => row.non_unique === 0),
    method: indexRows[0]?.index_type.toUpperCase() === 'FULLTEXT' ? 'fulltext' : 'btree',
    columns: indexRows
      .sort((left, right) => left.seq_in_index - right.seq_in_index)
      .map((row) => ({ name: row.column_name, order: row.collation === 'D' ? 'desc' : 'asc' })),
  }));
}

function mapMysqlForeignKeys(rows: MysqlForeignKeyRow[]): IntrospectedRelationship[] {
  return [...groupRows(rows, (row) => `${row.table_name}.${row.constraint_name}`).values()].map((group) => {
    const first = group[0];

    return {
      name: first.constraint_name,
      localTableName: first.table_name,
      localColumnNames: group.sort(byOrdinal).map((row) => row.column_name),
      referencedTableName: first.referenced_table_name,
      referencedColumnNames: group.sort(byOrdinal).map((row) => row.referenced_column_name),
      onDelete: mapReferentialAction(first.delete_rule),
      onUpdate: mapReferentialAction(first.update_rule),
    };
  });
}

function byOrdinal(left: MysqlForeignKeyRow, right: MysqlForeignKeyRow) {
  return left.ordinal_position - right.ordinal_position;
}

function tableColumnKey(table: string, column: string) {
  return `${table}.${column}`;
}

function groupRows<T>(rows: T[], key: (row: T) => string) {
  return rows.reduce((groups, row) => {
    const groupKey = key(row);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
    return groups;
  }, new Map<string, T[]>());
}
