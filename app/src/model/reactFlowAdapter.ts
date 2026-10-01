import type { Edge, Node } from '@xyflow/react';

import type { SchemaProblemSeverity } from './projectOperations';
import type { ProjectSchema, Relationship, Table } from './schema';

export type ColumnHandleKind = 'source' | 'target';

export type TableNodeData = {
  table: Table;
  selected: boolean;
};

export type TableNode = Node<TableNodeData, 'table'>;

export function columnHandleId(tableId: string, columnId: string, kind: ColumnHandleKind) {
  return `${tableId}:${columnId}:${kind}`;
}

export function parseColumnHandleId(handleId: string | null | undefined) {
  if (!handleId) {
    return null;
  }

  const [tableId, columnId, kind] = handleId.split(':');

  if (!tableId || !columnId || (kind !== 'source' && kind !== 'target')) {
    return null;
  }

  return { tableId, columnId, kind };
}

export function projectToNodes(project: ProjectSchema, selectedTableId: string | null): TableNode[] {
  return project.tables.map((table, index) => {
    const layout = project.layout.tables.find((tableLayout) => tableLayout.tableId === table.id);

    return {
      id: table.id,
      type: 'table',
      position: layout?.position ?? { x: 120 + index * 340, y: 120 },
      initialWidth: layout?.size?.width ?? 300,
      initialHeight: layout?.size?.height ?? 220,
      width: layout?.size?.width ?? 300,
      height: layout?.size?.height ?? 220,
      data: {
        table,
        selected: selectedTableId === table.id,
      },
    };
  });
}

export function projectToEdges(project: ProjectSchema, relationshipProblems: Map<string, SchemaProblemSeverity> = new Map()): Edge[] {
  return project.relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.referencedTableId,
    target: relationship.localTableId,
    sourceHandle: columnHandleId(relationship.referencedTableId, relationship.referencedColumnIds[0], 'source'),
    targetHandle: columnHandleId(relationship.localTableId, relationship.localColumnIds[0], 'target'),
    animated: false,
    className: relationshipProblems.has(relationship.id)
      ? `relationship-edge relationship-edge--${relationshipProblems.get(relationship.id)}`
      : 'relationship-edge',
  }));
}

export function relationshipFromConnection(
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
): Relationship | null {
  const source = parseColumnHandleId(sourceHandle);
  const target = parseColumnHandleId(targetHandle);

  if (!source || !target || source.kind !== 'source' || target.kind !== 'target') {
    return null;
  }

  return {
    id: `relationship_${target.tableId}_${target.columnId}_${source.tableId}_${source.columnId}`,
    name: `fk_${target.tableId.replace(/^table_/, '')}_${source.tableId.replace(/^table_/, '')}`,
    localTableId: target.tableId,
    localColumnIds: [target.columnId],
    referencedTableId: source.tableId,
    referencedColumnIds: [source.columnId],
    onDelete: 'noAction',
    onUpdate: 'noAction',
  };
}
