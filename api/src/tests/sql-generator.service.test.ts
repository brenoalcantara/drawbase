import { describe, expect, it } from 'vitest';

import { projectSchema } from '../schemas/project.schema';
import { generateSql } from '../services/sql-generator.service';

const rawProject = {
  schemaVersion: '1.0.0',
  id: 'project_blog',
  name: 'Blog Schema',
  dialect: 'postgres',
  tables: [
    {
      id: 'table_users',
      name: 'users',
      schema: 'public',
      columns: [
        {
          id: 'column_users_id',
          name: 'id',
          type: { kind: 'integer', size: 'big', autoIncrement: true },
          nullable: false,
          primaryKey: true,
          unique: false,
        },
        {
          id: 'column_users_email',
          name: 'email',
          type: { kind: 'varchar', length: 255 },
          nullable: false,
          primaryKey: false,
          unique: true,
        },
        {
          id: 'column_users_created_at',
          name: 'created_at',
          type: { kind: 'timestamp', withTimezone: true },
          nullable: false,
          primaryKey: false,
          unique: false,
          default: { kind: 'currentTimestamp' },
        },
      ],
      indexes: [
        {
          id: 'index_users_email',
          name: 'idx_users_email',
          unique: true,
          columns: [{ columnId: 'column_users_email', order: 'asc' }],
          method: 'btree',
        },
      ],
    },
    {
      id: 'table_posts',
      name: 'posts',
      schema: 'public',
      columns: [
        {
          id: 'column_posts_id',
          name: 'id',
          type: { kind: 'integer', size: 'big', autoIncrement: true },
          nullable: false,
          primaryKey: true,
          unique: false,
        },
        {
          id: 'column_posts_user_id',
          name: 'user_id',
          type: { kind: 'integer', size: 'big', autoIncrement: false },
          nullable: false,
          primaryKey: false,
          unique: false,
        },
        {
          id: 'column_posts_title',
          name: 'title',
          type: { kind: 'varchar', length: 200 },
          nullable: false,
          primaryKey: false,
          unique: false,
          default: { kind: 'literal', value: 'Untitled' },
        },
        {
          id: 'column_posts_published',
          name: 'published',
          type: { kind: 'boolean' },
          nullable: false,
          primaryKey: false,
          unique: false,
          default: { kind: 'literal', value: false },
        },
      ],
      indexes: [
        {
          id: 'index_posts_user_id',
          name: 'idx_posts_user_id',
          unique: false,
          columns: [{ columnId: 'column_posts_user_id', order: 'asc' }],
          method: 'btree',
        },
        {
          id: 'index_posts_published',
          name: 'idx_posts_published',
          unique: false,
          columns: [
            { columnId: 'column_posts_published', order: 'asc' },
            { columnId: 'column_posts_id', order: 'desc' },
          ],
          method: 'btree',
          where: 'published = true',
        },
      ],
    },
  ],
  relationships: [
    {
      id: 'relationship_posts_users',
      name: 'fk_posts_users',
      localTableId: 'table_posts',
      localColumnIds: ['column_posts_user_id'],
      referencedTableId: 'table_users',
      referencedColumnIds: ['column_users_id'],
      onDelete: 'cascade',
      onUpdate: 'cascade',
    },
  ],
  layout: {
    viewport: { x: 0, y: 0, zoom: 1 },
    tables: [],
  },
};

const project = projectSchema.parse(rawProject);

describe('generateSql', () => {
  it('generates PostgreSQL DDL with escaped identifiers, constraints and indexes', () => {
    const result = generateSql(project, { dialect: 'postgres', includeComments: false });

    expect(result.warnings).toEqual([]);
    expect(result.sql).toMatchInlineSnapshot(`
      "CREATE TABLE "public"."users" (
        "id" BIGSERIAL NOT NULL,
        "email" VARCHAR(255) NOT NULL UNIQUE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_users_id" PRIMARY KEY ("id")
      );

      CREATE TABLE "public"."posts" (
        "id" BIGSERIAL NOT NULL,
        "user_id" BIGINT NOT NULL,
        "title" VARCHAR(200) NOT NULL DEFAULT 'Untitled',
        "published" BOOLEAN NOT NULL DEFAULT FALSE,
        CONSTRAINT "pk_posts_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_posts_users" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE UNIQUE INDEX "idx_users_email" ON "public"."users" USING BTREE ("email" ASC);

      CREATE INDEX "idx_posts_user_id" ON "public"."posts" USING BTREE ("user_id" ASC);

      CREATE INDEX "idx_posts_published" ON "public"."posts" USING BTREE ("published" ASC, "id" DESC) WHERE published = true;
      "
    `);
  });

  it('generates MySQL DDL and warns when omitting unsupported partial index and timezone metadata', () => {
    const result = generateSql(project, { dialect: 'mysql', includeComments: false });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MYSQL_TIMESTAMP_TIMEZONE_OMITTED' }),
        expect.objectContaining({ code: 'MYSQL_PARTIAL_INDEX_OMITTED' }),
      ]),
    );
    expect(result.sql).toContain('`id` BIGINT NOT NULL AUTO_INCREMENT');
    expect(result.sql).toContain('CONSTRAINT `fk_posts_users` FOREIGN KEY (`user_id`) REFERENCES `public`.`users` (`id`)');
    expect(result.sql).toContain('CREATE UNIQUE INDEX `idx_users_email` ON `public`.`users` (`email` ASC);');
    expect(result.sql).not.toContain('WHERE published = true');
  });

  it('generates SQLite DDL with inline autoincrement primary keys and SQLite defaults', () => {
    const result = generateSql(project, { dialect: 'sqlite', includeComments: false });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SQLITE_TIMESTAMP_TIMEZONE_OMITTED' }),
        expect.objectContaining({ code: 'SQLITE_INDEX_METHOD_OMITTED' }),
      ]),
    );
    expect(result.sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(result.sql).toContain('"published" INTEGER NOT NULL DEFAULT 0');
    expect(result.sql).toContain('CONSTRAINT "fk_posts_users" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id")');
    expect(result.sql).toContain('CREATE INDEX "idx_posts_published" ON "public"."posts" ("published" ASC, "id" DESC) WHERE published = true;');
  });
});
