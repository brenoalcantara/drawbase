import type { DatabaseDialect, ProjectSchema } from '../model/schema';

export type ProjectSummary = {
  id: string;
  name: string;
  dialect: DatabaseDialect;
  tables: number;
  relationships: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  storageVersion: '1.0.0';
  project: ProjectSchema;
  createdAt: string;
  updatedAt: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function listProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, { signal });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Project list failed.');
  }

  return payload.projects as ProjectSummary[];
}

export async function saveProject(project: ProjectSchema, signal?: AbortSignal): Promise<ProjectRecord> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project }),
    signal,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Project save failed.');
  }

  return payload as ProjectRecord;
}

export async function loadProject(projectId: string, signal?: AbortSignal): Promise<ProjectRecord> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`, { signal });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Project load failed.');
  }

  return payload as ProjectRecord;
}

export async function deleteSavedProject(projectId: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    signal,
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload?.error?.message ?? 'Project delete failed.');
  }
}
