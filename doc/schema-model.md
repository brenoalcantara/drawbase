# DrawBase Schema Model

## Status

Este documento define a primeira versao do modelo canonico do DrawBase.

Versao atual:

```txt
1.0.0
```

O modelo canonico e o contrato compartilhado entre frontend, API, persistencia, importacao e geracao SQL. Ele nao deve depender da estrutura interna do React Flow.

## Objetivos

- Representar schemas relacionais de forma neutra entre PostgreSQL, MySQL e SQLite.
- Separar dominio de layout visual.
- Permitir geracao de SQL por dialeto.
- Permitir engenharia reversa no futuro.
- Facilitar migracoes de formato usando `schemaVersion`.
- Ser simples o bastante para o MVP, mas extensivel.

## Nomenclatura

O modelo usa tres conceitos diferentes que nao devem ser misturados:

- `id`: identificador interno do DrawBase, estavel dentro do projeto.
- `name`: nome real do objeto no banco de dados.
- handle visual: detalhe do React Flow, derivado do modelo quando necessario.

Relacionamentos usam os termos `local` e `referenced`:

- `localTableId` e `localColumnIds`: tabela/colunas que possuem a foreign key.
- `referencedTableId` e `referencedColumnIds`: tabela/colunas referenciadas pela foreign key.

Essa escolha evita acoplar o dominio aos termos `source` e `target` do React Flow.

## ProjectSchema

```ts
type ProjectSchema = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  dialect: DatabaseDialect;
  tables: Table[];
  relationships: Relationship[];
  layout: LayoutState;
  metadata?: ProjectMetadata;
};
```

Campos:

- `schemaVersion`: versao do contrato do DrawBase.
- `id`: identificador interno do projeto.
- `name`: nome exibido ao usuario.
- `dialect`: banco alvo principal do projeto.
- `tables`: tabelas do schema.
- `relationships`: foreign keys entre tabelas.
- `layout`: posicao visual das tabelas no canvas.
- `metadata`: informacoes opcionais de descricao e auditoria local.

## DatabaseDialect

Dialetos suportados inicialmente:

```ts
type DatabaseDialect = 'postgres' | 'mysql' | 'sqlite';
```

## Table

```ts
type Table = {
  id: string;
  name: string;
  schema?: string;
  columns: Column[];
  indexes: Index[];
  comment?: string;
};
```

Campos:

- `id`: identificador interno da tabela.
- `name`: nome real da tabela no banco.
- `schema`: schema/namespaces quando o banco suportar, como `public` no PostgreSQL.
- `columns`: colunas da tabela.
- `indexes`: indices definidos na tabela.
- `comment`: comentario opcional.

## Column

```ts
type Column = {
  id: string;
  name: string;
  type: LogicalColumnType;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  default?: ColumnDefault;
  comment?: string;
};
```

Campos:

- `id`: identificador interno da coluna.
- `name`: nome real da coluna no banco.
- `type`: tipo logico independente de dialeto.
- `nullable`: define se aceita `NULL`.
- `primaryKey`: define se participa da chave primaria.
- `unique`: define uma restricao unique simples para a coluna.
- `default`: valor padrao ou expressao padrao.
- `comment`: comentario opcional.

Regra inicial: toda coluna com `primaryKey: true` deve ter `nullable: false`.

## LogicalColumnType

Tipos logicos suportados na primeira versao:

```ts
type LogicalColumnType =
  | { kind: 'integer'; size?: 'small' | 'standard' | 'big'; autoIncrement?: boolean }
  | { kind: 'decimal'; precision?: number; scale?: number }
  | { kind: 'varchar'; length: number }
  | { kind: 'text' }
  | { kind: 'boolean' }
  | { kind: 'date' }
  | { kind: 'time' }
  | { kind: 'timestamp'; withTimezone?: boolean }
  | { kind: 'json' }
  | { kind: 'uuid' }
  | { kind: 'binary' }
  | { kind: 'custom'; raw: string };
```

Notas:

- `custom` existe para nao bloquear casos reais importados de bancos existentes.
- O gerador SQL deve emitir aviso quando um tipo nao tiver traducao perfeita para o dialeto alvo.
- O mapeamento fisico de cada tipo pertence aos modulos de dialeto.

## ColumnDefault

```ts
type ColumnDefault =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'expression'; value: string }
  | { kind: 'currentTimestamp' }
  | { kind: 'uuid' };
```

Notas:

- `literal` e usado para valores simples.
- `expression` representa expressoes SQL e deve ser tratada com cuidado pelo gerador.
- `currentTimestamp` e `uuid` sao intencoes logicas; o dialeto escolhe a sintaxe.

## Index

```ts
type Index = {
  id: string;
  name: string;
  unique: boolean;
  columns: IndexColumn[];
  method?: IndexMethod;
  where?: string;
};

type IndexColumn = {
  columnId: string;
  order?: 'asc' | 'desc';
};

type IndexMethod = 'btree' | 'hash' | 'gin' | 'gist' | 'fulltext';
```

Notas:

- `where` permite representar indices parciais, principalmente no PostgreSQL e SQLite.
- Dialetos sem suporte a um recurso devem gerar aviso em vez de falhar silenciosamente.

## Relationship

```ts
type Relationship = {
  id: string;
  name?: string;
  localTableId: string;
  localColumnIds: string[];
  referencedTableId: string;
  referencedColumnIds: string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
};
```

```ts
type ReferentialAction =
  | 'cascade'
  | 'restrict'
  | 'setNull'
  | 'setDefault'
  | 'noAction';
```

Regras:

- `localColumnIds.length` deve ser igual a `referencedColumnIds.length`.
- Tabelas e colunas referenciadas devem existir no projeto.
- Relacionamentos compostos sao representados por arrays com mais de uma coluna.
- O MVP visual pode comecar com relacionamentos de uma coluna, mas o contrato ja suporta relacionamento composto.

## LayoutState

```ts
type LayoutState = {
  viewport: CanvasViewport;
  tables: TableLayout[];
};

type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

type TableLayout = {
  tableId: string;
  position: {
    x: number;
    y: number;
  };
  size?: {
    width: number;
    height: number;
  };
  collapsed?: boolean;
};
```

Notas:

- O layout fica separado da tabela para preservar o dominio.
- Uma tabela pode existir sem layout; nesse caso o frontend decide a posicao inicial.
- O React Flow pode derivar `nodes` e `edges` a partir de `tables`, `relationships` e `layout`.

## ProjectMetadata

```ts
type ProjectMetadata = {
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};
```

Datas devem usar ISO 8601 quando existirem.

## Validacoes Obrigatorias

Validacoes estruturais:

- `schemaVersion` deve ser `1.0.0`.
- `dialect` deve ser `postgres`, `mysql` ou `sqlite`.
- IDs internos nao podem ser vazios.
- Nomes de objetos de banco nao podem ser vazios.
- O projeto deve ter arrays para `tables` e `relationships`.

Validacoes semanticas iniciais:

- IDs de tabelas devem ser unicos.
- Nomes de tabelas devem ser unicos dentro do mesmo schema.
- IDs de colunas devem ser unicos dentro da tabela.
- Nomes de colunas devem ser unicos dentro da tabela.
- IDs de relacionamentos devem ser unicos.
- Uma primary key nao pode ser nullable.
- Indices devem apontar para colunas existentes.
- Relacionamentos devem apontar para tabelas e colunas existentes.
- Entradas de layout devem apontar para tabelas existentes.

Regra de compatibilidade:

- Na versao `1.0.0`, nomes duplicados sao tratados de forma case-insensitive para reduzir diferencas perigosas entre PostgreSQL, MySQL e SQLite.

## Arquivos Relacionados

- Schemas Zod: `api/src/schemas/project.schema.ts`
- Tipos exportados para dominio: `api/src/domain/schema-model.ts`
- Exemplo vazio: `doc/examples/project-schema.empty.json`
- Exemplo com relacao: `doc/examples/project-schema.blog.json`

