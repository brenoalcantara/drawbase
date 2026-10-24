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
openssl rand -hex 24 # execute uma vez para cada senha
docker compose up --build
```

Antes de executar o Compose, gere um valor diferente para `POSTGRES_PASSWORD`, `MYSQL_PASSWORD` e `MYSQL_ROOT_PASSWORD` no `.env`. O Compose falha imediatamente se alguma delas estiver vazia.

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

Use `.env.example` como referencia. O arquivo `.env` real nao deve ser versionado. Nenhuma senha funcional e fornecida nos arquivos versionados.

`PROJECTS_DATA_DIR` define o diretorio de projetos JSON dentro do container da API. No Compose, esse caminho e montado no volume `projects_data`.

`INTROSPECTION_ALLOWED_HOSTS` controla quais hosts a API aceita para engenharia reversa. O valor padrao e vazio e bloqueia toda introspeccao de rede. Para importar apenas os bancos locais do Compose, use `postgres-test,mysql-test`.

O Compose fornece a API com host, porta, banco, usuario e senha dos alvos de teste por variaveis separadas. Connection strings com senha nao ficam armazenadas nos arquivos versionados.

`SQL_EXECUTION_ENABLED` controla o endpoint de execucao de DDL. O padrao `false` retorna `403` para qualquer tentativa. Defina `true` somente no `.env` de um ambiente local controlado.

`SQLITE_DATA_DIR` guarda o arquivo `execution-sandbox.sqlite` usado pelo alvo SQLite sandbox.

`SQL_EXECUTION_LOG_DIR`, quando definido, altera o diretorio do log `sql-execution.jsonl`. Sem essa variavel, o log usa `PROJECTS_DATA_DIR`.

## Seguranca

- Os bancos de teste nao sao expostos em interfaces publicas.
- O Compose exige senhas definidas no `.env` e nao possui fallback versionado.
- Os containers de `app` e `api` rodam como usuario nao-root.
- O socket do Docker nao e montado em nenhum container.
- SQL gerado pelo DrawBase so e executado por acao explicita do usuario, com confirmacao `EXECUTE_DDL`.
- A API nao aceita connection string livre para execucao de SQL.
- A politica inicial de execucao permite apenas `CREATE TABLE` e `CREATE INDEX` nos alvos locais de teste.
- Introspeccao de rede e execucao SQL ficam desabilitadas por configuracao ate serem explicitamente habilitadas.
