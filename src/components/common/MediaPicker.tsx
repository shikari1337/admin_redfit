import React, { useEffect, useState, useCallback } from 'react';
import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor';
import { uploadAPI } from '../../services/api';
import { filterBySearch } from '../../utils/search';

/**
 * WordPress-style media picker + image customizer (reusable).
 * - Media Library tab: browse previously uploaded images, search, select.
 * - Upload tab: drag/drop or pick files → uploaded to the tenant bucket.
 * - "Customize" opens a full image editor (crop, rotate, flip, filters, adjust,
 *   annotate, text, resize, watermark) via react-filerobot-image-editor; the
 *   edited result is re-uploaded and returned.
 *
 * Drop it next to any image field via the `openMediaPicker` helper or by rendering
 * <MediaPicker open onClose onSelect folder /> directly.
 */
export interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  folder?: string;
}

interface LibItem { key: string; url: string; size?: number }

const IMG_RE = /\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i;

const MediaPicker: React.FC<MediaPickerProps> = ({ open, onClose, onSelect, folder = 'products/gallery' }) => {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [library, setLibrary] = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // image url being customized

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const files = await uploadAPI.listFiles();
      const items: LibItem[] = (Array.isArray(files) ? files : [])
        .filter((f: any) => IMG_RE.test(f.key || f.url || ''))
        .map((f: any) => ({ key: f.key, url: f.url, size: f.size }))
        .reverse(); // newest first
      setLibrary(items);
    } catch (e) { console.error('Failed to load media library', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) { loadLibrary(); setSelected(''); setTab('library'); } }, [open, loadLibrary]);

  const handleUpload = async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setUploading(true);
    try {
      const res: any = await uploadAPI.uploadMultiple(imgs, folder);
      const urls: string[] = (res?.files || res?.data?.files || []).map((f: any) => f?.url || f).filter(Boolean);
      await loadLibrary();
      if (urls[0]) setSelected(urls[0]);
      setTab('library');
    } catch (e: any) { alert(e?.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  // Convert the editor's base64 output → File → upload → return URL.
  const saveEdited = async (base64: string, name: string, mime: string) => {
    setUploading(true);
    try {
      const blob = await (await fetch(base64)).blob();
      const file = new File([blob], name || `edited-${Date.now()}.png`, { type: mime || blob.type || 'image/png' });
      const res: any = await uploadAPI.uploadSingle(file, folder);
      const url = res?.url || res?.data?.url;
      setEditing(null);
      if (url) { await loadLibrary(); setSelected(url); }
    } catch (e) { console.error('Failed to save edited image', e); alert('Could not save edited image'); }
    finally { setUploading(false); }
  };

  if (!open) return null;

  const shown = filterBySearch(library, search, ['key'] as any, { limit: 60, min: 3 });

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-1">
            {(['library', 'upload'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${tab === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t === 'library' ? 'Media Library' : 'Upload New'}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {tab === 'upload' ? (
            <label
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files); }}
              className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg h-64 cursor-pointer hover:border-red-400"
            >
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.currentTarget.value = ''; }} />
              <span className="text-4xl text-gray-300 mb-2">⬆</span>
              <p className="text-sm text-gray-600">{uploading ? 'Uploading…' : 'Drop images here or click to upload'}</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP, GIF, SVG</p>
            </label>
          ) : (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search media (min 3 letters)…"
                className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
              {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : shown.length === 0 ? (
                <p className="text-sm text-gray-400">No images. Use “Upload New”.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {shown.map(item => (
                    <div key={item.key}
                      className={`relative group rounded-lg overflow-hidden border-2 cursor-pointer ${selected === item.url ? 'border-red-500 ring-2 ring-red-200' : 'border-gray-200 hover:border-gray-400'}`}
                      onClick={() => setSelected(item.url)}>
                      <div className="aspect-square bg-gray-100">
                        <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setEditing(item.url); }}
                        className="absolute bottom-1 right-1 bg-white/90 border border-gray-300 rounded px-1.5 py-0.5 text-[10px] text-gray-700 opacity-0 group-hover:opacity-100">
                        ✎ Edit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            {selected && (
              <>
                <img src={selected} alt="" className="w-9 h-9 rounded object-cover border border-gray-200" />
                <button type="button" onClick={() => setEditing(selected)}
                  className="px-2.5 py-1 text-xs border border-purple-300 text-purple-600 rounded hover:bg-purple-50">✎ Customize</button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-white">Cancel</button>
            <button type="button" disabled={!selected}
              onClick={() => { if (selected) { onSelect(selected); onClose(); } }}
              className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40">
              Use Selected
            </button>
          </div>
        </div>
      </div>

      {/* Image customizer */}
      {editing && (
        <div className="fixed inset-0 z-[70] bg-black/70">
          <FilerobotImageEditor
            source={editing}
            onSave={(edited: any) => saveEdited(edited.imageBase64, edited.fullName || edited.name, edited.mimeType)}
            onClose={() => setEditing(null)}
            annotationsCommon={{ fill: '#ff0000' }}
            tabsIds={[TABS.ADJUST, TABS.ANNOTATE, TABS.FINETUNE, TABS.FILTERS, TABS.RESIZE, TABS.WATERMARK]}
            defaultTabId={TABS.ADJUST}
            defaultToolId={TOOLS.CROP}
            savingPixelRatio={2}
            previewPixelRatio={1}
          />
        </div>
      )}
    </div>
  );
};

export default MediaPicker;
