import { Client } from 'pg';

import type { PostgresIntrospectionConnection } from '../../schemas/introspection.schema';
import { customType, mapReferentialAction, parseDefaultExpression } from './mapping';
import { assertHostAllowed, withTimeout } from './security';
import type { IntrospectedColumn, IntrospectedDatabase, IntrospectedIndex, IntrospectedRelationship } from './types';

type PgTableRow = {
  table_schema: string;
  table_name: string;
};

type PgColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
  is_nullable: 'YES' | 'NO';
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  column_default: string | null;
  identity_generation: string | null;
};

type PgPrimaryKeyRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
};

type PgIndexRow = {
  table_schema: string;
  table_name: string;
  index_name: string;
  is_unique: boolean;
  method: string;
  columns: string[];
  where_clause: string | null;
};

type PgForeignKeyRow = {
  constraint_name: string;
  local_schema: string;
  local_table: string;
  local_columns: string[];
  referenced_schema: string;
  referenced_table: string;
  referenced_columns: string[];
  on_delete: string;
  on_update: string;
};

export async function introspectPostgres(connection: PostgresIntrospectionConnection): Promise<IntrospectedDatabase> {
  assertHostAllowed(connection.host);

  return withTimeout(introspectPostgresUnsafe(connection), connection.timeoutMs, 'PostgreSQL introspection');
}

async function introspectPostgresUnsafe(connection: PostgresIntrospectionConnection): Promise<IntrospectedDatabase> {
  const client = new Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: connection.timeoutMs,
    query_timeout: connection.timeoutMs,
  });

  await client.connect();

  try {
    const schemaFilter = connection.schemas?.length ? connection.schemas : ['public'];
    const tables = await client.query<PgTableRow>(
      `
          SELECT table_schema, table_name
          FROM information_schema.tables
          WHERE table_type = 'BASE TABLE'
            AND table_schema = ANY($1)
          ORDER BY table_schema, table_name
        `,
      [schemaFilter],
    );
    const columns = await client.query<PgColumnRow>(
      `
          SELECT
            table_schema,
            table_name,
            column_name,
            ordinal_position,
            is_nullable,
            data_type,
            udt_name,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            column_default,
            identity_generation
          FROM information_schema.columns
          WHERE table_schema = ANY($1)
          ORDER BY table_schema, table_name, ordinal_position
        `,
      [schemaFilter],
    );
    const primaryKeys = await client.query<PgPrimaryKeyRow>(
      `
          SELECT
            kcu.table_schema,
            kcu.table_name,
            kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
           AND kcu.table_name = tc.table_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = ANY($1)
          ORDER BY kcu.table_schema, kcu.table_name, kcu.ordinal_position
        `,
      [schemaFilter],
    );
    const indexes = await client.query<PgIndexRow>(
      `
          SELECT
            ns.nspname AS table_schema,
            tbl.relname AS table_name,
            idx.relname AS index_name,
            ix.indisunique AS is_unique,
            am.amname AS method,
            array_agg(att.attname::text ORDER BY keys.ordinality)::text[] AS columns,
            pg_get_expr(ix.indpred, ix.indrelid) AS where_clause
          FROM pg_index ix
          JOIN pg_class tbl ON tbl.oid = ix.indrelid
          JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
          JOIN pg_class idx ON idx.oid = ix.indexrelid
          JOIN pg_am am ON am.oid = idx.relam
          JOIN unnest(ix.indkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true
          JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = keys.attnum
          WHERE ns.nspname = ANY($1)
            AND NOT ix.indisprimary
          GROUP BY ns.nspname, tbl.relname, idx.relname, ix.indisunique, am.amname, ix.indpred, ix.indrelid
          ORDER BY ns.nspname, tbl.relname, idx.relname
        `,
      [schemaFilter],
    );
    const foreignKeys = await client.query<PgForeignKeyRow>(
      `
          SELECT
            con.conname AS constraint_name,
            local_ns.nspname AS local_schema,
            local_tbl.relname AS local_table,
            array_agg(local_att.attname::text ORDER BY keys.ordinality)::text[] AS local_columns,
            ref_ns.nspname AS referenced_schema,
            ref_tbl.relname AS referenced_table,
            array_agg(ref_att.attname::text ORDER BY keys.ordinality)::text[] AS referenced_columns,
            CASE con.confdeltype
              WHEN 'c' THEN 'CASCADE'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'd' THEN 'SET DEFAULT'
              ELSE 'NO ACTION'
            END AS on_delete,
            CASE con.confupdtype
              WHEN 'c' THEN 'CASCADE'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'd' THEN 'SET DEFAULT'
              ELSE 'NO ACTION'
            END AS on_update
          FROM pg_constraint con
          JOIN pg_class local_tbl ON local_tbl.oid = con.conrelid
          JOIN pg_namespace local_ns ON local_ns.oid = local_tbl.relnamespace
          JOIN pg_class ref_tbl ON ref_tbl.oid = con.confrelid
          JOIN pg_namespace ref_ns ON ref_ns.oid = ref_tbl.relnamespace
          JOIN unnest(con.conkey, con.confkey) WITH ORDINALITY AS keys(local_attnum, ref_attnum, ordinality) ON true
          JOIN pg_attribute local_att ON local_att.attrelid = local_tbl.oid AND local_att.attnum = keys.local_attnum
          JOIN pg_attribute ref_att ON ref_att.attrelid = ref_tbl.oid AND ref_att.attnum = keys.ref_attnum
          WHERE con.contype = 'f'
            AND local_ns.nspname = ANY($1)
          GROUP BY con.conname, local_ns.nspname, local_tbl.relname, ref_ns.nspname, ref_tbl.relname, con.confdeltype, con.confupdtype
          ORDER BY local_ns.nspname, local_tbl.relname, con.conname
        `,
      [schemaFilter],
    );

    const primaryKeyColumns = new Set(
      primaryKeys.rows.map((row) => tableColumnKey(row.table_schema, row.table_name, row.column_name)),
    );
    const indexesByTable = groupRows(indexes.rows, (row) => tableKey(row.table_schema, row.table_name));
    const columnsByTable = groupRows(columns.rows, (row) => tableKey(row.table_schema, row.table_name));

    return {
      dialect: 'postgres',
      sourceName: connection.database,
      warnings: [],
      tables: tables.rows.map((table) => ({
        schema: table.table_schema,
        name: table.table_name,
        columns: (columnsByTable.get(tableKey(table.table_schema, table.table_name)) ?? []).map((column) =>
          mapPostgresColumn(column, primaryKeyColumns),
        ),
        indexes: (indexesByTable.get(tableKey(table.table_schema, table.table_name)) ?? []).map(mapPostgresIndex),
      })),
      relationships: foreignKeys.rows.map(mapPostgresForeignKey),
    };
  } finally {
    await client.end();
  }
}

function mapPostgresColumn(row: PgColumnRow, primaryKeyColumns: Set<string>): IntrospectedColumn {
  const autoIncrement = Boolean(row.identity_generation) || Boolean(row.column_default?.includes('nextval('));
  const defaultValue = autoIncrement ? undefined : parseDefaultExpression(row.column_default);

  return {
    name: row.column_name,
    type: mapPostgresType(row, autoIncrement),
    nullable: row.is_nullable === 'YES',
    primaryKey: primaryKeyColumns.has(tableColumnKey(row.table_schema, row.table_name, row.column_name)),
    default: defaultValue,
    ordinal: row.ordinal_position,
  };
}

function mapPostgresType(row: PgColumnRow, autoIncrement: boolean): IntrospectedColumn['type'] {
  switch (row.udt_name) {
    case 'int2':
      return { kind: 'integer', size: 'small', autoIncrement };
    case 'int4':
      return { kind: 'integer', size: 'standard', autoIncrement };
    case 'int8':
      return { kind: 'integer', size: 'big', autoIncrement };
    case 'varchar':
    case 'bpchar':
      return { kind: 'varchar', length: row.character_maximum_length ?? 255 };
    case 'text':
      return { kind: 'text' };
    case 'bool':
      return { kind: 'boolean' };
    case 'date':
      return { kind: 'date' };
    case 'time':
    case 'timetz':
      return { kind: 'time' };
    case 'timestamp':
      return { kind: 'timestamp', withTimezone: false };
    case 'timestamptz':
      return { kind: 'timestamp', withTimezone: true };
    case 'numeric':
      return { kind: 'decimal', precision: row.numeric_precision ?? undefined, scale: row.numeric_scale ?? undefined };
    case 'json':
    case 'jsonb':
      return { kind: 'json' };
    case 'uuid':
      return { kind: 'uuid' };
    case 'bytea':
      return { kind: 'binary' };
    default:
      return customType(row.data_type || row.udt_name);
  }
}

function mapPostgresIndex(row: PgIndexRow): IntrospectedIndex {
  return {
    name: row.index_name,
    unique: row.is_unique,
    method: mapPostgresIndexMethod(row.method),
    where: row.where_clause ?? undefined,
    columns: toStringArray(row.columns).map((name) => ({ name, order: 'asc' })),
  };
}

function mapPostgresForeignKey(row: PgForeignKeyRow): IntrospectedRelationship {
  return {
    name: row.constraint_name,
    localTableSchema: row.local_schema,
    localTableName: row.local_table,
    localColumnNames: toStringArray(row.local_columns),
    referencedTableSchema: row.referenced_schema,
    referencedTableName: row.referenced_table,
    referencedColumnNames: toStringArray(row.referenced_columns),
    onDelete: mapReferentialAction(row.on_delete),
    onUpdate: mapReferentialAction(row.on_update),
  };
}

function mapPostgresIndexMethod(method: string): IntrospectedIndex['method'] {
  switch (method) {
    case 'btree':
    case 'hash':
    case 'gin':
    case 'gist':
      return method;
    default:
      return undefined;
  }
}

function tableKey(schema: string, table: string) {
  return `${schema}.${table}`;
}

function tableColumnKey(schema: string, table: string, column: string) {
  return `${schema}.${table}.${column}`;
}

function groupRows<T>(rows: T[], key: (row: T) => string) {
  return rows.reduce((groups, row) => {
    const groupKey = key(row);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
    return groups;
  }, new Map<string, T[]>());
}

function toStringArray(value: string[] | string): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value.replace(/^{|}$/g, '').split(',').filter(Boolean);
}
