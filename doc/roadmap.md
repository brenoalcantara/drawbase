# DrawBase Roadmap

## Estado Atual

O projeto possui tres diretorios principais:

- `app/`: frontend Vite + React com `@xyflow/react` instalado e um exemplo minimo de canvas.
- `api/`: pasta reservada para a API, ainda vazia.
- `doc/`: documentacao inicial, comandos usados e PDF com consulta de referencia.

O objetivo e evoluir para um software web dockerizado, open source, para modelagem visual de bancos de dados com suporte inicial a PostgreSQL, MySQL e SQLite.

## Fase 0 - Base do Repositorio

Objetivo: deixar o projeto pronto para evoluir como monorepo open source.

Tarefas:

- Inicializar ou reparar o Git na raiz do projeto.
- Criar `.gitignore` na raiz.
- Criar `README.md` com visao geral, status e instrucoes locais.
- Escolher licenca open source, provavelmente MIT ou Apache-2.0.
- Criar `LICENSE`.
- Criar `SECURITY.md`.
- Criar `CONTRIBUTING.md`.
- Criar `.env.example`.
- Padronizar nomes: `app`, `api`, `doc`.
- Registrar decisoes em `doc/architecture.md`.
- Manter este roadmap atualizado.

Resultado esperado:

- Repositorio unico versionando frontend, backend e documentacao.
- Estrutura compreensivel para uso pessoal e publicacao open source.

## Fase 1 - Modelo Canonico

Objetivo: definir a base de dominio antes de crescer interface e API.

Tarefas:

- Definir `ProjectSchema`.
- Definir `Table`, `Column`, `Index`, `Relationship` e `LayoutState`.
- Definir tipos logicos de coluna independentes de dialeto.
- Definir a representacao de PK, FK, unique, nullable e default.
- Definir a versao do schema para permitir migracoes futuras.
- Criar validacoes Zod correspondentes.
- Criar exemplos JSON em `doc/examples/`.

Resultado esperado:

- Um contrato estavel que frontend e backend possam compartilhar.
- Menor risco de acoplar a regra de negocio ao React Flow.

## Fase 2 - API Inicial

Objetivo: criar a API em Node.js + TypeScript + Fastify + Zod.

Tarefas:

- Inicializar projeto Node dentro de `api/`.
- Configurar TypeScript.
- Configurar Fastify.
- Configurar Zod.
- Criar endpoint `GET /health`.
- Criar endpoint `POST /api/sql/generate`.
- Criar estrutura de pastas da API.
- Adicionar scripts `dev`, `build`, `test`, `lint`.
- Adicionar testes unitarios basicos.

Resultado esperado:

- API rodando localmente.
- Payloads validados.
- Primeiro endpoint capaz de receber o modelo canonico.

## Fase 3 - Gerador SQL MVP

Objetivo: gerar DDL confiavel para os tres bancos iniciais.

Tarefas:

- Implementar camada de dialetos.
- Implementar escape de identificadores para PostgreSQL.
- Implementar escape de identificadores para MySQL.
- Implementar escape de identificadores para SQLite.
- Implementar `CREATE TABLE`.
- Implementar primary keys.
- Implementar foreign keys.
- Implementar nullable e not null.
- Implementar default values simples.
- Implementar unique.
- Implementar indices.
- Criar snapshot tests por dialeto.

Casos minimos:

- uma tabela simples;
- duas tabelas com FK;
- nomes com palavra reservada;
- colunas nullable e not null;
- indice simples;
- unique constraint.

Resultado esperado:

- SQL gerado para PostgreSQL, MySQL e SQLite a partir do mesmo modelo.
- Motor coberto por testes automatizados.

## Fase 4 - Frontend MVP

Objetivo: transformar o exemplo atual do React Flow em um editor inicial de schema.

Tarefas:

- Migrar frontend para TypeScript.
- Criar componente `TableNode`.
- Criar handles por coluna para conexoes.
- Criar toolbar para adicionar tabela.
- Criar painel de propriedades da tabela.
- Criar editor de colunas.
- Criar seletor de banco alvo: PostgreSQL, MySQL, SQLite.
- Adaptar modelo canonico para nodes e edges do React Flow.
- Enviar schema para `POST /api/sql/generate`.
- Exibir SQL gerado em painel lateral.
- Exibir erros de validacao de forma clara.

Resultado esperado:

- Usuario consegue criar tabelas, colunas e relacionamentos visualmente.
- Usuario consegue ver o SQL gerado.

## Fase 5 - Docker Local

Objetivo: rodar o ambiente completo com Docker Compose.

Tarefas:

- Criar `docker-compose.yml` na raiz.
- Criar Dockerfile do `app`.
- Criar Dockerfile da `api`.
- Adicionar servico `postgres-test`.
- Adicionar servico `mysql-test`.
- Adicionar volume para dados de teste.
- Adicionar suporte a SQLite via volume local.
- Criar healthchecks.
- Criar `.env.example`.
- Documentar `docker compose up --build`.

Resultado esperado:

- Um comando sobe frontend, API e bancos de teste.
- Ambiente reproduzivel para desenvolvimento e demonstracao.

## Fase 6 - Persistencia de Projetos

Objetivo: permitir salvar e carregar diagramas.

Tarefas:

- Decidir armazenamento inicial: arquivos JSON, SQLite interno ou PostgreSQL interno.
- Criar modelo de `Project`.
- Criar endpoint para salvar projeto.
- Criar endpoint para listar projetos.
- Criar endpoint para carregar projeto.
- Criar endpoint para excluir projeto.
- Criar painel de projetos no frontend.
- Adicionar autosave opcional.

Resultado esperado:

- Usuario nao perde o trabalho ao fechar o navegador.
- Projetos podem ser reabertos e editados.

## Fase 7 - Importacao e Engenharia Reversa

Objetivo: importar schemas existentes para o canvas.

Tarefas:

- Criar endpoint `POST /api/introspection/import`.
- Implementar introspeccao PostgreSQL.
- Implementar introspeccao MySQL.
- Implementar introspeccao SQLite.
- Mapear tabelas, colunas, PKs, FKs e indices.
- Transformar resultado em `ProjectSchema`.
- Adicionar limites de timeout.
- Adicionar allowlist ou regras de seguranca para hosts.
- Nao persistir senhas por padrao.
- Criar modal de importacao no frontend.

Resultado esperado:

- Usuario consegue conectar a um banco de teste e gerar diagrama automaticamente.

## Fase 8 - Layout e Usabilidade

Objetivo: aproximar a experiencia de ferramentas desktop como MySQL Workbench.

Tarefas:

- Adicionar auto-layout com Dagre ou ELK.
- Adicionar zoom controls, mini-map e background.
- Criar atalhos de teclado.
- Criar menu de contexto para tabela e coluna.
- Criar duplicacao de tabela.
- Criar renomeacao inline.
- Criar feedback visual para relacionamentos invalidos.
- Criar painel de problemas do schema.
- Melhorar acessibilidade basica.

Resultado esperado:

- Editor confortavel para uso real em projetos pequenos e medios.

## Fase 9 - Exportacao

Objetivo: permitir saidas uteis para documentacao e uso externo.

Tarefas:

- Baixar SQL como `.sql`.
- Copiar SQL para clipboard.
- Exportar diagrama como PNG.
- Exportar projeto como JSON.
- Importar projeto de JSON.
- Exportar documentacao Markdown do schema.

Resultado esperado:

- DrawBase se torna util tambem como ferramenta de documentacao.

## Fase 10 - Execucao Segura de SQL

Objetivo: permitir testar SQL gerado sem comprometer seguranca.

Tarefas:

- Definir politica de execucao.
- Exigir confirmacao explicita antes de executar.
- Limitar execucao inicial aos bancos de teste do Docker.
- Separar conexoes de teste de conexoes reais.
- Exibir preview do SQL.
- Capturar e mostrar erros do banco.
- Bloquear ou alertar sobre comandos destrutivos.
- Registrar logs de execucao local.

Resultado esperado:

- Usuario consegue validar DDL em ambiente controlado.
- Execucao direta em banco real permanece protegida.

## Fase 11 - Qualidade Open Source

Objetivo: deixar o projeto confiavel para publicacao.

Tarefas:

- Configurar GitHub Actions.
- Rodar lint no CI.
- Rodar typecheck no CI.
- Rodar testes no CI.
- Rodar build do app e da API no CI.
- Habilitar Dependabot.
- Habilitar CodeQL.
- Habilitar secret scanning quando disponivel.
- Criar issues templates.
- Criar pull request template.
- Documentar arquitetura e contribuicao.

Resultado esperado:

- Repositorio publico com boas praticas minimas de manutencao.

## Fase 12 - Recursos Futuros

Possibilidades apos o MVP:

- Suporte a SQL Server.
- Suporte a Oracle.
- Suporte a MariaDB como dialeto separado quando necessario.
- Comparacao entre dois schemas.
- Geracao de migracoes.
- Historico de versoes de projeto.
- Comentarios e notas no canvas.
- Temas visuais.
- Colaboracao em tempo real.
- Plugins para dialetos.
- Publicacao de imagem Docker oficial.

## Prioridade Recomendada

Ordem sugerida para os proximos passos imediatos:

1. Base do repositorio.
2. Modelo canonico.
3. API Fastify com Zod.
4. Gerador SQL MVP.
5. Frontend MVP com `TableNode`.
6. Docker Compose.
7. Persistencia.
8. Engenharia reversa.

Essa ordem reduz risco porque estabelece primeiro o contrato e o motor central. A interface pode evoluir com seguranca em cima de uma base testavel.

