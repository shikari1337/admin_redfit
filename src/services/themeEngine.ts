import { v2call, v2http } from '../lib/v2/http';

/**
 * Themes on v2: `/api/v2/themes/themes...` (growcord-rs apps/themes; generated client ui/packages/api/src/themes.ts).
 * The theme library, the customiser's draft, publish, schedule and preview, and the code editor's files, called with
 * the signed-in staff member's own access (themes.read / manage / publish / code). The old separate theme-engine
 * service (VITE_THEME_ENGINE_URL, the store key as `x-api-key`) is gone: v2 serves the same library itself.
 *
 * The screens keep reading the shapes below; the v2 replies are mapped here, in one place.
 */
const T = '/api/v2/themes/themes';

export interface ThemeMeta {
  id: string;
  name: string;
  version?: string;
  source: 'upload' | 'starter' | string;
  isLive: boolean;
  fileCount?: number;
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
  /** The newest published version's number. */
  versionNumber: number;
  isLive: boolean;
  /** When the draft is scheduled to publish (an instant), else null. */
  publishAt: string | null;
}

export interface SectionSchema {
  type: string;
  name: string;
  settings?: any[];
  blocks?: any[];
  max_blocks?: number;
  presets?: any[];
}

export interface ThemeVersion {
  id: string;
  number: number;
  kind: string;
  note: string | null;
  publishedAt: string;
}

const themeOf = (t: any): ThemeMeta => ({
  id: String(t?.id ?? ''),
  name: t?.name ?? '',
  version: t?.declared_version ?? undefined,
  source: t?.source ?? 'upload',
  isLive: t?.is_live === true,
  fileCount: typeof t?.file_count === 'number' ? t.file_count : undefined,
  createdAt: t?.created_at ?? '',
  updatedAt: t?.updated_at ?? undefined,
});

const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});

/**
 * The draft revision each open theme was read at. v2 refuses a draft save made over someone else's newer one
 * (`themes.draft_conflict`) instead of overwriting it; the customiser keeps the revision it last saw here.
 */
const revisions = new Map<string, number | null>();

export const themeEngineAPI = {
  /** The store's themes, the live one marked. */
  list: async (): Promise<{ activeThemeId: string | null; themes: ThemeMeta[] }> => {
    const rows = await v2call<any[]>('GET', T, { params: { limit: 100 } });
    const themes = (Array.isArray(rows) ? rows : []).map(themeOf);
    return { activeThemeId: themes.find((t) => t.isLive)?.id ?? null, themes };
  },

  /** Upload a theme package (.zip). The server checks it; a refusal carries the report's message. */
  upload: async (file: File): Promise<ThemeMeta> => {
    const fd = new FormData();
    fd.append('theme', file);
    const res = await v2call<any>('POST', `${T}/upload`, { data: fd });
    return themeOf(res?.theme ?? res);
  },

  /** Give a store with no theme the bundled starter theme. */
  starter: async (): Promise<ThemeMeta> => {
    const res = await v2call<any>('POST', `${T}/starter`, { data: {} });
    return themeOf(res?.theme ?? res);
  },

  activate: async (id: string): Promise<void> => { await v2call('POST', `${T}/${id}/activate`, { data: {} }); },
  duplicate: async (id: string, name?: string): Promise<ThemeMeta> => themeOf(await v2call('POST', `${T}/${id}/duplicate`, { data: name ? { name } : {} })),
  remove: async (id: string): Promise<void> => { await v2call('DELETE', `${T}/${id}`); },

  getEditor: async (id: string): Promise<EditorPayload> => {
    const e = await v2call<any>('GET', `${T}/${id}/editor`);
    revisions.set(id, typeof e?.draft?.revision === 'number' ? e.draft.revision : null);
    return {
      settingsSchema: Array.isArray(e?.settings_schema) ? e.settings_schema : [],
      settingsData: obj(e?.settings_data),
      templates: obj(e?.templates),
      groups: obj(e?.groups),
      sectionSchemas: Array.isArray(e?.section_schemas) ? e.section_schemas : [],
      hasDraft: !!e?.draft,
      versionNumber: Number(e?.version_number) || 0,
      isLive: e?.is_live === true,
      publishAt: e?.draft?.publish_at ?? null,
    };
  },

  /**
   * Save the whole edited state as the draft. A v2 save REPLACES the draft (settings, templates and groups over
   * the newest version), so the full state goes every time, with the revision this editor last saw.
   */
  saveDraft: async (id: string, draft: { settingsData?: any; templates?: any; groups?: any }): Promise<void> => {
    const res = await v2call<any>('PUT', `${T}/${id}/draft`, {
      data: {
        revision: revisions.get(id) ?? null,
        settings_data: draft.settingsData ?? null,
        templates: obj(draft.templates),
        groups: obj(draft.groups),
      },
    });
    if (typeof res?.revision === 'number') revisions.set(id, res.revision);
  },

  discardDraft: async (id: string): Promise<void> => {
    await v2call('DELETE', `${T}/${id}/draft`);
    revisions.set(id, null);
  },

  /** Publish the saved draft as a new version (save it first). */
  publish: async (id: string, note?: string): Promise<void> => {
    await v2call('POST', `${T}/${id}/publish`, { data: note ? { note } : {} });
    revisions.set(id, null);
  },

  /** Publish the saved draft later, at `publishAt` (an RFC 3339 instant). */
  schedule: async (id: string, publishAt: string, note?: string): Promise<void> => {
    const res = await v2call<any>('POST', `${T}/${id}/schedule`, { data: { publish_at: publishAt, ...(note ? { note } : {}) } });
    if (typeof res?.revision === 'number') revisions.set(id, res.revision);
  },

  cancelSchedule: async (id: string): Promise<void> => {
    const res = await v2call<any>('DELETE', `${T}/${id}/schedule`);
    if (typeof res?.revision === 'number') revisions.set(id, res.revision);
  },

  /** The theme's published versions, newest first. */
  versions: async (id: string): Promise<ThemeVersion[]> => {
    const rows = await v2call<any[]>('GET', '/api/v2/themes/versions', { params: { theme_id: id, sort: '-number', limit: 50 } });
    return (Array.isArray(rows) ? rows : []).map((v) => ({
      id: String(v?.id ?? ''), number: Number(v?.number) || 0, kind: v?.kind ?? '', note: v?.note ?? null, publishedAt: v?.published_at ?? '',
    }));
  },

  /** Restore an older version as a new version. */
  rollback: async (id: string, versionId: string, note?: string): Promise<void> => {
    await v2call('POST', `${T}/${id}/rollback`, { data: { version_id: versionId, ...(note ? { note } : {}) } });
    revisions.set(id, null);
  },

  /**
   * The draft rendered for the customiser's frame: a whole HTML document (its assets addressed through a
   * short-lived ticket in their path), shown with `srcdoc` in a sandboxed frame. Asked with the staff
   * member's own access, so no store key or ticket ever rides in a frame address.
   */
  previewHtml: async (id: string, template: string, handle?: string): Promise<string> => {
    try {
      const res = await v2http.request({
        method: 'POST',
        url: `${T}/${id}/preview`,
        data: { template, ...(handle ? { handle } : {}) },
        responseType: 'text',
        headers: { accept: 'text/html' },
      });
      return typeof res.data === 'string' ? res.data : '';
    } catch (e: any) {
      // Asked as text, a refusal arrives as its JSON text: read it so callers find `response.data.message`.
      const raw = e?.response?.data;
      if (typeof raw === 'string') {
        try { e.response.data = JSON.parse(raw); } catch { e.response.data = { message: raw.slice(0, 200) }; }
      }
      throw e;
    }
  },

  listFiles: async (id: string): Promise<string[]> => {
    const rows = await v2call<any[]>('GET', `${T}/${id}/files`);
    return (Array.isArray(rows) ? rows : []).map((f) => String(f?.path ?? '')).filter(Boolean);
  },

  readFile: async (id: string, path: string): Promise<string> => {
    const res = await v2call<any>('GET', `${T}/${id}/files/content`, { params: { path } });
    return res?.content ?? '';
  },

  writeFile: async (id: string, path: string, content: string): Promise<void> => {
    await v2call('PUT', `${T}/${id}/files/content`, { data: { path, content } });
  },
};
