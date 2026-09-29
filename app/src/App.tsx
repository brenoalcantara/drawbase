import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { importDatabaseSchema, type IntrospectionConnection, type IntrospectionImportResponse } from './api/introspection';
import {
  deleteSavedProject,
  listProjects,
  loadProject,
  saveProject as persistProject,
  type ProjectSummary,
} from './api/projects';
import { generateSql, type SqlGenerateResponse } from './api/sql';
import { TableNode } from './components/TableNode';
import {
  columnTypeFromKind,
  createColumn,
  createId,
  createInitialProject,
  createTable,
  type Column,
  type DatabaseDialect,
  type LogicalColumnType,
  type ProjectSchema,
  type Table,
} from './model/schema';
import { projectToEdges, projectToNodes, relationshipFromConnection } from './model/reactFlowAdapter';

const nodeTypes = {
  table: TableNode,
};

type SqlState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  sql: string;
  warnings: SqlGenerateResponse['warnings'];
  message: string | null;
};

type ProjectPersistenceState = {
  status: 'idle' | 'loading' | 'saving' | 'ready' | 'error';
  projects: ProjectSummary[];
  message: string | null;
};

type ImportState = {
  status: 'idle' | 'importing' | 'ready' | 'error';
  message: string | null;
  warnings: IntrospectionImportResponse['warnings'];
};

type ImportFormState = {
  dialect: DatabaseDialect;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  schemas: string;
  sqliteFilePath: string;
};

type PositionNodeChange = Extract<NodeChange, { type: 'position' }> & {
  position: { x: number; y: number };
};

const initialImportForm: ImportFormState = {
  dialect: 'postgres',
  host: 'postgres-test',
  port: '5432',
  database: 'drawbase_dev',
  user: 'drawbase',
  password: 'drawbase_dev_password',
  schemas: 'public',
  sqliteFilePath: 'example.sqlite',
};

export default function App() {
  const [project, setProject] = useState<ProjectSchema>(() => createInitialProject());
  const [selectedTableId, setSelectedTableId] = useState<string | null>('table_users');
  const [sqlState, setSqlState] = useState<SqlState>({
    status: 'idle',
    sql: '',
    warnings: [],
    message: null,
  });
  const [projectState, setProjectState] = useState<ProjectPersistenceState>({
    status: 'idle',
    projects: [],
    message: null,
  });
  const [importState, setImportState] = useState<ImportState>({
    status: 'idle',
    message: null,
    warnings: [],
  });
  const [importForm, setImportForm] = useState<ImportFormState>(initialImportForm);

  const nodes = useMemo(() => projectToNodes(project, selectedTableId), [project, selectedTableId]);
  const edges = useMemo(() => projectToEdges(project), [project]);
  const selectedTable = project.tables.find((table) => table.id === selectedTableId) ?? project.tables[0] ?? null;

  const refreshProjects = useCallback(async () => {
    setProjectState((current) => ({ ...current, status: 'loading', message: null }));

    try {
      const projects = await listProjects();
      setProjectState({ status: 'ready', projects, message: null });
    } catch (error) {
      setProjectState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Project list failed.',
      }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setProjectState((current) => ({ ...current, status: 'loading', message: null }));

    listProjects(controller.signal)
      .then((projects) => {
        setProjectState({ status: 'ready', projects, message: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setProjectState((current) => ({
          ...current,
          status: 'error',
          message: error instanceof Error ? error.message : 'Project list failed.',
        }));
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSqlState((current) => ({ ...current, status: 'loading', message: null }));

      generateSql(project, controller.signal)
        .then((response) => {
          setSqlState({
            status: 'ready',
            sql: response.sql,
            warnings: response.warnings,
            message: null,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          setSqlState({
            status: 'error',
            sql: '',
            warnings: [],
            message: error instanceof Error ? error.message : 'SQL generation failed.',
          });
        });
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [project]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positionChanges = changes.filter(isPositionNodeChange);

    if (positionChanges.length === 0) {
      return;
    }

    setProject((current) => {
      let changed = false;
      const tables = current.layout.tables.map((tableLayout) => {
        const positionChange = positionChanges.find((change) => change.id === tableLayout.tableId);

        if (!positionChange) {
          return tableLayout;
        }

        if (
          tableLayout.position.x === positionChange.position.x &&
          tableLayout.position.y === positionChange.position.y
        ) {
          return tableLayout;
        }

        changed = true;
        return { ...tableLayout, position: positionChange.position };
      });

      return changed
        ? {
            ...current,
            layout: {
              ...current.layout,
              tables,
            },
          }
        : current;
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removedEdgeIds = changes.filter((change) => change.type === 'remove').map((change) => change.id);

    if (removedEdgeIds.length === 0) {
      return;
    }

    setProject((current) => ({
      ...current,
      relationships: current.relationships.filter((relationship) => !removedEdgeIds.includes(relationship.id)),
    }));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    const relationship = relationshipFromConnection(connection.sourceHandle, connection.targetHandle);

    if (!relationship) {
      return;
    }

    setProject((current) => ({
      ...current,
      relationships: [
        ...current.relationships.filter(
          (candidate) =>
            candidate.localTableId !== relationship.localTableId ||
            candidate.localColumnIds[0] !== relationship.localColumnIds[0],
        ),
        relationship,
      ],
    }));
    setSelectedTableId(relationship.localTableId);
  }, []);

  const addTable = useCallback(() => {
    setProject((current) => {
      const position = { x: 160 + current.tables.length * 40, y: 160 + current.tables.length * 32 };
      const table = createTable(position, current.tables.length + 1);

      setSelectedTableId(table.id);

      return {
        ...current,
        tables: [...current.tables, table],
        layout: {
          ...current.layout,
          tables: [...current.layout.tables, { tableId: table.id, position }],
        },
      };
    });
  }, []);

  const createNewProject = useCallback(() => {
    const nextProject = createInitialProject({
      id: createId('project'),
      name: 'Untitled Model',
    });

    setProject(nextProject);
    setSelectedTableId(nextProject.tables[0]?.id ?? null);
    setProjectState((current) => ({ ...current, message: null }));
  }, []);

  const saveCurrentProject = useCallback(async () => {
    setProjectState((current) => ({ ...current, status: 'saving', message: null }));

    try {
      const record = await persistProject(project);
      const projects = await listProjects();

      setProject(record.project);
      setSelectedTableId((current) =>
        record.project.tables.some((table) => table.id === current) ? current : record.project.tables[0]?.id ?? null,
      );
      setProjectState({ status: 'ready', projects, message: 'Saved' });
    } catch (error) {
      setProjectState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Project save failed.',
      }));
    }
  }, [project]);

  const loadSavedProject = useCallback(async (projectId: string) => {
    setProjectState((current) => ({ ...current, status: 'loading', message: null }));

    try {
      const record = await loadProject(projectId);
      const projects = await listProjects();

      setProject(record.project);
      setSelectedTableId(record.project.tables[0]?.id ?? null);
      setProjectState({ status: 'ready', projects, message: 'Loaded' });
    } catch (error) {
      setProjectState((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Project load failed.',
      }));
    }
  }, []);

  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!window.confirm('Delete this project?')) {
        return;
      }

      setProjectState((current) => ({ ...current, status: 'loading', message: null }));

      try {
        await deleteSavedProject(projectId);
        const projects = await listProjects();

        if (project.id === projectId) {
          const nextProject = createInitialProject({
            id: createId('project'),
            name: 'Untitled Model',
          });

          setProject(nextProject);
          setSelectedTableId(nextProject.tables[0]?.id ?? null);
        }

        setProjectState({ status: 'ready', projects, message: 'Deleted' });
      } catch (error) {
        setProjectState((current) => ({
          ...current,
          status: 'error',
          message: error instanceof Error ? error.message : 'Project delete failed.',
        }));
      }
    },
    [project.id],
  );

  const updateImportForm = useCallback((update: Partial<ImportFormState>) => {
    setImportForm((current) => {
      const next = { ...current, ...update };

      if (update.dialect === 'postgres') {
        return { ...next, host: 'postgres-test', port: '5432', database: 'drawbase_dev', user: 'drawbase' };
      }

      if (update.dialect === 'mysql') {
        return { ...next, host: 'mysql-test', port: '3306', database: 'drawbase_dev', user: 'drawbase', schemas: '' };
      }

      if (update.dialect === 'sqlite') {
        return { ...next, host: '', port: '', database: '', user: '', password: '', schemas: '' };
      }

      return next;
    });
  }, []);

  const importSchema = useCallback(async () => {
    setImportState({ status: 'importing', message: null, warnings: [] });

    try {
      const response = await importDatabaseSchema(createImportConnection(importForm), {
        id: createId('project'),
        name: `${importForm.database || importForm.sqliteFilePath || 'Database'} Import`,
      });

      setProject(response.project);
      setSelectedTableId(response.project.tables[0]?.id ?? null);
      setImportState({
        status: 'ready',
        message: `Imported ${response.stats.tables} tables`,
        warnings: response.warnings,
      });
      setProjectState((current) => ({ ...current, message: null }));
    } catch (error) {
      setImportState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Database import failed.',
        warnings: [],
      });
    }
  }, [importForm]);

  const updateProjectName = useCallback((name: string) => {
    setProject((current) => ({ ...current, name }));
  }, []);

  const updateDialect = useCallback((dialect: DatabaseDialect) => {
    setProject((current) => ({ ...current, dialect }));
  }, []);

  const updateTable = useCallback((tableId: string, update: Partial<Pick<Table, 'name' | 'schema'>>) => {
    setProject((current) => ({
      ...current,
      tables: current.tables.map((table) => (table.id === tableId ? { ...table, ...update } : table)),
    }));
  }, []);

  const deleteTable = useCallback((tableId: string) => {
    setProject((current) => ({
      ...current,
      tables: current.tables.filter((table) => table.id !== tableId),
      relationships: current.relationships.filter(
        (relationship) => relationship.localTableId !== tableId && relationship.referencedTableId !== tableId,
      ),
      layout: {
        ...current.layout,
        tables: current.layout.tables.filter((tableLayout) => tableLayout.tableId !== tableId),
      },
    }));
    setSelectedTableId((current) => (current === tableId ? null : current));
  }, []);

  const addColumn = useCallback((tableId: string) => {
    setProject((current) => ({
      ...current,
      tables: current.tables.map((table) =>
        table.id === tableId
          ? {
              ...table,
              columns: [
                ...table.columns,
                createColumn(createId('column'), `column_${table.columns.length + 1}`, { kind: 'varchar', length: 255 }),
              ],
            }
          : table,
      ),
    }));
  }, []);

  const updateColumn = useCallback((tableId: string, columnId: string, update: Partial<Column>) => {
    setProject((current) => ({
      ...current,
      tables: current.tables.map((table) =>
        table.id === tableId
          ? {
              ...table,
              columns: table.columns.map((column) =>
                column.id === columnId
                  ? normalizeColumn({
                      ...column,
                      ...update,
                    })
                  : column,
              ),
            }
          : table,
      ),
    }));
  }, []);

  const deleteColumn = useCallback((tableId: string, columnId: string) => {
    setProject((current) => ({
      ...current,
      tables: current.tables.map((table) =>
        table.id === tableId
          ? {
              ...table,
              columns: table.columns.filter((column) => column.id !== columnId),
              indexes: table.indexes
                .map((index) => ({
                  ...index,
                  columns: index.columns.filter((indexColumn) => indexColumn.columnId !== columnId),
                }))
                .filter((index) => index.columns.length > 0),
            }
          : table,
      ),
      relationships: current.relationships.filter(
        (relationship) =>
          !(
            (relationship.localTableId === tableId && relationship.localColumnIds.includes(columnId)) ||
            (relationship.referencedTableId === tableId && relationship.referencedColumnIds.includes(columnId))
          ),
      ),
    }));
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">D</span>
          <div>
            <strong>DrawBase</strong>
            <input
              aria-label="Project name"
              className="project-name-input"
              onChange={(event) => updateProjectName(event.target.value)}
              value={project.name}
            />
          </div>
        </div>
        <div className="topbar-actions">
          <label className="field-inline">
            <span>Dialect</span>
            <select onChange={(event) => updateDialect(event.target.value as DatabaseDialect)} value={project.dialect}>
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="sqlite">SQLite</option>
            </select>
          </label>
          <button className="secondary-button" onClick={createNewProject} type="button">
            New
          </button>
          <button className="primary-button" disabled={projectState.status === 'saving'} onClick={saveCurrentProject} type="button">
            {projectState.status === 'saving' ? 'Saving' : 'Save'}
          </button>
          <button className="primary-button" onClick={addTable} type="button">
            + Table
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar sidebar--left">
          <ProjectsPanel
            currentProjectId={project.id}
            message={projectState.message}
            onDelete={deleteProject}
            onLoad={loadSavedProject}
            onRefresh={refreshProjects}
            projects={projectState.projects}
            status={projectState.status}
          />

          <ImportPanel
            form={importForm}
            onImport={importSchema}
            onUpdate={updateImportForm}
            state={importState}
          />

          <section className="sidebar-section">
            <PanelTitle title="Tables" />
            <div className="table-list">
              {project.tables.map((table) => (
                <button
                  className={table.id === selectedTable?.id ? 'table-list-item is-active' : 'table-list-item'}
                  key={table.id}
                  onClick={() => setSelectedTableId(table.id)}
                  type="button"
                >
                  <span>{table.name}</span>
                  <small>{table.columns.length}</small>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="canvas-area">
          <ReactFlow
            edges={edges}
            nodeTypes={nodeTypes}
            nodes={nodes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedTableId(node.id)}
            onNodesChange={onNodesChange}
          >
            <Background color="#d7dce2" gap={24} />
            <Controls position="bottom-left" />
            <MiniMap pannable position="bottom-right" zoomable />
          </ReactFlow>
        </section>

        <aside className="sidebar sidebar--right">
          {selectedTable ? (
            <TableInspector
              onAddColumn={addColumn}
              onDeleteColumn={deleteColumn}
              onDeleteTable={deleteTable}
              onUpdateColumn={updateColumn}
              onUpdateTable={updateTable}
              table={selectedTable}
            />
          ) : (
            <section className="inspector-section">
              <PanelTitle title="Table" />
            </section>
          )}

          <section className="sql-panel">
            <div className="panel-title-row">
              <PanelTitle title="SQL" />
              <span className={`status-pill status-pill--${sqlState.status}`}>{statusLabel(sqlState.status)}</span>
            </div>
            <pre className="sql-output">
              {sqlState.status === 'error' ? `-- ${sqlState.message ?? 'API unavailable'}` : sqlState.sql || '--'}
            </pre>
            {sqlState.warnings.length > 0 ? (
              <div className="warning-list">
                {sqlState.warnings.map((warning) => (
                  <p key={`${warning.code}-${warning.message}`}>{warning.message}</p>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}

function ImportPanel({
  form,
  onImport,
  onUpdate,
  state,
}: {
  form: ImportFormState;
  onImport: () => void;
  onUpdate: (update: Partial<ImportFormState>) => void;
  state: ImportState;
}) {
  return (
    <section className="sidebar-section import-panel">
      <PanelTitle title="Import" />

      <label className="field compact-field">
        <span>Source</span>
        <select onChange={(event) => onUpdate({ dialect: event.target.value as DatabaseDialect })} value={form.dialect}>
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="sqlite">SQLite</option>
        </select>
      </label>

      {form.dialect === 'sqlite' ? (
        <label className="field compact-field">
          <span>SQLite file</span>
          <input onChange={(event) => onUpdate({ sqliteFilePath: event.target.value })} value={form.sqliteFilePath} />
        </label>
      ) : (
        <>
          <div className="split-fields">
            <label className="field compact-field">
              <span>Host</span>
              <input onChange={(event) => onUpdate({ host: event.target.value })} value={form.host} />
            </label>
            <label className="field compact-field">
              <span>Port</span>
              <input onChange={(event) => onUpdate({ port: event.target.value })} value={form.port} />
            </label>
          </div>
          <label className="field compact-field">
            <span>Database</span>
            <input onChange={(event) => onUpdate({ database: event.target.value })} value={form.database} />
          </label>
          <div className="split-fields">
            <label className="field compact-field">
              <span>User</span>
              <input onChange={(event) => onUpdate({ user: event.target.value })} value={form.user} />
            </label>
            <label className="field compact-field">
              <span>Password</span>
              <input
                onChange={(event) => onUpdate({ password: event.target.value })}
                type="password"
                value={form.password}
              />
            </label>
          </div>
          {form.dialect === 'postgres' ? (
            <label className="field compact-field">
              <span>Schemas</span>
              <input onChange={(event) => onUpdate({ schemas: event.target.value })} value={form.schemas} />
            </label>
          ) : null}
        </>
      )}

      <button className="secondary-button wide-button" disabled={state.status === 'importing'} onClick={onImport} type="button">
        {state.status === 'importing' ? 'Importing' : 'Import Schema'}
      </button>

      {state.message ? (
        <p className={state.status === 'error' ? 'sidebar-message sidebar-message--error' : 'sidebar-message'}>{state.message}</p>
      ) : null}
      {state.warnings.length > 0 ? (
        <div className="sidebar-warning-list">
          {state.warnings.map((warning) => (
            <p key={`${warning.code}-${warning.message}`}>{warning.message}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProjectsPanel({
  currentProjectId,
  message,
  onDelete,
  onLoad,
  onRefresh,
  projects,
  status,
}: {
  currentProjectId: string;
  message: string | null;
  onDelete: (projectId: string) => void;
  onLoad: (projectId: string) => void;
  onRefresh: () => void;
  projects: ProjectSummary[];
  status: ProjectPersistenceState['status'];
}) {
  return (
    <section className="sidebar-section">
      <div className="panel-title-row">
        <PanelTitle title="Projects" />
        <button className="icon-button" disabled={status === 'loading'} onClick={onRefresh} title="Refresh projects" type="button">
          ↻
        </button>
      </div>

      <div className="project-list">
        {projects.length > 0 ? (
          projects.map((project) => (
            <div className={project.id === currentProjectId ? 'project-list-row is-active' : 'project-list-row'} key={project.id}>
              <button className="project-list-item" onClick={() => onLoad(project.id)} type="button">
                <span>{project.name}</span>
                <small>
                  {project.dialect} / {project.tables} tables / {formatProjectDate(project.updatedAt)}
                </small>
              </button>
              <button className="icon-button danger-button" onClick={() => onDelete(project.id)} title="Delete project" type="button">
                x
              </button>
            </div>
          ))
        ) : (
          <p className="empty-state">No saved projects</p>
        )}
      </div>

      {message ? <p className={status === 'error' ? 'sidebar-message sidebar-message--error' : 'sidebar-message'}>{message}</p> : null}
    </section>
  );
}

function createImportConnection(form: ImportFormState): IntrospectionConnection {
  const timeoutMs = 5000;

  if (form.dialect === 'sqlite') {
    return {
      dialect: 'sqlite',
      filePath: form.sqliteFilePath,
      timeoutMs,
    };
  }

  if (form.dialect === 'mysql') {
    return {
      dialect: 'mysql',
      host: form.host,
      port: Number.parseInt(form.port || '3306', 10),
      database: form.database,
      user: form.user,
      password: form.password,
      timeoutMs,
    };
  }

  return {
    dialect: 'postgres',
    host: form.host,
    port: Number.parseInt(form.port || '5432', 10),
    database: form.database,
    user: form.user,
    password: form.password,
    schemas: form.schemas
      .split(',')
      .map((schema) => schema.trim())
      .filter(Boolean),
    ssl: false,
    timeoutMs,
  };
}

function TableInspector({
  onAddColumn,
  onDeleteColumn,
  onDeleteTable,
  onUpdateColumn,
  onUpdateTable,
  table,
}: {
  onAddColumn: (tableId: string) => void;
  onDeleteColumn: (tableId: string, columnId: string) => void;
  onDeleteTable: (tableId: string) => void;
  onUpdateColumn: (tableId: string, columnId: string, update: Partial<Column>) => void;
  onUpdateTable: (tableId: string, update: Partial<Pick<Table, 'name' | 'schema'>>) => void;
  table: Table;
}) {
  return (
    <section className="inspector-section">
      <div className="panel-title-row">
        <PanelTitle title="Table" />
        <button className="icon-button danger-button" onClick={() => onDeleteTable(table.id)} title="Delete table" type="button">
          x
        </button>
      </div>

      <label className="field">
        <span>Name</span>
        <input onChange={(event) => onUpdateTable(table.id, { name: event.target.value })} value={table.name} />
      </label>
      <label className="field">
        <span>Schema</span>
        <input onChange={(event) => onUpdateTable(table.id, { schema: event.target.value || undefined })} value={table.schema ?? ''} />
      </label>

      <div className="panel-title-row panel-title-row--spaced">
        <PanelTitle title="Columns" />
        <button className="secondary-button" onClick={() => onAddColumn(table.id)} type="button">
          + Column
        </button>
      </div>

      <div className="column-editor-list">
        {table.columns.map((column) => (
          <ColumnEditor
            column={column}
            key={column.id}
            onDelete={() => onDeleteColumn(table.id, column.id)}
            onUpdate={(update) => onUpdateColumn(table.id, column.id, update)}
          />
        ))}
      </div>
    </section>
  );
}

function ColumnEditor({
  column,
  onDelete,
  onUpdate,
}: {
  column: Column;
  onDelete: () => void;
  onUpdate: (update: Partial<Column>) => void;
}) {
  return (
    <div className="column-editor">
      <div className="column-editor__row">
        <input aria-label="Column name" onChange={(event) => onUpdate({ name: event.target.value })} value={column.name} />
        <button className="icon-button" onClick={onDelete} title="Delete column" type="button">
          -
        </button>
      </div>
      <div className="column-editor__row">
        <select
          aria-label="Column type"
          onChange={(event) => onUpdate({ type: columnTypeFromKind(event.target.value as LogicalColumnType['kind']) })}
          value={column.type.kind}
        >
          <option value="integer">Integer</option>
          <option value="decimal">Decimal</option>
          <option value="varchar">Varchar</option>
          <option value="text">Text</option>
          <option value="boolean">Boolean</option>
          <option value="date">Date</option>
          <option value="time">Time</option>
          <option value="timestamp">Timestamp</option>
          <option value="json">JSON</option>
          <option value="uuid">UUID</option>
          <option value="binary">Binary</option>
          <option value="custom">Custom</option>
        </select>
        {column.type.kind === 'varchar' ? (
          <input
            aria-label="Column length"
            min="1"
            onChange={(event) => updateVarcharLength(column, event.target.value, onUpdate)}
            type="number"
            value={column.type.length}
          />
        ) : null}
      </div>
      {column.type.kind === 'integer' ? (
        <label className="check-field">
          <input
            checked={Boolean(column.type.autoIncrement)}
            onChange={(event) => updateIntegerAutoIncrement(column, event.target.checked, onUpdate)}
            type="checkbox"
          />
          <span>Auto</span>
        </label>
      ) : null}
      <div className="column-flags">
        <label className="check-field">
          <input
            checked={column.primaryKey}
            onChange={(event) => onUpdate({ primaryKey: event.target.checked, nullable: event.target.checked ? false : column.nullable })}
            type="checkbox"
          />
          <span>PK</span>
        </label>
        <label className="check-field">
          <input checked={!column.nullable} disabled={column.primaryKey} onChange={(event) => onUpdate({ nullable: !event.target.checked })} type="checkbox" />
          <span>NN</span>
        </label>
        <label className="check-field">
          <input checked={column.unique} onChange={(event) => onUpdate({ unique: event.target.checked })} type="checkbox" />
          <span>UQ</span>
        </label>
      </div>
      <input
        aria-label="Default value"
        className="default-input"
        onChange={(event) => onUpdate({ default: defaultFromInput(event.target.value) })}
        placeholder="Default"
        value={defaultToInput(column.default)}
      />
    </div>
  );
}

function PanelTitle({ title }: { title: string }) {
  return <h2 className="panel-title">{title}</h2>;
}

function formatProjectDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: '2-digit',
  });
}

function normalizeColumn(column: Column): Column {
  return column.primaryKey ? { ...column, nullable: false } : column;
}

function updateVarcharLength(column: Column, value: string, onUpdate: (update: Partial<Column>) => void) {
  if (column.type.kind !== 'varchar') {
    return;
  }

  onUpdate({
    type: {
      ...column.type,
      length: Number.parseInt(value || '1', 10),
    },
  });
}

function updateIntegerAutoIncrement(column: Column, checked: boolean, onUpdate: (update: Partial<Column>) => void) {
  if (column.type.kind !== 'integer') {
    return;
  }

  onUpdate({
    type: {
      ...column.type,
      autoIncrement: checked,
    },
  });
}

function defaultToInput(defaultValue: Column['default']) {
  if (!defaultValue) {
    return '';
  }

  if (defaultValue.kind === 'currentTimestamp') {
    return 'CURRENT_TIMESTAMP';
  }

  if (defaultValue.kind === 'uuid') {
    return 'UUID';
  }

  if (defaultValue.kind === 'expression') {
    return `=${defaultValue.value}`;
  }

  return String(defaultValue.value ?? 'NULL');
}

function defaultFromInput(value: string): Column['default'] | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.toUpperCase() === 'CURRENT_TIMESTAMP') {
    return { kind: 'currentTimestamp' };
  }

  if (trimmed.toUpperCase() === 'UUID') {
    return { kind: 'uuid' };
  }

  if (trimmed.startsWith('=')) {
    return { kind: 'expression', value: trimmed.slice(1) || 'NULL' };
  }

  if (trimmed.toUpperCase() === 'NULL') {
    return { kind: 'literal', value: null };
  }

  if (trimmed === 'true' || trimmed === 'false') {
    return { kind: 'literal', value: trimmed === 'true' };
  }

  const numericValue = Number(trimmed);

  if (!Number.isNaN(numericValue) && trimmed !== '') {
    return { kind: 'literal', value: numericValue };
  }

  return { kind: 'literal', value: trimmed };
}

function statusLabel(status: SqlState['status']) {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'loading':
      return 'Generating';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Offline';
  }
}

function isPositionNodeChange(change: NodeChange): change is PositionNodeChange {
  return change.type === 'position' && Boolean(change.position);
}
