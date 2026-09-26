import type {
  Column,
  ColumnDefault,
  DatabaseDialect,
  Index,
  ProjectSchema,
  Relationship,
  Table,
} from '../domain/schema-model';
import type { SqlWarning } from '../schemas/sql.schema';

export type SqlDialect = {
  name: DatabaseDialect;
  quoteIdentifier(identifier: string): string;
  formatTableName(table: Table): string;
  columnDefinition(column: Column, table: Table, context: DialectContext): string;
  primaryKeyConstraint(table: Table, primaryKeyColumns: Column[], context: DialectContext): string | null;
  uniqueColumnConstraint(column: Column, table: Table, context: DialectContext): string | null;
  foreignKeyConstraint(relationship: Relationship, context: DialectContext): string;
  createIndex(table: Table, index: Index, context: DialectContext): string | null;
  defaultExpression(defaultValue: ColumnDefault): string;
};

export type DialectContext = {
  project: ProjectSchema;
  warnings: SqlWarning[];
  tablesById: Map<string, Table>;
  columnsByTableId: Map<string, Map<string, Column>>;
};

export type CreateDialectOptions = {
  addWarning: (warning: SqlWarning) => void;
};
