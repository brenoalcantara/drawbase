# Contributing to DrawBase

Thank you for helping improve DrawBase. Contributions should preserve the project's central properties: a database-independent canonical model, explicit SQL dialect boundaries, validated API inputs and safe defaults for database access.

## Before starting

For a bug or feature, search the existing issues and roadmap first. For a substantial architectural change, open a proposal before investing in implementation so the scope and compatibility impact can be discussed.

Security vulnerabilities must follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## Development setup

The easiest setup uses Docker and Docker Compose:

```bash
cp .env.example .env
openssl rand -hex 24
docker compose up --build
```

Run the password command once for each required password, then place the generated values in `POSTGRES_PASSWORD`, `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` inside `.env` before starting the stack.

The application is available at `http://localhost:5173` and the API health endpoint at `http://localhost:3001/health`. See [doc/docker.md](doc/docker.md) for safe opt-in settings for introspection and SQL execution.

For manual development, use Node.js 22 or newer and install each package independently:

```bash
cd api
npm ci
npm run dev
```

```bash
cd app
npm ci
npm run dev
```

## Project boundaries

- `app/` contains the React, TypeScript and React Flow frontend.
- `api/` contains the Fastify, TypeScript and Zod backend.
- `doc/` contains architecture, model and operational documentation.
- The canonical schema is the domain source of truth; React Flow nodes and edges are derived UI state.
- Database-specific behavior belongs in dialects or introspection adapters.
- SQL generation and SQL execution must remain separate.
- Features that connect to databases or execute SQL must use deny-by-default configuration.

Read [doc/architecture.md](doc/architecture.md) and [doc/schema-model.md](doc/schema-model.md) before changing domain contracts.

## Validation

Run all checks affected by your change before opening a pull request:

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

Add tests for changed behavior. Never make tests depend on real credentials, production databases or external network services.

## Pull requests

- Keep each pull request focused and explain the reason for the change.
- Include screenshots for visible UI changes.
- Document configuration, API contract and architecture changes.
- Do not commit `.env` files, credentials, connection strings, local databases, logs or private schemas.
- Use clear commit messages; Conventional Commit prefixes such as `feat:`, `fix:`, `docs:` and `test:` are encouraged.
- Confirm that CI passes and address dependency or CodeQL findings introduced by the change.

By contributing, you agree that your contribution is licensed under the repository's MIT License and that you will follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
