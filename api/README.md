# DrawBase API

This directory contains the DrawBase backend API.

The API is implemented with:

- Node.js
- TypeScript
- Fastify
- Zod

Knex will be added when database connection, persistence or introspection work starts.

## Responsibilities

The backend will be responsible for:

- validating project schema payloads;
- generating SQL DDL for PostgreSQL, MySQL and SQLite;
- isolating database-specific SQL dialect behavior;
- persisting and loading projects;
- importing existing schemas through database introspection;
- enforcing security limits around credentials, hosts and generated SQL execution.

## Planned Initial Endpoints

```txt
GET  /health
POST /api/sql/generate
```

Both endpoints are scaffolded. SQL generation currently validates the canonical project model and returns structured placeholder output; dialect-specific DDL generation belongs to the next roadmap phase.

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

Future endpoints:

```txt
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id
POST   /api/introspection/import
```

## Notes

The API should use the canonical DrawBase schema model as its main contract. It should not depend on React Flow node and edge structures directly.

The initial canonical schema contract lives in:

```txt
src/schemas/project.schema.ts
src/domain/schema-model.ts
```

See the project architecture document for the full design: `../doc/architecture.md`.
