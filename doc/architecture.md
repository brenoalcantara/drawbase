# DrawBase Architecture

## Visao Geral

DrawBase e um software web open source para modelagem visual de bancos de dados. O objetivo e oferecer uma experiencia de uso simples, proxima ao MySQL Workbench para desenho de tabelas e relacionamentos, mas com suporte inicial a PostgreSQL, MySQL e SQLite.

O projeto sera organizado como um monorepo:

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
- TypeScript, a ser adotado na evolucao do app atual

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
- Knex, principalmente para conexoes, consultas auxiliares e introspeccao

Responsabilidades:

- Validar todos os payloads recebidos com Zod.
- Gerar SQL DDL a partir do modelo canonico.
- Expor endpoints REST para geracao, validacao, persistencia e importacao.
- Isolar regras especificas de cada dialeto.
- Executar introspeccao de bancos quando o recurso estiver habilitado.
- Proteger a aplicacao contra entrada invalida, conexoes indevidas e execucao insegura.

Fastify foi escolhido por ser leve, performatico e adequado a uma API modular. Zod sera usado para garantir validacao de entrada e inferencia de tipos.

### Docker

Tecnologias:

- Docker
- Docker Compose

Servicos previstos:

- `app`: frontend React servido em modo desenvolvimento ou build estatico.
- `api`: backend Fastify.
- `postgres-test`: banco PostgreSQL para testes locais.
- `mysql-test`: banco MySQL para testes locais.
- `sqlite-data`: volume ou pasta montada para arquivos SQLite de teste.

Regras de seguranca para containers:

- Evitar containers privilegiados.
- Evitar montar o socket do Docker.
- Rodar processos como usuario nao-root quando possivel.
- Nao expor bancos de teste publicamente por padrao.
- Usar variaveis de ambiente para configuracao local.
- Manter credenciais reais fora do repositorio.

## Modelo Canonico

O modelo canonico e o contrato central do DrawBase. Ele deve representar o schema sem depender do React Flow nem de um dialeto especifico.

Exemplo conceitual:

```ts
type ProjectSchema = {
  version: string;
  dialect: 'postgres' | 'mysql' | 'sqlite';
  tables: Table[];
  relationships: Relationship[];
  layout: LayoutState;
};

type Table = {
  id: string;
  name: string;
  columns: Column[];
  indexes: Index[];
};

type Column = {
  id: string;
  name: string;
  type: LogicalType;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
};

type Relationship = {
  id: string;
  sourceTableId: string;
  sourceColumnId: string;
  targetTableId: string;
  targetColumnId: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
};
```

Esse modelo deve ser a fonte da verdade. O React Flow renderiza `nodes` e `edges` a partir dele, e o backend gera SQL a partir dele.

## Dialetos SQL

O backend deve conter uma camada de dialetos:

```txt
api/src/dialects/
  postgres/
  mysql/
  sqlite/
```

Cada dialeto deve saber:

- Escapar identificadores.
- Mapear tipos logicos para tipos fisicos.
- Gerar `CREATE TABLE`.
- Gerar `ALTER TABLE` para chaves estrangeiras quando necessario.
- Gerar indices e constraints.
- Lidar com diferencas de `AUTO_INCREMENT`, `SERIAL`, `IDENTITY` e `AUTOINCREMENT`.
- Lidar com particularidades de SQLite em alteracoes de schema.

Knex pode ajudar, mas a regra de DDL nao deve ficar totalmente escondida dentro dele. O DrawBase precisa controlar a semantica de modelagem.

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

Endpoint previsto:

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

### Engenharia Reversa

Endpoint previsto:

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

### Persistencia

No MVP local, ha duas opcoes aceitaveis:

- salvar projetos em arquivos JSON locais;
- salvar projetos em um banco interno, preferencialmente SQLite para simplicidade ou PostgreSQL se o projeto ja exigir multiusuario.

Para manter a primeira versao simples, o armazenamento pode comecar com arquivos locais ou SQLite. A decisao final deve considerar se o DrawBase tera login e multiplos usuarios logo no inicio.

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
- Usar limites de payload na API.
- Usar timeouts em conexoes de introspeccao.
- Nunca salvar senha de conexao sem necessidade explicita.
- Usar `.env.example` e manter `.env` fora do Git.
- Incluir `SECURITY.md` no repositorio open source.

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

## Estrutura Sugerida da API

```txt
api/
  src/
    server.ts
    app.ts
    routes/
      health.routes.ts
      sql.routes.ts
      projects.routes.ts
      introspection.routes.ts
    schemas/
      project.schema.ts
      sql.schema.ts
    domain/
      project.ts
      schema-model.ts
    dialects/
      postgres/
      mysql/
      sqlite/
    services/
      sql-generator.service.ts
      introspection.service.ts
      project-store.service.ts
    tests/
```

## Estrutura Sugerida do Frontend

```txt
app/
  src/
    main.tsx
    App.tsx
    components/
      canvas/
      panels/
      toolbar/
    features/
      schema-editor/
      sql-preview/
      project-browser/
    model/
      project-schema.ts
      react-flow-adapter.ts
    api/
      client.ts
    styles/
```

## Principios de Evolucao

- Primeiro fazer o modelo canonico funcionar bem.
- Depois transformar o canvas em editor confortavel.
- A geracao SQL deve ser previsivel, testada e explicavel.
- Recursos perigosos, como executar SQL em banco real, devem vir depois e com confirmacao explicita.
- O projeto deve continuar simples o bastante para uma pessoa manter.

