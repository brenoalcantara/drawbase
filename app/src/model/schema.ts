export type DatabaseDialect = 'postgres' | 'mysql' | 'sqlite';

export type LogicalColumnType =
  | { kind: 'integer'; size?: 'small' | 'standard' | 'big'; autoIncrement?: boolean }
  | { kind: 'decimal'; precision?: number; scale?: number }
  | { kind: 'varchar'; length: number }
  | { kind: 'text' }
  | { kind: 'boolean' }
  | { kind: 'date' }
  | { kind: 'time' }
  | { kind: 'timestamp'; withTimezone?: boolean }
  | { kind: 'json' }
  | { kind: 'uuid' }
  | { kind: 'binary' }
  | { kind: 'custom'; raw: string };

export type ColumnDefault =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'expression'; value: string }
  | { kind: 'currentTimestamp' }
  | { kind: 'uuid' };

export type Column = {
  id: string;
  name: string;
  type: LogicalColumnType;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  default?: ColumnDefault;
};

export type Index = {
  id: string;
  name: string;
  unique: boolean;
  columns: Array<{ columnId: string; order: 'asc' | 'desc' }>;
  method?: 'btree' | 'hash' | 'gin' | 'gist' | 'fulltext';
  where?: string;
};

export type Table = {
  id: string;
  name: string;
  schema?: string;
  columns: Column[];
  indexes: Index[];
};

export type Relationship = {
  id: string;
  name?: string;
  localTableId: string;
  localColumnIds: string[];
  referencedTableId: string;
  referencedColumnIds: string[];
  onDelete?: 'cascade' | 'restrict' | 'setNull' | 'setDefault' | 'noAction';
  onUpdate?: 'cascade' | 'restrict' | 'setNull' | 'setDefault' | 'noAction';
};

export type TableLayout = {
  tableId: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  collapsed?: boolean;
};

export type ProjectSchema = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  dialect: DatabaseDialect;
  tables: Table[];
  relationships: Relationship[];
  layout: {
    viewport: { x: number; y: number; zoom: number };
    tables: TableLayout[];
  };
  metadata?: {
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
};

export function createInitialProject(options: { id?: string; name?: string } = {}): ProjectSchema {
  return {
    schemaVersion: '1.0.0',
    id: options.id ?? 'project_drawbase_local',
    name: options.name ?? 'DrawBase Model',
    dialect: 'postgres',
    tables: [
      {
        id: 'table_users',
        name: 'users',
        schema: 'public',
        columns: [
          createColumn('column_users_id', 'id', { kind: 'integer', size: 'big', autoIncrement: true }, {
            primaryKey: true,
            nullable: false,
          }),
          createColumn('column_users_email', 'email', { kind: 'varchar', length: 255 }, { nullable: false, unique: true }),
          createColumn('column_users_created_at', 'created_at', { kind: 'timestamp', withTimezone: true }, {
            nullable: false,
            default: { kind: 'currentTimestamp' },
          }),
        ],
        indexes: [
          {
            id: 'index_users_email',
            name: 'idx_users_email',
            unique: true,
            columns: [{ columnId: 'column_users_email', order: 'asc' }],
            method: 'btree',
          },
        ],
      },
      {
        id: 'table_posts',
        name: 'posts',
        schema: 'public',
        columns: [
          createColumn('column_posts_id', 'id', { kind: 'integer', size: 'big', autoIncrement: true }, {
            primaryKey: true,
            nullable: false,
          }),
          createColumn('column_posts_user_id', 'user_id', { kind: 'integer', size: 'big' }, { nullable: false }),
          createColumn('column_posts_title', 'title', { kind: 'varchar', length: 200 }, { nullable: false }),
          createColumn('column_posts_published', 'published', { kind: 'boolean' }, {
            nullable: false,
            default: { kind: 'literal', value: false },
          }),
        ],
        indexes: [
          {
            id: 'index_posts_user_id',
            name: 'idx_posts_user_id',
            unique: false,
            columns: [{ columnId: 'column_posts_user_id', order: 'asc' }],
            method: 'btree',
          },
        ],
      },
    ],
    relationships: [
      {
        id: 'relationship_posts_users',
        name: 'fk_posts_users',
        localTableId: 'table_posts',
        localColumnIds: ['column_posts_user_id'],
        referencedTableId: 'table_users',
        referencedColumnIds: ['column_users_id'],
        onDelete: 'cascade',
        onUpdate: 'cascade',
      },
    ],
    layout: {
      viewport: { x: 0, y: 0, zoom: 1 },
      tables: [
        { tableId: 'table_users', position: { x: 24, y: 100 }, size: { width: 280, height: 260 } },
        { tableId: 'table_posts', position: { x: 320, y: 130 }, size: { width: 280, height: 320 } },
      ],
    },
  };
}

export function createColumn(
  id: string,
  name: string,
  type: LogicalColumnType,
  options: Partial<Pick<Column, 'nullable' | 'primaryKey' | 'unique' | 'default'>> = {},
): Column {
  const primaryKey = options.primaryKey ?? false;

  return {
    id,
    name,
    type,
    nullable: primaryKey ? false : options.nullable ?? true,
    primaryKey,
    unique: options.unique ?? false,
    default: options.default,
  };
}

export function createTable(position: { x: number; y: number }, index: number): Table {
  const tableId = createId('table');

  return {
    id: tableId,
    name: `table_${index}`,
    schema: 'public',
    columns: [
      createColumn(createId('column'), 'id', { kind: 'integer', size: 'big', autoIncrement: true }, {
        primaryKey: true,
        nullable: false,
      }),
    ],
    indexes: [],
  };
}

export function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().replaceAll('-', '_')}`;
  }

  return `${prefix}_${Date.now()}_${Math.round(Math.random() * 100000)}`;
}

export function formatColumnType(type: LogicalColumnType) {
  switch (type.kind) {
    case 'integer':
      return type.autoIncrement ? `${type.size ?? 'standard'} int auto` : `${type.size ?? 'standard'} int`;
    case 'decimal':
      return type.precision ? `decimal(${type.precision}${type.scale !== undefined ? `,${type.scale}` : ''})` : 'decimal';
    case 'varchar':
      return `varchar(${type.length})`;
    case 'text':
      return 'text';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'timestamp':
      return type.withTimezone ? 'timestamptz' : 'timestamp';
    case 'json':
      return 'json';
    case 'uuid':
      return 'uuid';
    case 'binary':
      return 'binary';
    case 'custom':
      return type.raw;
  }
}

export function columnTypeFromKind(kind: LogicalColumnType['kind']): LogicalColumnType {
  switch (kind) {
    case 'integer':
      return { kind: 'integer', size: 'standard', autoIncrement: false };
    case 'decimal':
      return { kind: 'decimal' };
    case 'varchar':
      return { kind: 'varchar', length: 255 };
    case 'text':
      return { kind: 'text' };
    case 'boolean':
      return { kind: 'boolean' };
    case 'date':
      return { kind: 'date' };
    case 'time':
      return { kind: 'time' };
    case 'timestamp':
      return { kind: 'timestamp', withTimezone: true };
    case 'json':
      return { kind: 'json' };
    case 'uuid':
      return { kind: 'uuid' };
    case 'binary':
      return { kind: 'binary' };
    case 'custom':
      return { kind: 'custom', raw: 'TEXT' };
  }
}
