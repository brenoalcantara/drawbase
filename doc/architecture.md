# DrawBase Architecture

## Visao Geral

DrawBase e um software web open source para modelagem visual de bancos de dados. O objetivo e oferecer uma experiencia de uso simples, proxima ao MySQL Workbench para desenho de tabelas e relacionamentos, mas com suporte inicial a PostgreSQL, MySQL e SQLite.

O projeto e organizado como um monorepo:

```txt
drawbase/
  app/                  # Frontend React + React Flow
  api/                  # Backend Node.js + TypeScript + Fastify + Zod
  doc/                  # Documentacao tecnica e de produto
  docker-compose.yml    # Orquestracao local do ambiente
  README.md
```

## Objetivos Arquiteturais

- Permitir criacao visual de schemas relacionais.
- Gerar DDL para PostgreSQL, MySQL e SQLite a partir de um modelo interno unico.
- Manter o frontend desacoplado das regras de geracao SQL.
- Ter uma API pequena, tipada, validada e testavel.
- Rodar localmente via Docker com baixa friccao.
- Preservar seguranca ao lidar com credenciais, introspeccao e execucao de SQL.
- Facilitar expansao futura para outros SGBDs.

## Decisoes Principais

### Frontend

Tecnologias:

- React
- Vite
- React Flow, via `@xyflow/react`
- TypeScript

Responsabilidades:

- Renderizar o canvas visual.
- Permitir criar, mover, editar e conectar tabelas.
- Exibir paineis de propriedades para tabelas, colunas, indices e relacionamentos.
- Enviar o modelo interno para a API.
- Exibir SQL gerado, validacoes e erros de compilacao.

O React Flow deve ser tratado como mecanismo de interacao e layout, nao como modelo de dominio principal. O estado visual do React Flow pode ser derivado do modelo interno do DrawBase.

### Backend

Tecnologias:

- Node.js
- TypeScript
- Fastify
- Zod
- Drivers explicitos: `pg`, `mysql2` e `sql.js`

Responsabilidades:

- Validar todos os payloads recebidos com Zod.
- Gerar SQL DDL a partir do modelo canonico.
- Expor endpoints REST para geracao, validacao, persistencia e importacao.
- Isolar regras especificas de cada dialeto.
- Executar introspeccao de bancos quando o recurso estiver habilitado.
- Proteger a aplicacao contra entrada invalida, conexoes indevidas e execucao insegura.

Fastify foi escolhido por ser leve, performatico e adequado a uma API modular. Zod garante validacao de entrada e inferencia de tipos nas fronteiras HTTP.

### Docker

Tecnologias:

- Docker
- Docker Compose

Servicos atuais:

- `app`: frontend React servido em modo desenvolvimento ou build estatico.
- `api`: backend Fastify.
- `postgres-test`: banco PostgreSQL para testes locais.
- `mysql-test`: banco MySQL para testes locais.
- `sqlite_data`: volume para arquivos SQLite de teste.

Regras de seguranca para containers:

- Evitar containers privilegiados.
- Evitar montar o socket do Docker.
- Rodar processos como usuario nao-root quando possivel.
- Nao expor bancos de teste publicamente por padrao.
- Usar variaveis de ambiente para configuracao local.
- Manter credenciais reais fora do repositorio.

## Modelo Canonico

O modelo canonico e o contrato central do DrawBase. Ele deve representar o schema sem depender do React Flow nem de um dialeto especifico.

O contrato detalhado da versao atual esta em `doc/schema-model.md`. Resumo conceitual:

```ts
type ProjectSchema = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  dialect: 'postgres' | 'mysql' | 'sqlite';
  tables: Table[];
  relationships: Relationship[];
  layout: LayoutState;
};

type Table = {
  id: string;
  name: string;
  schema?: string;
  columns: Column[];
  indexes: Index[];
};

type Column = {
  id: string;
  name: string;
  type: LogicalColumnType;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  default?: ColumnDefault;
};

type Relationship = {
  id: string;
  localTableId: string;
  localColumnIds: string[];
  referencedTableId: string;
  referencedColumnIds: string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
};
```

Esse modelo deve ser a fonte da verdade. O React Flow renderiza `nodes` e `edges` a partir dele, e o backend gera SQL a partir dele. Relacionamentos usam `local` e `referenced` em vez de `source` e `target` para nao acoplar o dominio aos termos do React Flow.

## Dialetos SQL

O backend contem uma camada de dialetos:

```txt
api/src/dialects/
  common.ts
  index.ts
  mysql.ts
  postgres.ts
  sqlite.ts
  types.ts
```

Cada dialeto deve saber:

- Escapar identificadores.
- Mapear tipos logicos para tipos fisicos.
- Gerar `CREATE TABLE`.
- Gerar `ALTER TABLE` para chaves estrangeiras quando necessario.
- Gerar indices e constraints.
- Lidar com diferencas de `AUTO_INCREMENT`, `SERIAL`, `IDENTITY` e `AUTOINCREMENT`.
- Lidar com particularidades de SQLite em alteracoes de schema.

A regra de DDL permanece explicita nos modulos do DrawBase para que a semantica de modelagem seja previsivel, revisavel e coberta por testes.

## Fluxos Principais

### Criacao Visual

1. Usuario cria uma tabela no canvas.
2. Frontend atualiza o modelo canonico.
3. React Flow renderiza a tabela como node customizado.
4. Usuario adiciona colunas, PKs, FKs e indices.
5. Frontend envia o schema para a API.
6. API valida com Zod.
7. API gera SQL de acordo com o dialeto selecionado.
8. Frontend exibe o SQL gerado.

### Geracao de SQL

Endpoint implementado:

```txt
POST /api/sql/generate
```

Entrada:

- `ProjectSchema`
- dialeto alvo
- opcoes de geracao

Saida:

- SQL gerado
- avisos
- erros de validacao

### Execucao Segura de SQL

Endpoint inicial:

```txt
POST /api/sql/execute
```

Entrada:

- `ProjectSchema`
- alvo fixo de teste: `postgres-test`, `mysql-test` ou `sqlite-sandbox`
- confirmacao literal `EXECUTE_DDL`

Saida:

- SQL gerado para o dialeto do alvo
- avisos
- resultado de execucao
- erro capturado do banco, quando houver
- identificador de log local

Politica inicial:

- a execucao fica desabilitada enquanto `SQL_EXECUTION_ENABLED` nao for `true`;
- a API nao aceita connection string livre para execucao;
- somente alvos locais de teste podem executar SQL;
- somente `CREATE TABLE` e `CREATE INDEX` sao permitidos;
- comandos fora da politica sao bloqueados antes de abrir conexao;
- tentativas sao registradas em arquivo JSONL local.

### Engenharia Reversa

Endpoint implementado:

```txt
POST /api/introspection/import
```

Entrada:

- tipo do banco
- host permitido
- porta
- database
- usuario
- senha temporaria

Saida:

- `ProjectSchema`
- avisos sobre elementos nao suportados

Esse recurso deve ser implementado com cuidado. A API nao deve aceitar conexoes arbitrarias sem restricoes. Devem existir timeouts, allowlist de hosts em ambientes sensiveis e limites de tamanho.

Implementacao inicial:

- PostgreSQL, MySQL e SQLite sao importados por adaptadores isolados na API.
- A API aplica allowlist de hosts via `INTROSPECTION_ALLOWED_HOSTS`.
- Uma allowlist ausente ou vazia bloqueia toda introspeccao de rede.
- SQLite so aceita arquivos resolvidos dentro de `SQLITE_DATA_DIR`.
- Cada importacao possui timeout validado no payload.
- Credenciais recebidas sao usadas apenas na chamada; nao sao persistidas nem retornadas.
- O resultado e convertido para `ProjectSchema` e pode ser salvo separadamente pelo fluxo de projetos.

### Persistencia

No MVP local, a persistencia inicial usa arquivos JSON locais.

Regras:

- A API persiste o `ProjectSchema` validado em um envelope JSON com `createdAt` e `updatedAt`.
- O nome fisico do arquivo e derivado de hash do id do projeto para evitar path traversal e nomes perigosos.
- O diretorio padrao e configurado por `PROJECTS_DATA_DIR`.
- No Docker Compose, os arquivos ficam em volume nomeado `projects_data`.
- O frontend usa endpoints REST para listar, salvar, carregar e excluir projetos.
- Autosave fica para evolucao posterior.

## Seguranca

Riscos principais:

- Vazamento de credenciais de bancos importados.
- Execucao acidental ou maliciosa de SQL destrutivo.
- SSRF via importacao de banco usando host arbitrario.
- XSS via nomes de tabelas, colunas, comentarios ou defaults.
- Geracao incorreta de DDL.
- Payloads grandes demais causando consumo excessivo de memoria.
- Exposicao indevida de bancos Docker.

Controles iniciais:

- Validar toda entrada com Zod.
- Sanitizar exibicao de nomes e mensagens no frontend.
- Escapar identificadores no gerador SQL por dialeto.
- Separar geracao de SQL de execucao de SQL.
- Nao executar SQL diretamente no banco por padrao no MVP.
- Exigir opt-in explicito por configuracao para execucao SQL.
- Nao fornecer senhas padrao em arquivos versionados.
- Usar limites de payload na API.
- Usar timeouts em conexoes de introspeccao.
- Nunca salvar senha de conexao sem necessidade explicita.
- Usar `.env.example` e manter `.env` fora do Git.
- Incluir `SECURITY.md` no repositorio open source.

## Qualidade e Manutencao Open Source

O repositorio usa automacoes separadas e com permissoes minimas:

- `CI` executa instalacao reproduzivel com `npm ci`, auditoria de dependencias, lint, typecheck, testes da API e builds do frontend e da API;
- `CodeQL` analisa JavaScript e TypeScript em pushes e pull requests para `main`, alem de uma execucao semanal;
- `Dependency Review` bloqueia pull requests que introduzam vulnerabilidades de severidade moderada ou superior;
- Dependabot verifica dependencias npm, GitHub Actions e imagens Docker semanalmente;
- templates orientam relatos de bugs, propostas e pull requests sem exposicao de dados sensiveis.

O GitHub deve manter `main` protegida, exigindo os checks de CI, CodeQL e Dependency Review antes de merge. Secret scanning funciona automaticamente quando o repositorio e publico. Private vulnerability reporting e push protection devem ser habilitados nas configuracoes de seguranca do repositorio quando disponiveis.

Arquivos de politica:

- `CONTRIBUTING.md`: ambiente, limites arquiteturais e validacao;
- `SECURITY.md`: versoes suportadas e divulgacao coordenada;
- `CODE_OF_CONDUCT.md`: comportamento e moderacao;
- `.github/VULNERABILITY_REPORT.yml`: formulario privado estruturado.

## Testabilidade

O nucleo mais critico e o motor de schema e SQL. Ele deve ter testes automatizados desde cedo.

Testes recomendados:

- Unitarios para validacao Zod.
- Unitarios para mapeamento de tipos por dialeto.
- Snapshot tests para SQL gerado.
- Testes de integracao contra PostgreSQL e MySQL via Docker Compose.
- Testes para SQLite usando arquivo temporario.
- Testes de round-trip no futuro: introspeccao -> modelo -> SQL.

Casos obrigatorios:

- tabelas simples;
- primary key;
- foreign key;
- nullable e not null;
- default values;
- unique;
- indexes;
- nomes com espacos ou palavras reservadas;
- relacionamento um-para-muitos;
- relacionamento muitos-para-muitos via tabela intermediaria.

## Estrutura da API

```txt
api/
  src/
    app.ts
    server.ts
    dialects/
      common.ts
      index.ts
      mysql.ts
      postgres.ts
      sqlite.ts
      types.ts
    domain/
      schema-model.ts
    routes/
      health.routes.ts
      introspection.routes.ts
      projects.routes.ts
      sql.routes.ts
    schemas/
      introspection.schema.ts
      project.schema.ts
      projects.schema.ts
      sql.schema.ts
    services/
      introspection/
      introspection.service.ts
      json-project-store.service.ts
      sql-execution.service.ts
      sql-generator.service.ts
    tests/
    utils/
```

## Estrutura do Frontend

```txt
app/
  src/
    App.tsx
    index.css
    main.tsx
    api/
      introspection.ts
      projects.ts
      sql.ts
    components/
      TableNode.tsx
    model/
      projectExport.ts
      projectOperations.ts
      reactFlowAdapter.ts
      schema.ts
```

## Principios de Evolucao

- Primeiro fazer o modelo canonico funcionar bem.
- Depois transformar o canvas em editor confortavel.
- A geracao SQL deve ser previsivel, testada e explicavel.
- Recursos perigosos, como executar SQL em banco real, devem vir depois e com confirmacao explicita.
- O projeto deve continuar simples o bastante para uma pessoa manter.
