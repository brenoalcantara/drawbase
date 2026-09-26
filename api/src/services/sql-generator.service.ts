import type { ProjectSchema, Table } from '../domain/schema-model';
import type { SqlGenerateResponse, SqlGenerationOptions, SqlWarning } from '../schemas/sql.schema';

export function generateSql(project: ProjectSchema, options: SqlGenerationOptions): SqlGenerateResponse {
  const dialect = options.dialect ?? project.dialect;
  const includeComments = options.includeComments ?? true;
  const warnings: SqlWarning[] = [
    {
      code: 'SQL_GENERATOR_SCAFFOLD',
      message: 'DDL generation is scaffolded in Phase 2. Dialect-specific SQL generation starts in Phase 3.',
    },
  ];

  return {
    dialect,
    sql: buildScaffoldSql(project, dialect, includeComments),
    warnings,
    stats: {
      tables: project.tables.length,
      relationships: project.relationships.length,
    },
  };
}

function buildScaffoldSql(project: ProjectSchema, dialect: ProjectSchema['dialect'], includeComments: boolean) {
  const lines: string[] = [];

  if (includeComments) {
    lines.push('-- DrawBase SQL generation scaffold');
    lines.push(`-- Project: ${project.name}`);
    lines.push(`-- Dialect: ${dialect}`);
    lines.push(`-- Tables: ${project.tables.length}`);
    lines.push(`-- Relationships: ${project.relationships.length}`);
    lines.push('');
  }

  if (project.tables.length === 0) {
    lines.push('-- No tables defined yet.');
  } else {
    project.tables.forEach((table) => {
      lines.push(`-- TODO: generate CREATE TABLE for ${formatTableName(table)}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

function formatTableName(table: Table) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

