# DrawBase

DrawBase is an open source web application for visual database modeling. The goal is to provide a simple drawing experience inspired by MySQL Workbench, while supporting multiple relational database systems from a browser-based, Docker-friendly environment.

The initial database targets are:

- PostgreSQL
- MySQL
- SQLite

## Status

DrawBase is in the early MVP stage.

Current state:

- The repository is organized as a monorepo.
- The frontend has a TypeScript React Flow editor with table nodes, column editing, relationships and SQL preview.
- The API has a Node.js + TypeScript + Fastify implementation with Zod validation, SQL generation and JSON project persistence.
- Architecture and roadmap documents are available in `doc/`.

## Planned Stack

Frontend:

- React
- Vite
- React Flow via `@xyflow/react`
- TypeScript

Backend:

- Node.js
- TypeScript
- Fastify
- Zod
- Knex for database connections, auxiliary queries and introspection support

Runtime and local development:

- Docker
- Docker Compose
- PostgreSQL and MySQL test containers
- SQLite through local files or mounted volumes

## Repository Layout

```txt
drawbase/
  app/                  # Frontend React application
  api/                  # Backend API
  doc/                  # Architecture, roadmap and project documentation
  docker-compose.yml    # Local Docker environment
  LICENSE               # MIT license
  README.md             # Project overview
```

## Architecture Principles

- Keep a canonical schema model independent from React Flow.
- Treat React Flow as the visual editor, not as the domain model.
- Generate SQL through explicit dialect modules for PostgreSQL, MySQL and SQLite.
- Validate all API payloads with Zod.
- Keep SQL generation separate from SQL execution.
- Make dangerous features explicit, reviewed and opt-in.
- Prefer testable core logic over UI-bound behavior.

More details are available in [doc/architecture.md](doc/architecture.md).

The canonical schema contract is documented in [doc/schema-model.md](doc/schema-model.md).

## Roadmap

The current development plan is documented in [doc/roadmap.md](doc/roadmap.md).

The recommended order is:

1. Finish the repository foundation.
2. Define the canonical schema model.
3. Create the Fastify API with Zod validation.
4. Implement the SQL generator MVP.
5. Build the visual frontend MVP with custom table nodes.
6. Add Docker Compose for the full local environment.
7. Add project persistence.
8. Add database introspection and reverse engineering.

## Local Development

The recommended local path is Docker Compose from the repository root:

```bash
cp .env.example .env
docker compose up --build
```

Then open:

- Frontend: `http://localhost:5173`
- API healthcheck: `http://localhost:3001/health`

More details are available in [doc/docker.md](doc/docker.md).

Manual development is also supported.

The frontend currently lives in `app/`.

```bash
cd app
npm install
npm run dev
```

The API lives in `api/`.

```bash
cd api
npm install
npm run dev
```

During local development, run the API on `http://localhost:3001` before opening the frontend. Vite proxies `/api` and `/health` to the API.

## Security Direction

DrawBase will eventually handle database connection details, schema metadata and generated SQL, so security is part of the core design.

Initial security goals:

- Do not commit secrets or `.env` files.
- Validate all external input.
- Escape SQL identifiers per target dialect.
- Avoid executing generated SQL by default.
- Add timeouts and host restrictions for future introspection features.
- Avoid storing database passwords unless explicitly required.
- Keep Docker containers unprivileged and scoped to local development.

## License

DrawBase is released under the MIT License. See [LICENSE](LICENSE).
