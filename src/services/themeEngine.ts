import axios from 'axios';
import { getTenantApiKey } from './api';

/**
 * Client for the Growcord Theme Engine (theme-engine/ service) — theme library,
 * live-preview drafts and publishing for template-mode storefronts.
 * Auth: the store's x-api-key (same tenant key the admin already uses).
 */
const THEME_ENGINE_URL = (import.meta.env.VITE_THEME_ENGINE_URL || 'http://localhost:3050').replace(/\/+$/, '');

const client = axios.create({ baseURL: `${THEME_ENGINE_URL}/api/themes`, timeout: 60000 });

client.interceptors.request.use((config) => {
  const key = getTenantApiKey();
  if (key) config.headers['x-api-key'] = key;
  return config;
});

export interface ThemeMeta {
  id: string;
  name: string;
  version?: string;
  source: 'upload' | 'starter';
  createdAt: string;
  updatedAt?: string;
}

export interface EditorPayload {
  settingsSchema: any[];
  settingsData: Record<string, any>;
  templates: Record<string, any>;
  groups: Record<string, any>;
  sectionSchemas: SectionSchema[];
  hasDraft: boolean;
}

export interface SectionSchema {
  type: string;
  name: string;
  settings?: any[];
  blocks?: any[];
  max_blocks?: number;
  presets?: any[];
}

export const themeEngineAPI = {
  baseUrl: THEME_ENGINE_URL,

  /** iframe URL for the live editor preview (apiKey in query — iframes can't send headers) */
  previewUrl(themeId: string, template: string, handle?: string): string {
    const key = getTenantApiKey() || '';
    const params = new URLSearchParams({ template, apiKey: key });
    if (handle) params.set('handle', handle);
    return `${THEME_ENGINE_URL}/api/themes/${themeId}/preview?${params.toString()}`;
  },

  list: async (): Promise<{ activeThemeId: string | null; themes: ThemeMeta[] }> => {
    const res = await client.get('/');
    return res.data.data;
  },

  upload: async (file: File, name?: string): Promise<ThemeMeta> => {
    const fd = new FormData();
    fd.append('theme', file);
    if (name) fd.append('name', name);
    const res = await client.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data.data;
  },

  activate: async (id: string): Promise<void> => { await client.post(`/${id}/activate`); },
  remove: async (id: string): Promise<void> => { await client.delete(`/${id}`); },

  getEditor: async (id: string): Promise<EditorPayload> => {
    const res = await client.get(`/${id}/editor`);
    return res.data.data;
  },

  saveDraft: async (id: string, draft: { settingsData?: any; templates?: any; groups?: any }): Promise<void> => {
    await client.put(`/${id}/draft`, draft);
  },

  discardDraft: async (id: string): Promise<void> => { await client.delete(`/${id}/draft`); },

  publish: async (id: string, draft?: { settingsData?: any; templates?: any; groups?: any }): Promise<void> => {
    await client.post(`/${id}/publish`, draft ?? {});
  },

  listFiles: async (id: string): Promise<string[]> => {
    const res = await client.get(`/${id}/files`);
    return res.data.data;
  },

  readFile: async (id: string, path: string): Promise<string> => {
    const res = await client.get(`/${id}/file`, { params: { path } });
    return res.data.data.content;
  },

  writeFile: async (id: string, path: string, content: string): Promise<void> => {
    await client.put(`/${id}/file`, { path, content });
  },
};
