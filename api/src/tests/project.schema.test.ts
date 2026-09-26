import { describe, expect, it } from 'vitest';

import { projectSchema } from '../schemas/project.schema';

const emptyProject = {
  schemaVersion: '1.0.0',
  id: 'project_empty',
  name: 'Empty Project',
  dialect: 'postgres',
  tables: [],
  relationships: [],
  layout: {
    viewport: { x: 0, y: 0, zoom: 1 },
    tables: [],
  },
};

describe('projectSchema', () => {
  it('accepts a minimal valid project', () => {
    const result = projectSchema.safeParse(emptyProject);

    expect(result.success).toBe(true);
  });

  it('rejects nullable primary key columns', () => {
    const result = projectSchema.safeParse({
      ...emptyProject,
      tables: [
        {
          id: 'table_users',
          name: 'users',
          columns: [
            {
              id: 'column_users_id',
              name: 'id',
              type: { kind: 'integer' },
              nullable: true,
              primaryKey: true,
              unique: false,
            },
          ],
          indexes: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects relationships that point to unknown tables', () => {
    const result = projectSchema.safeParse({
      ...emptyProject,
      relationships: [
        {
          id: 'relationship_missing',
          localTableId: 'table_missing_local',
          localColumnIds: ['column_missing_local'],
          referencedTableId: 'table_missing_referenced',
          referencedColumnIds: ['column_missing_referenced'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

