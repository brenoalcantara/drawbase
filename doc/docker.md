# Docker Local

Este documento descreve o ambiente Docker de desenvolvimento do DrawBase.

## Servicos

- `app`: frontend Vite + React em modo desenvolvimento.
- `api`: backend Fastify em modo desenvolvimento.
- `postgres-test`: PostgreSQL local para testes e introspeccao futura.
- `mysql-test`: MySQL local para testes e introspeccao futura.
- `projects_data`: volume Docker para projetos salvos em JSON.
- `sqlite_data`: volume Docker reservado para arquivos SQLite.

As portas sao expostas somente em `127.0.0.1` por padrao.

## Primeiro Uso

```bash
cp .env.example .env
docker compose up --build
```

URLs locais:

- App: `http://localhost:5173`
- API healthcheck: `http://localhost:3001/health`
- PostgreSQL: `localhost:54320`
- MySQL: `localhost:33070`

## Comandos Uteis

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f app
docker compose down
```

Para remover tambem os volumes de bancos e dependencias:

```bash
docker compose down -v
```

## Variaveis

Use `.env.example` como referencia. O arquivo `.env` real nao deve ser versionado.

As credenciais incluidas no exemplo sao apenas para desenvolvimento local.

`PROJECTS_DATA_DIR` define o diretorio de projetos JSON dentro do container da API. No Compose, esse caminho e montado no volume `projects_data`.

`INTROSPECTION_ALLOWED_HOSTS` controla quais hosts a API aceita para engenharia reversa. O padrao permite apenas `localhost`, `127.0.0.1`, `postgres-test` e `mysql-test`.

`POSTGRES_TEST_URL` e `MYSQL_TEST_URL` sao usados pela API para executar SQL somente nos bancos de teste do Compose.

`SQLITE_DATA_DIR` guarda o arquivo `execution-sandbox.sqlite` usado pelo alvo SQLite sandbox.

`SQL_EXECUTION_LOG_DIR`, quando definido, altera o diretorio do log `sql-execution.jsonl`. Sem essa variavel, o log usa `PROJECTS_DATA_DIR`.

## Seguranca

- Os bancos de teste nao sao expostos em interfaces publicas.
- Os containers de `app` e `api` rodam como usuario nao-root.
- O socket do Docker nao e montado em nenhum container.
- SQL gerado pelo DrawBase so e executado por acao explicita do usuario, com confirmacao `EXECUTE_DDL`.
- A API nao aceita connection string livre para execucao de SQL.
- A politica inicial de execucao permite apenas `CREATE TABLE` e `CREATE INDEX` nos alvos locais de teste.
