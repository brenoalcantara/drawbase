import dagre from '@dagrejs/dagre';

import { createId, type Column, type ProjectSchema, type Table } from './schema';

export type SchemaProblemSeverity = 'error' | 'warning';

export type SchemaProblem = {
  id: string;
  severity: SchemaProblemSeverity;
  title: string;
  message: string;
  target?: {
    tableId?: string;
    columnId?: string;
    indexId?: string;
    relationshipId?: string;
  };
};

const DEFAULT_TABLE_WIDTH = 300;

type DagreNodeLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function analyzeProject(project: ProjectSchema): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  const tableById = new Map(project.tables.map((table) => [table.id, table]));
  const tableKeys = new Map<string, Table[]>();

  for (const table of project.tables) {
    const tableName = table.name.trim();
    const tableKey = tableIdentifierKey(table.schema, table.name);
    const existingTables = tableKeys.get(tableKey) ?? [];
    tableKeys.set(tableKey, [...existingTables, table]);

    if (!tableName) {
      problems.push({
        id: `table-name-empty-${table.id}`,
        severity: 'error',
        title: 'Table without name',
        message: 'Every table needs a name before SQL can be generated safely.',
        target: { tableId: table.id },
      });
    }

    if (table.columns.length === 0) {
      problems.push({
        id: `table-empty-${table.id}`,
        severity: 'error',
        title: `${tableLabel(table)} has no columns`,
        message: 'Add at least one column or remove the table.',
        target: { tableId: table.id },
      });
    }

    if (table.columns.length > 0 && !table.columns.some((column) => column.primaryKey)) {
      problems.push({
        id: `table-no-pk-${table.id}`,
        severity: 'warning',
        title: `${tableLabel(table)} has no primary key`,
        message: 'Tables without primary keys are harder to relate, update and document.',
        target: { tableId: table.id },
      });
    }

    addColumnProblems(problems, table);
    addIndexProblems(problems, table);
  }

  for (const duplicateTables of tableKeys.values()) {
    if (duplicateTables.length < 2) {
      continue;
    }

    for (const table of duplicateTables) {
      problems.push({
        id: `table-duplicate-${table.id}`,
        severity: 'error',
        title: `${tableLabel(table)} is duplicated`,
        message: 'Table names must be unique inside the same schema.',
        target: { tableId: table.id },
      });
    }
  }

  for (const relationship of project.relationships) {
    const localTable = tableById.get(relationship.localTableId);
    const referencedTable = tableById.get(relationship.referencedTableId);

    if (!localTable || !referencedTable) {
      problems.push({
        id: `relationship-missing-table-${relationship.id}`,
        severity: 'error',
        title: 'Relationship points to a missing table',
        message: 'Remove the relationship or reconnect it to existing tables.',
        target: { relationshipId: relationship.id },
      });
      continue;
    }

    if (relationship.localColumnIds.length !== relationship.referencedColumnIds.length) {
      problems.push({
        id: `relationship-size-${relationship.id}`,
        severity: 'error',
        title: `${relationship.name ?? relationship.id} has incompatible columns`,
        message: 'Foreign keys must connect the same number of local and referenced columns.',
        target: { relationshipId: relationship.id, tableId: localTable.id },
      });
    }

    const missingLocalColumn = relationship.localColumnIds.find((columnId) => !localTable.columns.some((column) => column.id === columnId));
    const missingReferencedColumn = relationship.referencedColumnIds.find(
      (columnId) => !referencedTable.columns.some((column) => column.id === columnId),
    );

    if (missingLocalColumn || missingReferencedColumn) {
      problems.push({
        id: `relationship-missing-column-${relationship.id}`,
        severity: 'error',
        title: `${relationship.name ?? relationship.id} points to a missing column`,
        message: 'Remove the relationship or reconnect it to existing columns.',
        target: { relationshipId: relationship.id, tableId: localTable.id },
      });
      continue;
    }

    if (!isUniqueKey(referencedTable, relationship.referencedColumnIds)) {
      problems.push({
        id: `relationship-target-not-key-${relationship.id}`,
        severity: 'warning',
        title: `${relationship.name ?? relationship.id} references a non-key column`,
        message: `Reference ${tableLabel(referencedTable)} through a primary key or unique key when possible.`,
        target: { relationshipId: relationship.id, tableId: localTable.id },
      });
    }
  }

  return problems;
}

export function getRelationshipProblemSeverity(problems: SchemaProblem[]) {
  const severityByRelationshipId = new Map<string, SchemaProblemSeverity>();

  for (const problem of problems) {
    const relationshipId = problem.target?.relationshipId;

    if (!relationshipId) {
      continue;
    }

    const current = severityByRelationshipId.get(relationshipId);

    if (current === 'error') {
      continue;
    }

    severityByRelationshipId.set(relationshipId, problem.severity);
  }

  return severityByRelationshipId;
}

export function autoLayoutProject(project: ProjectSchema): ProjectSchema {
  const tableById = new Map(project.tables.map((table) => [table.id, table]));
  const graph = new dagre.graphlib.Graph();

  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    edgesep: 36,
    marginx: 36,
    marginy: 88,
    nodesep: 68,
    rankdir: 'LR',
    ranksep: 92,
  });

  for (const table of project.tables) {
    graph.setNode(table.id, {
      width: DEFAULT_TABLE_WIDTH,
      height: tableNodeHeight(table),
    });
  }

  for (const relationship of project.relationships) {
    const hasTables = tableById.has(relationship.referencedTableId) && tableById.has(relationship.localTableId);

    if (!hasTables || relationship.referencedTableId === relationship.localTableId) {
      continue;
    }

    graph.setEdge(relationship.referencedTableId, relationship.localTableId);
  }

  dagre.layout(graph);

  const tableLayouts = project.tables.map((table) => {
    const node = graph.node(table.id) as DagreNodeLayout | undefined;
    const width = node?.width ?? DEFAULT_TABLE_WIDTH;
    const height = node?.height ?? tableNodeHeight(table);

    return {
      tableId: table.id,
      position: {
        x: Math.max(36, Math.round((node?.x ?? width / 2) - width / 2)),
        y: Math.max(88, Math.round((node?.y ?? height / 2) - height / 2)),
      },
      size: {
        width,
        height,
      },
    };
  });

  return {
    ...project,
    layout: {
      ...project.layout,
      tables: tableLayouts,
    },
  };
}

function tableNodeHeight(table: Table) {
  return Math.max(160, 58 + table.columns.length * 34);
}

export function duplicateTable(project: ProjectSchema, tableId: string): { project: ProjectSchema; tableId: string } | null {
  const table = project.tables.find((candidate) => candidate.id === tableId);

  if (!table) {
    return null;
  }

  const nextTableId = createId('table');
  const columnIdByOriginalId = new Map(table.columns.map((column) => [column.id, createId('column')]));
  const nextName = nextTableName(project.tables, table);
  const sourceLayout = project.layout.tables.find((tableLayout) => tableLayout.tableId === table.id);
  const nextPosition = sourceLayout
    ? { x: sourceLayout.position.x + 48, y: sourceLayout.position.y + 48 }
    : { x: 140 + project.tables.length * 32, y: 140 + project.tables.length * 32 };

  const nextTable: Table = {
    ...table,
    id: nextTableId,
    name: nextName,
    columns: table.columns.map((column) => cloneColumn(column, columnIdByOriginalId.get(column.id) ?? createId('column'))),
    indexes: table.indexes.map((index) => ({
      ...index,
      id: createId('index'),
      name: `${index.name}_${nextName}`,
      columns: index.columns
        .map((indexColumn) => {
          const nextColumnId = columnIdByOriginalId.get(indexColumn.columnId);

          return nextColumnId ? { ...indexColumn, columnId: nextColumnId } : null;
        })
        .filter((indexColumn): indexColumn is { columnId: string; order: 'asc' | 'desc' } => Boolean(indexColumn)),
    })),
  };

  return {
    tableId: nextTableId,
    project: {
      ...project,
      tables: [...project.tables, nextTable],
      layout: {
        ...project.layout,
        tables: [
          ...project.layout.tables,
          {
            tableId: nextTableId,
            position: nextPosition,
            size: sourceLayout?.size,
          },
        ],
      },
    },
  };
}

function addColumnProblems(problems: SchemaProblem[], table: Table) {
  const columnsByName = new Map<string, Column[]>();

  for (const column of table.columns) {
    const columnName = column.name.trim();
    const columnKey = normalizeIdentifier(column.name);
    const existingColumns = columnsByName.get(columnKey) ?? [];
    columnsByName.set(columnKey, [...existingColumns, column]);

    if (!columnName) {
      problems.push({
        id: `column-name-empty-${table.id}-${column.id}`,
        severity: 'error',
        title: `${tableLabel(table)} has a column without name`,
        message: 'Every column needs a name before SQL can be generated safely.',
        target: { tableId: table.id, columnId: column.id },
      });
    }
  }

  for (const duplicateColumns of columnsByName.values()) {
    if (duplicateColumns.length < 2) {
      continue;
    }

    for (const column of duplicateColumns) {
      problems.push({
        id: `column-duplicate-${table.id}-${column.id}`,
        severity: 'error',
        title: `${tableLabel(table)} has duplicate columns`,
        message: `Column "${column.name || '(empty)'}" is repeated in the same table.`,
        target: { tableId: table.id, columnId: column.id },
      });
    }
  }
}

function addIndexProblems(problems: SchemaProblem[], table: Table) {
  for (const index of table.indexes) {
    if (index.columns.length === 0) {
      problems.push({
        id: `index-empty-${table.id}-${index.id}`,
        severity: 'warning',
        title: `${index.name} has no columns`,
        message: 'Indexes without columns are ignored by most database engines.',
        target: { tableId: table.id, indexId: index.id },
      });
    }

    const missingColumn = index.columns.find((indexColumn) => !table.columns.some((column) => column.id === indexColumn.columnId));

    if (missingColumn) {
      problems.push({
        id: `index-missing-column-${table.id}-${index.id}`,
        severity: 'error',
        title: `${index.name} references a missing column`,
        message: 'Remove the index column or point it to an existing column.',
        target: { tableId: table.id, indexId: index.id },
      });
    }
  }
}

function cloneColumn(column: Column, id: string): Column {
  return {
    ...column,
    id,
    type: { ...column.type },
    default: column.default ? { ...column.default } : undefined,
  };
}

function isUniqueKey(table: Table, columnIds: string[]) {
  const key = sortedKey(columnIds);
  const primaryKeyColumnIds = table.columns.filter((column) => column.primaryKey).map((column) => column.id);

  if (primaryKeyColumnIds.length > 0 && sortedKey(primaryKeyColumnIds) === key) {
    return true;
  }

  if (columnIds.length === 1) {
    const column = table.columns.find((candidate) => candidate.id === columnIds[0]);

    if (column?.unique) {
      return true;
    }
  }

  return table.indexes.some((index) => index.unique && sortedKey(index.columns.map((column) => column.columnId)) === key);
}

function sortedKey(values: string[]) {
  return [...values].sort().join(':');
}

function nextTableName(tables: Table[], table: Table) {
  const baseName = table.name.trim() || 'table';
  const existingNames = new Set(tables.filter((candidate) => candidate.schema === table.schema).map((candidate) => normalizeIdentifier(candidate.name)));
  let candidateName = `${baseName}_copy`;
  let index = 2;

  while (existingNames.has(normalizeIdentifier(candidateName))) {
    candidateName = `${baseName}_copy_${index}`;
    index += 1;
  }

  return candidateName;
}

function tableIdentifierKey(schema: string | undefined, name: string) {
  return `${normalizeIdentifier(schema ?? '')}.${normalizeIdentifier(name)}`;
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function tableLabel(table: Table) {
  const name = table.name.trim() || '(unnamed table)';

  return table.schema ? `${table.schema}.${name}` : name;
}
