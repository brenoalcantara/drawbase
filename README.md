# DrawBase

[![CI](https://github.com/brenoalcantara/drawbase/actions/workflows/ci.yml/badge.svg)](https://github.com/brenoalcantara/drawbase/actions/workflows/ci.yml)
[![CodeQL](https://github.com/brenoalcantara/drawbase/actions/workflows/codeql.yml/badge.svg)](https://github.com/brenoalcantara/drawbase/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

DrawBase is an open source web application for visual relational database modeling. It aims to provide a drawing experience inspired by MySQL Workbench while keeping the project browser-based, Docker-friendly and independent from any single database vendor.

The initial database targets are PostgreSQL, MySQL and SQLite. The canonical model and adapter boundaries are designed to support more database systems later.

## Project status

DrawBase is pre-release MVP software. The current implementation includes:

- a React Flow editor for tables, columns, indexes and relationships;
- a database-independent canonical schema model;
- DDL generation for PostgreSQL, MySQL and SQLite;
- JSON project persistence through the API;
- reverse engineering for allowlisted PostgreSQL, MySQL and SQLite sources;
- automatic diagram layout, schema problem feedback and editing shortcuts;
- SQL, JSON, PNG and Markdown export;
- controlled DDL execution against fixed local test targets;
- Docker Compose development services;
- CI, dependency review, Dependabot and CodeQL configuration.

This is not yet recommended for production databases. SQL execution and network introspection are disabled by default.

## Technology

Frontend:

- React 19 and TypeScript;
- Vite;
- React Flow through `@xyflow/react`;
- Dagre for initial automatic layout.

Backend:

- Node.js 22 and TypeScript;
- Fastify;
- Zod;
- explicit PostgreSQL, MySQL and SQLite adapters.

Runtime and quality:

- Docker and Docker Compose;
- Vitest and ESLint;
- GitHub Actions, CodeQL, Dependabot and dependency review.

## Repository layout

```txt
drawbase/
  app/                  # React + React Flow frontend
  api/                  # Fastify API and domain services
  doc/                  # Architecture, roadmap and project documentation
  .github/              # CI, security automation and contribution templates
  docker-compose.yml    # Reproducible local environment
```

## Quick start with Docker

Requirements: Docker with the Compose plugin and three locally generated passwords.

```bash
cp .env.example .env
openssl rand -hex 24
```

Run the password command once for each value and fill in `POSTGRES_PASSWORD`, `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` in `.env`. Then start the stack:

```bash
docker compose up --build
```

Open:

- frontend: `http://localhost:5173`;
- API healthcheck: `http://localhost:3001/health`.

Network introspection and SQL execution remain blocked until explicitly enabled. See [doc/docker.md](doc/docker.md) before changing those settings.

## Manual development

Node.js 22 or newer is required. Install and start the API first:

```bash
cd api
npm ci
npm run dev
```

In another terminal, start the frontend:

```bash
cd app
npm ci
npm run dev
```

Vite proxies `/api` and `/health` to `http://localhost:3001` during local development.

## Validation

Run the same checks enforced by CI:

```bash
cd api
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```

```bash
cd app
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

## Architecture

DrawBase follows a few central rules:

- the canonical schema is the source of truth, not React Flow state;
- database-specific behavior stays behind explicit dialect and adapter modules;
- every API payload is validated with Zod;
- SQL generation and SQL execution remain separate;
- dangerous capabilities use deny-by-default configuration;
- core domain logic should remain independently testable.

See [architecture](doc/architecture.md), [canonical schema model](doc/schema-model.md), [roadmap](doc/roadmap.md) and [API documentation](api/README.md).

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request.

Do not report vulnerabilities or disclose credentials in public issues. Follow [SECURITY.md](SECURITY.md) for private reporting and safe disclosure.

## License

DrawBase is released under the [MIT License](LICENSE).
