import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutTemplate, Upload, Paintbrush, Trash2, CheckCircle2, Globe, Loader2, Info, Copy, History, Sparkles } from 'lucide-react';
import { themeEngineAPI, ThemeMeta, ThemeVersion } from '../services/themeEngine';
import { formatDateTime, localeDate } from '../utils/date';

/**
 * Themes: the store's theme library on v2 (`/api/v2/themes`, services/themeEngine.ts). Upload a Shopify-format
 * theme zip, make one live, copy it, open the live customiser, and see each theme's published versions with a
 * restore. Whether the shop renders a theme or its own custom website is the platform's per-store storefront mode.
 */
export default function Themes() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [themes, setThemes] = useState<ThemeMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionsOf, setVersionsOf] = useState<string | null>(null);
  const [versions, setVersions] = useState<ThemeVersion[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await themeEngineAPI.list();
      setThemes(data.themes);
      setActiveId(data.activeThemeId);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.response?.data?.message || 'The themes could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (id: string, what: () => Promise<unknown>, failed: string) => {
    setBusy(id);
    setError(null);
    try { await what(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || failed); }
    finally { setBusy(null); }
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await themeEngineAPI.upload(file);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Upload failed. Is it a theme zip with layout/theme.liquid?');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onActivate = (t: ThemeMeta) => {
    if (!window.confirm(`Make "${t.name}" the live theme? Shoppers see it straight away.`)) return;
    run(t.id, () => themeEngineAPI.activate(t.id), 'The theme could not be made live.');
  };

  const onDelete = (t: ThemeMeta) => {
    if (!window.confirm(`Delete "${t.name}" for good? This cannot be undone.`)) return;
    run(t.id, () => themeEngineAPI.remove(t.id), 'The theme could not be deleted.');
  };

  const showVersions = async (id: string) => {
    if (versionsOf === id) { setVersionsOf(null); return; }
    setVersionsOf(id);
    setVersions(null);
    try { setVersions(await themeEngineAPI.versions(id)); }
    catch (e: any) { setVersions([]); setError(e?.response?.data?.message || 'The versions could not be loaded.'); }
  };

  const onRestore = (t: ThemeMeta, v: ThemeVersion) => {
    if (!window.confirm(`Restore version ${v.number} of "${t.name}"? It is published again as a new version${t.isLive ? ', live on the shop' : ''}.`)) return;
    run(t.id, async () => {
      await themeEngineAPI.rollback(t.id, v.id, `Restored version ${v.number}`);
      setVersions(await themeEngineAPI.versions(t.id));
    }, 'The version could not be restored.');
  };

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading themes...</div>;
  }

  const live = themes.find((t) => t.id === activeId);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6 text-indigo-600" /> Themes
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {live ? <>Live theme: <b>{live.name}</b>.</> : themes.length ? 'No theme is live yet.' : ''}{' '}
            Upload a Shopify-format theme (a zip with <code>layout/theme.liquid</code>); it powers the shop when the
            store is in <b>template</b> mode.
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading...' : 'Upload theme'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={() => { setLoading(true); load(); }} className="text-xs font-semibold underline shrink-0">Retry</button>
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="mb-4 flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-[13px] rounded-lg px-4 py-3 max-w-3xl">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Whether your shop shows an uploaded theme or a custom-built website is set by the platform for each store.
          Themes here can be edited and previewed either way.
        </span>
      </div>

      {!loadError && themes.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center max-w-xl">
          <p className="font-semibold text-gray-800 m-0">No themes yet</p>
          <p className="text-sm text-gray-500 mt-1">Upload a theme zip, or start from the starter theme and customise it.</p>
          <button
            onClick={() => run('starter', () => themeEngineAPI.starter(), 'The starter theme could not be added.')}
            disabled={busy === 'starter'}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-50 disabled:opacity-60"
          >
            {busy === 'starter' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Add the starter theme
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {themes.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div key={t.id} className={`bg-white rounded-xl border p-5 ${isActive ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 m-0 flex items-center gap-2 flex-wrap">
                    <span className="truncate">{t.name}</span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <Globe className="h-3 w-3" /> Live
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 mb-0">
                    {[t.version ? `v${t.version}` : '', t.source === 'starter' ? 'Starter theme' : 'Uploaded', localeDate(t.updatedAt || t.createdAt)].filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <button
                  onClick={() => navigate(`/themes/${t.id}/customize`)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-[13px] font-semibold hover:bg-gray-800"
                >
                  <Paintbrush className="h-3.5 w-3.5" /> Customise
                </button>
                {!isActive && (
                  <button
                    onClick={() => onActivate(t)}
                    disabled={busy === t.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Make live
                  </button>
                )}
                <button
                  onClick={() => run(t.id, () => themeEngineAPI.duplicate(t.id), 'The theme could not be copied.')}
                  disabled={busy === t.id}
                  title="Copy this theme (files, settings, newest version)"
                  className="inline-flex items-center gap-1.5 px-2.5 py-2 border border-gray-300 rounded-lg text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => showVersions(t.id)}
                  title="Published versions"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-2 border rounded-lg text-[13px] font-semibold hover:bg-gray-50 ${versionsOf === t.id ? 'border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-700'}`}
                >
                  <History className="h-3.5 w-3.5" />
                </button>
                {!isActive && (
                  <button
                    onClick={() => onDelete(t)}
                    disabled={busy === t.id}
                    title="Delete"
                    className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-2 border border-red-200 text-red-600 rounded-lg text-[13px] font-semibold hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {versionsOf === t.id && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Versions</p>
                  {versions === null ? (
                    <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</p>
                  ) : versions.length === 0 ? (
                    <p className="text-xs text-gray-400">No published versions.</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                      {versions.map((v, i) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0">
                            <span className="font-semibold text-gray-800">v{v.number}</span>
                            <span className="text-gray-500">, {formatDateTime(v.publishedAt)}{v.kind && v.kind !== 'publish' ? `, ${v.kind}` : ''}</span>
                            {v.note && <span className="block text-gray-400 truncate">{v.note}</span>}
                          </span>
                          {i === 0 ? (
                            <span className="text-[11px] text-gray-400 shrink-0">Newest</span>
                          ) : (
                            <button
                              onClick={() => onRestore(t, v)}
                              disabled={busy === t.id}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-60 shrink-0"
                            >
                              Restore
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
