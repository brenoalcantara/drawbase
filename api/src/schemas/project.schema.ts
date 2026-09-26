import { z } from 'zod';

export const DRAWBASE_SCHEMA_VERSION = '1.0.0' as const;

export const supportedDialects = ['postgres', 'mysql', 'sqlite'] as const;
export const supportedIntegerSizes = ['small', 'standard', 'big'] as const;
export const supportedSortOrders = ['asc', 'desc'] as const;
export const supportedIndexMethods = ['btree', 'hash', 'gin', 'gist', 'fulltext'] as const;
export const supportedReferentialActions = [
  'cascade',
  'restrict',
  'setNull',
  'setDefault',
  'noAction',
] as const;

export const schemaVersionSchema = z.literal(DRAWBASE_SCHEMA_VERSION);
export const databaseDialectSchema = z.enum(supportedDialects);
export const modelIdSchema = z.string().trim().min(1).max(120);
export const databaseObjectNameSchema = z.string().trim().min(1).max(128);

export const integerColumnTypeSchema = z
  .object({
    kind: z.literal('integer'),
    size: z.enum(supportedIntegerSizes).default('standard'),
    autoIncrement: z.boolean().default(false),
  })
  .strict();

export const decimalColumnTypeSchema = z
  .object({
    kind: z.literal('decimal'),
    precision: z.number().int().min(1).max(65).optional(),
    scale: z.number().int().min(0).max(30).optional(),
  })
  .strict();

export const varcharColumnTypeSchema = z
  .object({
    kind: z.literal('varchar'),
    length: z.number().int().min(1).max(65535),
  })
  .strict();

export const textColumnTypeSchema = z.object({ kind: z.literal('text') }).strict();
export const booleanColumnTypeSchema = z.object({ kind: z.literal('boolean') }).strict();
export const dateColumnTypeSchema = z.object({ kind: z.literal('date') }).strict();
export const timeColumnTypeSchema = z.object({ kind: z.literal('time') }).strict();
export const jsonColumnTypeSchema = z.object({ kind: z.literal('json') }).strict();
export const uuidColumnTypeSchema = z.object({ kind: z.literal('uuid') }).strict();
export const binaryColumnTypeSchema = z.object({ kind: z.literal('binary') }).strict();

export const timestampColumnTypeSchema = z
  .object({
    kind: z.literal('timestamp'),
    withTimezone: z.boolean().default(false),
  })
  .strict();

export const customColumnTypeSchema = z
  .object({
    kind: z.literal('custom'),
    raw: z.string().trim().min(1).max(120),
  })
  .strict();

export const logicalColumnTypeSchema = z.discriminatedUnion('kind', [
  integerColumnTypeSchema,
  decimalColumnTypeSchema,
  varcharColumnTypeSchema,
  textColumnTypeSchema,
  booleanColumnTypeSchema,
  dateColumnTypeSchema,
  timeColumnTypeSchema,
  timestampColumnTypeSchema,
  jsonColumnTypeSchema,
  uuidColumnTypeSchema,
  binaryColumnTypeSchema,
  customColumnTypeSchema,
]);

export const columnDefaultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('literal'),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('expression'),
      value: z.string().trim().min(1).max(500),
    })
    .strict(),
  z.object({ kind: z.literal('currentTimestamp') }).strict(),
  z.object({ kind: z.literal('uuid') }).strict(),
]);

export const columnSchema = z
  .object({
    id: modelIdSchema,
    name: databaseObjectNameSchema,
    type: logicalColumnTypeSchema,
    nullable: z.boolean().default(true),
    primaryKey: z.boolean().default(false),
    unique: z.boolean().default(false),
    default: columnDefaultSchema.optional(),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((column, ctx) => {
    if (column.primaryKey && column.nullable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nullable'],
        message: 'Primary key columns must not be nullable.',
      });
    }

    if (
      column.type.kind === 'decimal' &&
      column.type.precision !== undefined &&
      column.type.scale !== undefined &&
      column.type.scale > column.type.precision
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['type', 'scale'],
        message: 'Decimal scale cannot be greater than precision.',
      });
    }
  });

export const indexColumnSchema = z
  .object({
    columnId: modelIdSchema,
    order: z.enum(supportedSortOrders).default('asc'),
  })
  .strict();

export const indexSchema = z
  .object({
    id: modelIdSchema,
    name: databaseObjectNameSchema,
    unique: z.boolean().default(false),
    columns: z.array(indexColumnSchema).min(1),
    method: z.enum(supportedIndexMethods).optional(),
    where: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const tableSchema = z
  .object({
    id: modelIdSchema,
    name: databaseObjectNameSchema,
    schema: databaseObjectNameSchema.optional(),
    columns: z.array(columnSchema).min(1),
    indexes: z.array(indexSchema).default([]),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict();

export const referentialActionSchema = z.enum(supportedReferentialActions);

export const relationshipSchema = z
  .object({
    id: modelIdSchema,
    name: databaseObjectNameSchema.optional(),
    localTableId: modelIdSchema,
    localColumnIds: z.array(modelIdSchema).min(1),
    referencedTableId: modelIdSchema,
    referencedColumnIds: z.array(modelIdSchema).min(1),
    onDelete: referentialActionSchema.default('noAction'),
    onUpdate: referentialActionSchema.default('noAction'),
  })
  .strict()
  .superRefine((relationship, ctx) => {
    if (relationship.localColumnIds.length !== relationship.referencedColumnIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referencedColumnIds'],
        message: 'Relationship local and referenced column counts must match.',
      });
    }
  });

export const canvasViewportSchema = z
  .object({
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
    zoom: z.number().finite().min(0.1).max(4).default(1),
  })
  .strict();

export const positionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export const sizeSchema = z
  .object({
    width: z.number().finite().positive().max(2000),
    height: z.number().finite().positive().max(2000),
  })
  .strict();

export const tableLayoutSchema = z
  .object({
    tableId: modelIdSchema,
    position: positionSchema,
    size: sizeSchema.optional(),
    collapsed: z.boolean().default(false),
  })
  .strict();

export const layoutStateSchema = z
  .object({
    viewport: canvasViewportSchema.default({ x: 0, y: 0, zoom: 1 }),
    tables: z.array(tableLayoutSchema).default([]),
  })
  .strict();

export const projectMetadataSchema = z
  .object({
    description: z.string().trim().max(2000).optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export const projectSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: modelIdSchema,
    name: z.string().trim().min(1).max(160),
    dialect: databaseDialectSchema,
    tables: z.array(tableSchema).default([]),
    relationships: z.array(relationshipSchema).default([]),
    layout: layoutStateSchema.default({ viewport: { x: 0, y: 0, zoom: 1 }, tables: [] }),
    metadata: projectMetadataSchema.optional(),
  })
  .strict()
  .superRefine((project, ctx) => {
    const tableIds = project.tables.map((table) => table.id);
    addDuplicateIssues(ctx, ['tables'], findDuplicates(tableIds), 'Duplicate table id');

    const tableNameKeys = project.tables.map((table) => scopedNameKey(table.schema, table.name));
    addDuplicateIssues(ctx, ['tables'], findDuplicates(tableNameKeys), 'Duplicate table name');

    const tablesById = new Map(project.tables.map((table) => [table.id, table]));
    const columnsByTableId = new Map(
      project.tables.map((table) => [table.id, new Map(table.columns.map((column) => [column.id, column]))]),
    );

    project.tables.forEach((table, tableIndex) => {
      const columnIds = table.columns.map((column) => column.id);
      addDuplicateIssues(
        ctx,
        ['tables', tableIndex, 'columns'],
        findDuplicates(columnIds),
        'Duplicate column id',
      );

      const columnNames = table.columns.map((column) => column.name.toLowerCase());
      addDuplicateIssues(
        ctx,
        ['tables', tableIndex, 'columns'],
        findDuplicates(columnNames),
        'Duplicate column name',
      );

      const indexIds = table.indexes.map((index) => index.id);
      addDuplicateIssues(ctx, ['tables', tableIndex, 'indexes'], findDuplicates(indexIds), 'Duplicate index id');

      const indexNames = table.indexes.map((index) => index.name.toLowerCase());
      addDuplicateIssues(
        ctx,
        ['tables', tableIndex, 'indexes'],
        findDuplicates(indexNames),
        'Duplicate index name',
      );

      const columnsById = columnsByTableId.get(table.id);
      table.indexes.forEach((index, indexIndex) => {
        index.columns.forEach((indexColumn, indexColumnIndex) => {
          if (!columnsById?.has(indexColumn.columnId)) {
            addIssue(ctx, ['tables', tableIndex, 'indexes', indexIndex, 'columns', indexColumnIndex, 'columnId'], {
              message: `Index references unknown column id: ${indexColumn.columnId}.`,
            });
          }
        });
      });
    });

    const relationshipIds = project.relationships.map((relationship) => relationship.id);
    addDuplicateIssues(ctx, ['relationships'], findDuplicates(relationshipIds), 'Duplicate relationship id');

    const relationshipNames = project.relationships
      .map((relationship) => relationship.name)
      .filter((name): name is string => Boolean(name))
      .map((name) => name.toLowerCase());
    addDuplicateIssues(ctx, ['relationships'], findDuplicates(relationshipNames), 'Duplicate relationship name');

    project.relationships.forEach((relationship, relationshipIndex) => {
      const localTable = tablesById.get(relationship.localTableId);
      const referencedTable = tablesById.get(relationship.referencedTableId);

      if (!localTable) {
        addIssue(ctx, ['relationships', relationshipIndex, 'localTableId'], {
          message: `Relationship references unknown local table id: ${relationship.localTableId}.`,
        });
      }

      if (!referencedTable) {
        addIssue(ctx, ['relationships', relationshipIndex, 'referencedTableId'], {
          message: `Relationship references unknown referenced table id: ${relationship.referencedTableId}.`,
        });
      }

      const localColumnsById = columnsByTableId.get(relationship.localTableId);
      relationship.localColumnIds.forEach((columnId, columnIndex) => {
        if (!localColumnsById?.has(columnId)) {
          addIssue(ctx, ['relationships', relationshipIndex, 'localColumnIds', columnIndex], {
            message: `Relationship references unknown local column id: ${columnId}.`,
          });
        }
      });

      const referencedColumnsById = columnsByTableId.get(relationship.referencedTableId);
      relationship.referencedColumnIds.forEach((columnId, columnIndex) => {
        if (!referencedColumnsById?.has(columnId)) {
          addIssue(ctx, ['relationships', relationshipIndex, 'referencedColumnIds', columnIndex], {
            message: `Relationship references unknown referenced column id: ${columnId}.`,
          });
        }
      });
    });

    const layoutTableIds = project.layout.tables.map((tableLayout) => tableLayout.tableId);
    addDuplicateIssues(ctx, ['layout', 'tables'], findDuplicates(layoutTableIds), 'Duplicate table layout');

    project.layout.tables.forEach((tableLayout, tableLayoutIndex) => {
      if (!tablesById.has(tableLayout.tableId)) {
        addIssue(ctx, ['layout', 'tables', tableLayoutIndex, 'tableId'], {
          message: `Layout references unknown table id: ${tableLayout.tableId}.`,
        });
      }
    });
  });

export type DatabaseDialect = z.infer<typeof databaseDialectSchema>;
export type LogicalColumnType = z.infer<typeof logicalColumnTypeSchema>;
export type ColumnDefault = z.infer<typeof columnDefaultSchema>;
export type Column = z.infer<typeof columnSchema>;
export type IndexColumn = z.infer<typeof indexColumnSchema>;
export type Index = z.infer<typeof indexSchema>;
export type Table = z.infer<typeof tableSchema>;
export type ReferentialAction = z.infer<typeof referentialActionSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type CanvasViewport = z.infer<typeof canvasViewportSchema>;
export type TableLayout = z.infer<typeof tableLayoutSchema>;
export type LayoutState = z.infer<typeof layoutStateSchema>;
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;
export type ProjectSchema = z.infer<typeof projectSchema>;

function scopedNameKey(schema: string | undefined, name: string) {
  return `${schema?.toLowerCase() ?? ''}.${name.toLowerCase()}`;
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
      return;
    }

    seen.add(value);
  });

  return [...duplicates];
}

function addDuplicateIssues(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  duplicates: string[],
  label: string,
) {
  duplicates.forEach((duplicate) => {
    addIssue(ctx, path, { message: `${label}: ${duplicate}.` });
  });
}

function addIssue(ctx: z.RefinementCtx, path: Array<string | number>, issue: { message: string }) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: issue.message,
  });
}
