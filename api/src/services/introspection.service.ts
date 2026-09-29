import {
  type IntrospectionImportRequest,
  type IntrospectionImportResponse,
  introspectionImportResponseSchema,
} from '../schemas/introspection.schema';
import { introspectMysql } from './introspection/mysql-introspector';
import { introspectPostgres } from './introspection/postgres-introspector';
import { introspectSqlite } from './introspection/sqlite-introspector';
import { mapIntrospectedDatabaseToProject } from './introspection/mapping';

export async function importDatabaseSchema(request: IntrospectionImportRequest): Promise<IntrospectionImportResponse> {
  const database = await introspectDatabase(request);
  const { project, stats } = mapIntrospectedDatabaseToProject(database, request.project);

  return introspectionImportResponseSchema.parse({
    dialect: database.dialect,
    project,
    warnings: database.warnings,
    stats,
  });
}

async function introspectDatabase(request: IntrospectionImportRequest) {
  switch (request.connection.dialect) {
    case 'postgres':
      return introspectPostgres(request.connection);
    case 'mysql':
      return introspectMysql(request.connection);
    case 'sqlite':
      return introspectSqlite(request.connection);
  }
}
