# DrawBase API

This directory contains the DrawBase backend API.

The API is implemented with:

- Node.js
- TypeScript
- Fastify
- Zod

Knex may be added later for auxiliary query building, but the initial introspection uses explicit database drivers.

## Responsibilities

The backend will be responsible for:

- validating project schema payloads;
- generating SQL DDL for PostgreSQL, MySQL and SQLite;
- isolating database-specific SQL dialect behavior;
- persisting and loading projects;
- importing existing schemas through database introspection;
- enforcing security limits around credentials, hosts and generated SQL execution.

## Current Endpoints

```txt
GET  /health
POST /api/sql/generate
POST /api/sql/execute
GET  /api/projects
POST /api/projects
GET  /api/projects/:id
PUT  /api/projects/:id
DELETE /api/projects/:id
POST /api/introspection/import
```

`POST /api/sql/generate` validates the canonical project model and generates initial DDL for PostgreSQL, MySQL and SQLite.
`POST /api/sql/execute` executes generated DDL only against fixed local test targets after explicit confirmation.
Project endpoints persist the canonical project model as JSON files.
`POST /api/introspection/import` imports allowlisted PostgreSQL, MySQL and SQLite sources into the canonical project model.

## SQL Execution Safety

SQL execution is intentionally limited:

- the request must send `confirmation: "EXECUTE_DDL"`;
- targets are fixed to `postgres-test`, `mysql-test` and `sqlite-sandbox`;
- arbitrary connection strings are not accepted;
- only generated `CREATE TABLE` and `CREATE INDEX` statements are allowed;
- execution attempts are appended to a local JSONL log file.

## Local Development

```bash
npm install
npm run dev
```

Useful scripts:

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```

## Notes

The API should use the canonical DrawBase schema model as its main contract. It should not depend on React Flow node and edge structures directly.

The initial canonical schema contract lives in:

```txt
src/schemas/project.schema.ts
src/domain/schema-model.ts
```

See the project architecture document for the full design: `../doc/architecture.md`.
