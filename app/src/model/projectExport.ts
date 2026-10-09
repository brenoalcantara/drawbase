import { formatColumnType, type ColumnDefault, type ProjectSchema, type Relationship, type Table } from './schema';
import type { SchemaProblem } from './projectOperations';

export function projectToMarkdown(project: ProjectSchema, problems: SchemaProblem[]) {
  const lines: string[] = [
    `# ${markdownText(project.name)}`,
    '',
    '| Property | Value |',
    '| --- | --- |',
    `| Dialect | ${markdownText(project.dialect)} |`,
    `| Tables | ${project.tables.length} |`,
    `| Relationships | ${project.relationships.length} |`,
    '',
  ];

  if (problems.length > 0) {
    lines.push('## Schema Problems', '', '| Severity | Problem | Detail |', '| --- | --- | --- |');

    for (const problem of problems) {
      lines.push(`| ${markdownText(problem.severity)} | ${markdownText(problem.title)} | ${markdownText(problem.message)} |`);
    }

    lines.push('');
  }

  lines.push('## Tables', '');

  for (const table of project.tables) {
    lines.push(`### ${markdownText(tableLabel(table))}`, '');

    if (table.columns.length === 0) {
      lines.push('_No columns._', '');
    } else {
      lines.push('| Column | Type | Nullable | PK | Unique | Default |', '| --- | --- | --- | --- | --- | --- |');

      for (const column of table.columns) {
        lines.push(
          `| ${markdownText(column.name)} | ${markdownText(formatColumnType(column.type))} | ${yesNo(column.nullable)} | ${yesNo(
            column.primaryKey,
          )} | ${yesNo(column.unique)} | ${markdownText(formatColumnDefault(column.default))} |`,
        );
      }

      lines.push('');
    }

    appendIndexes(lines, table);
    appendRelationships(lines, table, project.relationships, project.tables);
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function parseProjectSchemaJson(value: unknown): ProjectSchema {
  if (!isRecord(value)) {
    throw new Error('Project JSON must be an object.');
  }

  if (value.schemaVersion !== '1.0.0') {
    throw new Error('Unsupported project schema version.');
  }

  if (!isString(value.id) || !isString(value.name) || !isDatabaseDialect(value.dialect)) {
    throw new Error('Project metadata is invalid.');
  }

  const tables = readArray(value.tables, 'tables');
  const relationships = readArray(value.relationships, 'relationships');
  const layout = readRecord(value.layout, 'layout');
  const viewport = readRecord(layout.viewport, 'layout.viewport');
  const tableLayouts = readArray(layout.tables, 'layout.tables');

  assertNumber(viewport.x, 'layout.viewport.x');
  assertNumber(viewport.y, 'layout.viewport.y');
  assertNumber(viewport.zoom, 'layout.viewport.zoom');

  for (const table of tables) {
    assertTable(table);
  }

  for (const relationship of relationships) {
    assertRelationship(relationship);
  }

  for (const tableLayout of tableLayouts) {
    const layoutRecord = readRecord(tableLayout, 'layout.tables[]');
    const position = readRecord(layoutRecord.position, 'layout.tables[].position');

    assertString(layoutRecord.tableId, 'layout.tables[].tableId');
    assertNumber(position.x, 'layout.tables[].position.x');
    assertNumber(position.y, 'layout.tables[].position.y');
  }

  return value as ProjectSchema;
}

function appendIndexes(lines: string[], table: Table) {
  if (table.indexes.length === 0) {
    return;
  }

  lines.push('Indexes:', '', '| Name | Unique | Columns | Method |', '| --- | --- | --- | --- |');

  for (const index of table.indexes) {
    const columnNames = index.columns
      .map((indexColumn) => {
        const column = table.columns.find((candidate) => candidate.id === indexColumn.columnId);

        return column ? `${column.name} ${indexColumn.order}` : `${indexColumn.columnId} ${indexColumn.order}`;
      })
      .join(', ');

    lines.push(
      `| ${markdownText(index.name)} | ${yesNo(index.unique)} | ${markdownText(columnNames)} | ${markdownText(index.method ?? '-')} |`,
    );
  }

  lines.push('');
}

function appendRelationships(lines: string[], table: Table, relationships: Relationship[], tables: Table[]) {
  const tableRelationships = relationships.filter((relationship) => relationship.localTableId === table.id);

  if (tableRelationships.length === 0) {
    return;
  }

  lines.push('Relationships:', '', '| Name | Local Columns | References | On Delete | On Update |', '| --- | --- | --- | --- | --- |');

  for (const relationship of tableRelationships) {
    const referencedTable = tables.find((candidate) => candidate.id === relationship.referencedTableId);
    const localColumns = relationship.localColumnIds.map((columnId) => columnLabel(table, columnId)).join(', ');
    const referencedColumns =
      referencedTable && relationship.referencedColumnIds.length > 0
        ? relationship.referencedColumnIds.map((columnId) => columnLabel(referencedTable, columnId)).join(', ')
        : relationship.referencedColumnIds.join(', ');
    const referencedLabel = referencedTable ? `${tableLabel(referencedTable)}(${referencedColumns})` : relationship.referencedTableId;

    lines.push(
      `| ${markdownText(relationship.name ?? relationship.id)} | ${markdownText(localColumns)} | ${markdownText(
        referencedLabel,
      )} | ${markdownText(relationship.onDelete ?? '-')} | ${markdownText(relationship.onUpdate ?? '-')} |`,
    );
  }

  lines.push('');
}

function assertTable(value: unknown) {
  const table = readRecord(value, 'tables[]');
  const columns = readArray(table.columns, 'tables[].columns');
  const indexes = readArray(table.indexes, 'tables[].indexes');

  assertString(table.id, 'tables[].id');
  assertString(table.name, 'tables[].name');

  if (table.schema !== undefined) {
    assertString(table.schema, 'tables[].schema');
  }

  for (const column of columns) {
    assertColumn(column);
  }

  for (const index of indexes) {
    const indexRecord = readRecord(index, 'tables[].indexes[]');
    const indexColumns = readArray(indexRecord.columns, 'tables[].indexes[].columns');

    assertString(indexRecord.id, 'tables[].indexes[].id');
    assertString(indexRecord.name, 'tables[].indexes[].name');
    assertBoolean(indexRecord.unique, 'tables[].indexes[].unique');

    for (const indexColumn of indexColumns) {
      const indexColumnRecord = readRecord(indexColumn, 'tables[].indexes[].columns[]');

      assertString(indexColumnRecord.columnId, 'tables[].indexes[].columns[].columnId');

      if (indexColumnRecord.order !== 'asc' && indexColumnRecord.order !== 'desc') {
        throw new Error('Index column order must be asc or desc.');
      }
    }
  }
}

function assertColumn(value: unknown) {
  const column = readRecord(value, 'tables[].columns[]');
  const type = readRecord(column.type, 'tables[].columns[].type');

  assertString(column.id, 'tables[].columns[].id');
  assertString(column.name, 'tables[].columns[].name');
  assertBoolean(column.nullable, 'tables[].columns[].nullable');
  assertBoolean(column.primaryKey, 'tables[].columns[].primaryKey');
  assertBoolean(column.unique, 'tables[].columns[].unique');

  if (
    type.kind !== 'integer' &&
    type.kind !== 'decimal' &&
    type.kind !== 'varchar' &&
    type.kind !== 'text' &&
    type.kind !== 'boolean' &&
    type.kind !== 'date' &&
    type.kind !== 'time' &&
    type.kind !== 'timestamp' &&
    type.kind !== 'json' &&
    type.kind !== 'uuid' &&
    type.kind !== 'binary' &&
    type.kind !== 'custom'
  ) {
    throw new Error('Column type is invalid.');
  }
}

function assertRelationship(value: unknown) {
  const relationship = readRecord(value, 'relationships[]');

  assertString(relationship.id, 'relationships[].id');
  assertString(relationship.localTableId, 'relationships[].localTableId');
  assertString(relationship.referencedTableId, 'relationships[].referencedTableId');
  readArray(relationship.localColumnIds, 'relationships[].localColumnIds').forEach((columnId) =>
    assertString(columnId, 'relationships[].localColumnIds[]'),
  );
  readArray(relationship.referencedColumnIds, 'relationships[].referencedColumnIds').forEach((columnId) =>
    assertString(columnId, 'relationships[].referencedColumnIds[]'),
  );
}

function formatColumnDefault(defaultValue: ColumnDefault | undefined) {
  if (!defaultValue) {
    return '-';
  }

  if (defaultValue.kind === 'currentTimestamp') {
    return 'CURRENT_TIMESTAMP';
  }

  if (defaultValue.kind === 'uuid') {
    return 'UUID';
  }

  return String(defaultValue.value ?? 'NULL');
}

function columnLabel(table: Table, columnId: string) {
  return table.columns.find((column) => column.id === columnId)?.name ?? columnId;
}

function tableLabel(table: Table) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function markdownText(value: string) {
  return value.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim() || '-';
}

function yesNo(value: boolean) {
  return value ? 'yes' : 'no';
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }

  return value;
}

function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }

  return value;
}

function assertString(value: unknown, path: string): asserts value is string {
  if (!isString(value)) {
    throw new Error(`${path} must be a string.`);
  }
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isDatabaseDialect(value: unknown): value is ProjectSchema['dialect'] {
  return value === 'postgres' || value === 'mysql' || value === 'sqlite';
}
