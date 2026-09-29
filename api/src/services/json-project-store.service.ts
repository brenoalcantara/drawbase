import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ProjectSchema } from '../schemas/project.schema';
import { projectRecordSchema, type ProjectRecord, type ProjectSummary } from '../schemas/projects.schema';

const DEFAULT_PROJECTS_DATA_DIR = path.resolve(process.cwd(), 'data/projects');

type JsonProjectStoreOptions = {
  dataDir?: string;
  now?: () => Date;
};

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project ${projectId} was not found.`);
    this.name = 'ProjectNotFoundError';
  }
}

export class JsonProjectStore {
  private readonly dataDir: string;
  private readonly now: () => Date;

  constructor(options: JsonProjectStoreOptions = {}) {
    this.dataDir = path.resolve(options.dataDir ?? process.env.PROJECTS_DATA_DIR ?? DEFAULT_PROJECTS_DATA_DIR);
    this.now = options.now ?? (() => new Date());
  }

  async listProjects(): Promise<ProjectSummary[]> {
    await this.ensureDataDir();

    const entries = await readdir(this.dataDir, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => this.readRecordFile(path.join(this.dataDir, entry.name)).catch(() => null)),
    );

    return records
      .filter((record): record is ProjectRecord => Boolean(record))
      .map(toProjectSummary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name));
  }

  async getProject(projectId: string): Promise<ProjectRecord> {
    const filePath = this.projectFilePath(projectId);

    try {
      return await this.readRecordFile(filePath);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new ProjectNotFoundError(projectId);
      }

      throw error;
    }
  }

  async saveProject(project: ProjectSchema): Promise<{ record: ProjectRecord; created: boolean }> {
    await this.ensureDataDir();

    const filePath = this.projectFilePath(project.id);
    const existingRecord = await this.readExistingRecord(project.id);
    const now = this.now().toISOString();
    const createdAt = existingRecord?.createdAt ?? project.metadata?.createdAt ?? now;
    const updatedAt = now;
    const projectWithMetadata = {
      ...project,
      metadata: {
        ...project.metadata,
        createdAt,
        updatedAt,
      },
    };
    const record = projectRecordSchema.parse({
      storageVersion: '1.0.0',
      project: projectWithMetadata,
      createdAt,
      updatedAt,
    });

    await this.writeRecordFile(filePath, record);

    return {
      record,
      created: !existingRecord,
    };
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const filePath = this.projectFilePath(projectId);

    try {
      await rm(filePath, { force: false });
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return false;
      }

      throw error;
    }
  }

  private async ensureDataDir() {
    await mkdir(this.dataDir, { recursive: true });
  }

  private async readExistingRecord(projectId: string): Promise<ProjectRecord | null> {
    try {
      return await this.getProject(projectId);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return null;
      }

      throw error;
    }
  }

  private async readRecordFile(filePath: string): Promise<ProjectRecord> {
    const rawRecord = await readFile(filePath, 'utf8');
    return projectRecordSchema.parse(JSON.parse(rawRecord));
  }

  private async writeRecordFile(filePath: string, record: ProjectRecord) {
    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const serializedRecord = `${JSON.stringify(record, null, 2)}\n`;

    await writeFile(tempFilePath, serializedRecord, { mode: 0o600 });
    await rename(tempFilePath, filePath);
  }

  private projectFilePath(projectId: string) {
    const filename = `${createHash('sha256').update(projectId).digest('hex')}.json`;
    return path.join(this.dataDir, filename);
  }
}

function toProjectSummary(record: ProjectRecord): ProjectSummary {
  return {
    id: record.project.id,
    name: record.project.name,
    dialect: record.project.dialect,
    tables: record.project.tables.length,
    relationships: record.project.relationships.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
