import { createHash } from 'node:crypto';

import type {
  Column,
  ColumnDefault,
  DatabaseDialect,
  LogicalColumnType,
  ProjectSchema,
  ReferentialAction,
  Table,
} from '../../domain/schema-model';
import { projectSchema } from '../../schemas/project.schema';
import type { IntrospectionStats } from '../../schemas/introspection.schema';
import type { IntrospectedColumn, IntrospectedDatabase, IntrospectedRelationship, IntrospectedTable } from './types';

export function mapIntrospectedDatabaseToProject(
  database: IntrospectedDatabase,
  options: { id?: string; name?: string } = {},
): { project: ProjectSchema; stats: IntrospectionStats } {
  const tableIdByKey = new Map<string, string>();
  const columnIdByTableAndName = new Map<string, Map<string, string>>();

  database.tables.forEach((table) => {
    const tableId = createModelId('table', table.schema, table.name);
    const columnIds = new Map<string, string>();

    tableIdByKey.set(tableKey(table.schema, table.name), tableId);
    table.columns.forEach((column) => {
      columnIds.set(column.name, createModelId('column', table.schema, table.name, column.name));
    });
    columnIdByTableAndName.set(tableId, columnIds);
  });

  const tables: Table[] = database.tables.map((table) => {
    const tableId = tableIdByKey.get(tableKey(table.schema, table.name));

    if (!tableId) {
      throw new Error(`Missing generated table id for ${table.name}.`);
    }

    const columnIds = columnIdByTableAndName.get(tableId) ?? new Map();
    const columns = table.columns
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((column) => mapColumn(column, columnIds.get(column.name) ?? createModelId('column', table.name, column.name)));

    return {
      id: tableId,
      name: table.name,
      schema: table.schema,
      columns,
      indexes: table.indexes
        .map((index) => ({
          id: createModelId('index', table.schema, table.name, index.name),
          name: index.name,
          unique: index.unique,
          columns: index.columns
            .map((indexColumn) => {
              const columnId = columnIds.get(indexColumn.name);

              return columnId ? { columnId, order: indexColumn.order } : null;
            })
            .filter((indexColumn): indexColumn is { columnId: string; order: 'asc' | 'desc' } => Boolean(indexColumn)),
          method: index.method,
          where: index.where,
        }))
        .filter((index) => index.columns.length > 0),
    };
  });

  const relationships = database.relationships
    .map((relationship) => mapRelationship(relationship, tableIdByKey, columnIdByTableAndName))
    .filter((relationship): relationship is NonNullable<ReturnType<typeof mapRelationship>> => Boolean(relationship));
  const project = projectSchema.parse({
    schemaVersion: '1.0.0',
    id: options.id ?? createModelId('project', database.dialect, database.sourceName),
    name: options.name ?? `${database.sourceName} Import`,
    dialect: database.dialect,
    tables,
    relationships,
    layout: {
      viewport: { x: 0, y: 0, zoom: 1 },
      tables: tables.map((table, index) => ({
        tableId: table.id,
        position: {
          x: 24 + (index % 2) * 300,
          y: 100 + Math.floor(index / 2) * 260,
        },
        size: {
          width: 280,
          height: Math.max(180, 78 + table.columns.length * 34),
        },
      })),
    },
    metadata: {
      description: `Imported from ${database.dialect} source ${database.sourceName}.`,
    },
  });

  return {
    project,
    stats: {
      tables: tables.length,
      columns: tables.reduce((total, table) => total + table.columns.length, 0),
      relationships: relationships.length,
      indexes: tables.reduce((total, table) => total + table.indexes.length, 0),
    },
  };
}

export function createModelId(prefix: string, ...parts: Array<string | undefined>) {
  const source = parts.filter(Boolean).join('_') || prefix;
  const normalized = source
    .normalize('NFKD')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const base = `${prefix}_${normalized || 'item'}`;

  if (base.length <= 110) {
    return base;
  }

  return `${base.slice(0, 92)}_${createShortHash(base)}`;
}

export function mapReferentialAction(action: string | null | undefined): ReferentialAction {
  switch (action?.toUpperCase().replace(/\s+/g, ' ')) {
    case 'CASCADE':
      return 'cascade';
    case 'RESTRICT':
      return 'restrict';
    case 'SET NULL':
      return 'setNull';
    case 'SET DEFAULT':
      return 'setDefault';
    case 'NO ACTION':
    default:
      return 'noAction';
  }
}

export function parseDefaultExpression(defaultValue: string | number | boolean | null | undefined): ColumnDefault | undefined {
  if (defaultValue === undefined || defaultValue === null) {
    return undefined;
  }

  if (typeof defaultValue === 'number' || typeof defaultValue === 'boolean') {
    return { kind: 'literal', value: defaultValue };
  }

  const value = String(defaultValue).trim();

  if (!value || value.toUpperCase() === 'NULL') {
    return undefined;
  }

  if (/^current_timestamp(?:\(\))?$/i.test(value) || /^now\(\)$/i.test(value)) {
    return { kind: 'currentTimestamp' };
  }

  if (/^uuid\(\)$/i.test(value) || /^gen_random_uuid\(\)$/i.test(value)) {
    return { kind: 'uuid' };
  }

  if (value === 'true' || value === 'false') {
    return { kind: 'literal', value: value === 'true' };
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return { kind: 'literal', value: Number(value) };
  }

  const quoted = value.match(/^'(.*)'(?:::[\w\s]+)?$/);

  if (quoted) {
    return { kind: 'literal', value: quoted[1].replaceAll("''", "'") };
  }

  return {
    kind: 'expression',
    value: value.slice(0, 500),
  };
}

export function customType(raw: string): LogicalColumnType {
  return { kind: 'custom', raw: raw.slice(0, 120) || 'TEXT' };
}

function mapColumn(column: IntrospectedColumn, columnId: string): Column {
  return {
    id: columnId,
    name: column.name,
    type: column.type,
    nullable: column.primaryKey ? false : column.nullable,
    primaryKey: column.primaryKey,
    unique: column.unique ?? false,
    default: column.default,
  };
}

function mapRelationship(
  relationship: IntrospectedRelationship,
  tableIdByKey: Map<string, string>,
  columnIdByTableAndName: Map<string, Map<string, string>>,
) {
  const localTableId = tableIdByKey.get(tableKey(relationship.localTableSchema, relationship.localTableName));
  const referencedTableId = tableIdByKey.get(
    tableKey(relationship.referencedTableSchema, relationship.referencedTableName),
  );

  if (!localTableId || !referencedTableId) {
    return null;
  }

  const localColumnsByName = columnIdByTableAndName.get(localTableId);
  const referencedColumnsByName = columnIdByTableAndName.get(referencedTableId);
  const localColumnIds = relationship.localColumnNames
    .map((columnName) => localColumnsByName?.get(columnName))
    .filter((columnId): columnId is string => Boolean(columnId));
  const referencedColumnIds = relationship.referencedColumnNames
    .map((columnName) => referencedColumnsByName?.get(columnName))
    .filter((columnId): columnId is string => Boolean(columnId));

  if (
    localColumnIds.length === 0 ||
    localColumnIds.length !== relationship.localColumnNames.length ||
    referencedColumnIds.length !== relationship.referencedColumnNames.length
  ) {
    return null;
  }

  return {
    id: createModelId('relationship', relationship.localTableSchema, relationship.localTableName, relationship.name),
    name: relationship.name,
    localTableId,
    localColumnIds,
    referencedTableId,
    referencedColumnIds,
    onDelete: relationship.onDelete ?? 'noAction',
    onUpdate: relationship.onUpdate ?? 'noAction',
  };
}

function tableKey(schema: string | undefined, name: string) {
  return `${schema ?? ''}.${name}`;
}

function createShortHash(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
}
