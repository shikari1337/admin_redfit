import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutTemplate, Upload, Paintbrush, Trash2, CheckCircle2, Globe, Loader2, Info } from 'lucide-react';
import { themeEngineAPI, ThemeMeta } from '../services/themeEngine';

/**
 * Themes — Shopify-style theme library for template-mode storefronts.
 * Upload a Shopify-format theme zip, activate it, or open the live customizer.
 */
export default function Themes() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [themes, setThemes] = useState<ThemeMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineDown, setEngineDown] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await themeEngineAPI.list();
      setThemes(data.themes);
      setActiveId(data.activeThemeId);
      setEngineDown(false);
    } catch (e: any) {
      if (!e?.response) setEngineDown(true);
      else setError(e?.response?.data?.message || 'Failed to load themes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await themeEngineAPI.upload(file);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Upload failed — is it a valid theme zip (layout/theme.liquid)?');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onActivate = async (id: string) => {
    setBusy(id);
    try { await themeEngineAPI.activate(id); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to activate'); }
    finally { setBusy(null); }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this theme permanently?')) return;
    setBusy(id);
    try { await themeEngineAPI.remove(id); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to delete'); }
    finally { setBusy(null); }
  };

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading themes…</div>;
  }

  if (engineDown) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Themes</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-2xl">
          <p className="font-semibold text-amber-800 m-0">Theme engine is not reachable</p>
          <p className="text-sm text-amber-700 mt-2 mb-0">
            Start the theme-engine service (<code className="bg-amber-100 px-1 rounded">cd theme-engine &amp;&amp; npm run dev</code>,
            default <code className="bg-amber-100 px-1 rounded">http://localhost:3050</code>) or set{' '}
            <code className="bg-amber-100 px-1 rounded">VITE_THEME_ENGINE_URL</code> to where it runs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6 text-indigo-600" /> Themes
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload a Shopify-format theme (zip with <code>layout/theme.liquid</code>) — it powers your
            storefront when the store is in <b>template</b> mode.
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
            {uploading ? 'Uploading…' : 'Upload theme'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="mb-4 flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-[13px] rounded-lg px-4 py-3 max-w-3xl">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Whether your storefront uses an uploaded theme or a custom-coded website is controlled by the
          platform (super admin) per store. Themes here are always editable and previewable either way.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {themes.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div key={t.id} className={`bg-white rounded-xl border p-5 ${isActive ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900 m-0 flex items-center gap-2">
                    {t.name}
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <Globe className="h-3 w-3" /> Live
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 mb-0">
                    {t.version && <>v{t.version} · </>}
                    {t.source === 'starter' ? 'Bundled starter' : 'Uploaded'} ·{' '}
                    {new Date(t.updatedAt || t.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => navigate(`/themes/${t.id}/customize`)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-[13px] font-semibold hover:bg-gray-800"
                >
                  <Paintbrush className="h-3.5 w-3.5" /> Customize
                </button>
                {!isActive && (
                  <button
                    onClick={() => onActivate(t.id)}
                    disabled={busy === t.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Publish
                  </button>
                )}
                {!isActive && (
                  <button
                    onClick={() => onDelete(t.id)}
                    disabled={busy === t.id}
                    className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-2 border border-red-200 text-red-600 rounded-lg text-[13px] font-semibold hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
