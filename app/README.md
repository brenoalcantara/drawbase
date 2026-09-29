# DrawBase App

Frontend web do DrawBase.

Stack atual:

- React
- TypeScript
- Vite
- React Flow via `@xyflow/react`

## Desenvolvimento Local

Rodando diretamente:

```bash
npm install
npm run dev
```

Rodando pela raiz do projeto com Docker Compose:

```bash
docker compose up --build app
```

O frontend espera a API em `/api`. Fora do Docker, o proxy aponta para `http://localhost:3001`.
Dentro do Docker Compose, o proxy aponta para `http://api:3001` via `DRAWBASE_API_PROXY_TARGET`.

## Scripts

```bash
npm run typecheck
npm run lint
npm run build
```
