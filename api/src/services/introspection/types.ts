import type {
  ColumnDefault,
  DatabaseDialect,
  Index,
  LogicalColumnType,
  ReferentialAction,
} from '../../domain/schema-model';
import type { SqlWarning } from '../../schemas/sql.schema';

export type IntrospectionWarning = SqlWarning;

export type IntrospectedColumn = {
  name: string;
  type: LogicalColumnType;
  nullable: boolean;
  primaryKey: boolean;
  unique?: boolean;
  default?: ColumnDefault;
  ordinal: number;
};

export type IntrospectedIndex = {
  name: string;
  unique: boolean;
  columns: Array<{ name: string; order: 'asc' | 'desc' }>;
  method?: Index['method'];
  where?: string;
};

export type IntrospectedRelationship = {
  name: string;
  localTableSchema?: string;
  localTableName: string;
  localColumnNames: string[];
  referencedTableSchema?: string;
  referencedTableName: string;
  referencedColumnNames: string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
};

export type IntrospectedTable = {
  schema?: string;
  name: string;
  columns: IntrospectedColumn[];
  indexes: IntrospectedIndex[];
};

export type IntrospectedDatabase = {
  dialect: DatabaseDialect;
  sourceName: string;
  tables: IntrospectedTable[];
  relationships: IntrospectedRelationship[];
  warnings: IntrospectionWarning[];
};
