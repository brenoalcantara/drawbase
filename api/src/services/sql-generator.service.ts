import { createStatements } from '../dialects/common';
import { getDialect } from '../dialects';
import type { ProjectSchema } from '../domain/schema-model';
import type { SqlGenerateResponse, SqlGenerationOptions } from '../schemas/sql.schema';

export function generateSql(project: ProjectSchema, options: SqlGenerationOptions): SqlGenerateResponse {
  const dialect = options.dialect ?? project.dialect;
  const includeComments = options.includeComments ?? true;
  const result = createStatements(project, getDialect(dialect), includeComments);

  return {
    dialect,
    sql: result.sql,
    warnings: result.warnings,
    stats: {
      tables: project.tables.length,
      relationships: project.relationships.length,
    },
  };
}
