import { Handle, Position, type NodeProps } from '@xyflow/react';

import { formatColumnType, type Table } from '../model/schema';
import { columnHandleId } from '../model/reactFlowAdapter';

export function TableNode({ data, selected }: NodeProps) {
  const nodeData = data as { table: Table; selected: boolean };
  const { table } = nodeData;

  return (
    <section className={`table-node ${selected || nodeData.selected ? 'is-selected' : ''}`}>
      <header className="table-node__header">
        <span>{table.schema ? `${table.schema}.${table.name}` : table.name}</span>
      </header>
      <div className="table-node__columns">
        {table.columns.map((column) => (
          <div className="table-node__column" key={column.id}>
            <Handle
              className="column-handle column-handle--target"
              id={columnHandleId(table.id, column.id, 'target')}
              position={Position.Left}
              type="target"
            />
            <span className="table-node__column-name">
              {column.primaryKey ? <span className="column-badge">PK</span> : null}
              {column.name}
            </span>
            <span className="table-node__column-type">{formatColumnType(column.type)}</span>
            <Handle
              className="column-handle column-handle--source"
              id={columnHandleId(table.id, column.id, 'source')}
              position={Position.Right}
              type="source"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

