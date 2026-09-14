import React, { useEffect, useState } from 'react';
import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor';
import { X, Sparkles, Link2, Upload, LayoutGrid, Pencil, Check } from 'lucide-react';
import { uploadAPI } from '../../services/api';
import MediaLibraryBrowser, { type MediaFile } from './MediaLibraryBrowser';
import AiImageDialog from './AiImageDialog';
import { useImageSpec, specHint } from '../../lib/imageSpecs';
import { useAiStatus, type AiEntity } from '../../lib/ai';

/**
 * The media picker every image field opens: Library (folders, search, the
 * whole store's media) · Upload · Generate with AI · From URL. Shows the
 * slot's required size at the top and judges the picked file against it.
 * "Customize" opens the image editor (crop/resize/annotate) and re-uploads
 * the result. Selecting never happens implicitly — "Use selected" does it.
 */
export interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  /** Bucket folder new uploads land in (relative to the store root). */
  folder?: string;
  /** Image slot key — drives the size hint and the AI output size. */
  spec?: string;
  entity?: AiEntity;
  entityId?: string | null;
  draft?: () => Record<string, any> | null | undefined;
  local?: Record<string, string | undefined>;
  referenceImages?: string[];
  accept?: 'image' | 'video' | 'all';
  title?: string;
  initialTab?: 'library' | 'upload' | 'ai' | 'url';
}

const MediaPicker: React.FC<MediaPickerProps> = ({
  open, onClose, onSelect, folder = 'products/gallery', spec: specKey, entity = 'generic', entityId, draft, local, referenceImages, accept = 'image', title, initialTab = 'library',
}) => {
  const [tab, setTab] = useState<'library' | 'upload' | 'ai' | 'url'>(initialTab);
  const [selected, setSelected] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const spec = useImageSpec(specKey);
  const ai = useAiStatus();

  useEffect(() => { if (open) { setSelected(''); setUrlValue(''); setError(null); setTab(initialTab); } }, [open, initialTab]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing && !aiOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editing, aiOpen, onClose]);

  if (!open) return null;

  const handleUpload = async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => accept === 'all' ? true : accept === 'video' ? f.type.startsWith('video/') : f.type.startsWith('image/'));
    if (!imgs.length) return;
    setUploading(true); setError(null);
    try {
      const res: any = await uploadAPI.uploadMultiple(imgs, folder);
      const urls: string[] = (res?.files || res?.data?.files || []).map((f: any) => f?.url || f).filter(Boolean);
      if (urls[0]) { setSelected(urls[0]); setTab('library'); }
    } catch (e: any) { setError(e?.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const saveEdited = async (base64: string, name: string, mime: string) => {
    setUploading(true);
    try {
      const blob = await (await fetch(base64)).blob();
      const file = new File([blob], name || `edited-${Date.now()}.png`, { type: mime || blob.type || 'image/png' });
      const res: any = await uploadAPI.uploadSingle(file, folder);
      const url = res?.url || res?.data?.url;
      setEditing(null);
      if (url) setSelected(url);
    } catch (e) { console.error('Failed to save edited image', e); setError('Could not save the edited image'); }
    finally { setUploading(false); }
  };

  const tabs: Array<{ id: typeof tab; label: string; icon: React.ReactNode }> = [
    { id: 'library', label: 'Media library', icon: <LayoutGrid size={14} /> },
    { id: 'upload', label: 'Upload', icon: <Upload size={14} /> },
    { id: 'ai', label: 'Generate with AI', icon: <Sparkles size={14} /> },
    { id: 'url', label: 'From URL', icon: <Link2 size={14} /> },
  ];

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget && !editing) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 h-8 text-sm font-medium rounded-md whitespace-nowrap ${tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'} ${t.id === 'ai' && tab !== 'ai' ? 'text-brand-700' : ''}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 min-w-0">
            {title && <span className="hidden md:block text-xs text-gray-500 truncate">{title}</span>}
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">{error}</p>}
          {tab === 'library' && (
            <MediaLibraryBrowser mode="picker" accept={accept} selected={selected} spec={specKey ? spec : null}
              uploadFolder={folder} height="100%" className="h-full"
              onSelect={(f: MediaFile) => setSelected(f.url)} onConfirm={(f: MediaFile) => { onSelect(f.url); onClose(); }} />
          )}
          {tab === 'upload' && (
            <div className="h-full flex flex-col">
              <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files); }}
                className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                <input type="file" accept={accept === 'image' ? 'image/*' : accept === 'video' ? 'video/*' : undefined} multiple className="hidden"
                  onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); e.currentTarget.value = ''; }} />
                <Upload size={36} className="text-gray-300 mb-3" />
                <p className="text-sm text-gray-700 font-medium">{uploading ? 'Uploading…' : 'Drop files here or click to choose'}</p>
                <p className="text-xs text-gray-400 mt-1">Saved to <code className="font-mono">{folder}</code> · JPG, PNG, WebP, GIF, SVG</p>
                {specKey && <p className="text-xs text-brand-800 bg-brand-50 border border-brand-100 rounded px-2 py-1 mt-3">Best at {specHint(spec)}</p>}
              </label>
            </div>
          )}
          {tab === 'ai' && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-50 text-brand-700 mb-3"><Sparkles size={22} /></span>
              <p className="text-sm font-medium text-gray-900">Generate an image for this exact slot</p>
              <p className="text-xs text-gray-500 mt-1 max-w-md">
                {specKey ? <>Made at <b>{spec.width} × {spec.height} px ({spec.aspect})</b> — {spec.description}</> : 'Made at a general 16:9 size — pass a slot for an exact fit.'}
                {' '}Uses the product / category / brand details as context{referenceImages?.length ? ' and can keep your real photos faithful' : ''}.
              </p>
              {!ai.canImage && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3 max-w-md">{ai.imageReason || ai.status?.reason || 'AI images are not configured.'}</p>}
              <button type="button" onClick={() => setAiOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 h-9 text-sm rounded-md bg-brand-600 text-white hover:bg-brand-700">
                <Sparkles size={15} /> Open the generator
              </button>
            </div>
          )}
          {tab === 'url' && (
            <div className="max-w-md mx-auto mt-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">Image URL</label>
              <input type="text" value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder="https://example.com/image.jpg" autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <p className="text-xs text-gray-400 mt-1.5">Paste a direct link to an image hosted elsewhere. Files in your own library are faster and never disappear.</p>
              {urlValue.trim() && (
                <div className="mt-4 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-video flex items-center justify-center">
                  <img src={urlValue.trim()} alt="" className="max-h-full max-w-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                </div>
              )}
              <button type="button" disabled={!/^https?:\/\//.test(urlValue.trim())} onClick={() => { onSelect(urlValue.trim()); onClose(); }}
                className="mt-4 w-full px-4 h-9 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-40">Use this URL</button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 min-w-0">
            {selected ? (
              <>
                <img src={selected} alt="" className="w-9 h-9 rounded object-cover border border-gray-200" />
                <button type="button" onClick={() => setEditing(selected)} className="inline-flex items-center gap-1 px-2.5 h-7 text-xs border border-gray-300 rounded hover:bg-white"><Pencil size={11} /> Customize</button>
              </>
            ) : <span className="text-xs text-gray-400">{specKey ? `Needs ${specHint(spec, { short: true })}` : 'Pick a file'}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 h-8 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50">Cancel</button>
            <button type="button" disabled={!selected} onClick={() => { if (selected) { onSelect(selected); onClose(); } }}
              className="inline-flex items-center gap-1.5 px-4 h-8 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-40"><Check size={14} /> Use selected</button>
          </div>
        </div>
      </div>

      <AiImageDialog open={aiOpen} onClose={() => setAiOpen(false)} slot={specKey} entity={entity} entityId={entityId} draft={draft}
        referenceImages={referenceImages} local={local} folder={folder} onUse={(url) => { onSelect(url); setAiOpen(false); onClose(); }} />

      {editing && (
        <div className="fixed inset-0 z-[90] bg-black/70">
          <FilerobotImageEditor
            source={editing}
            onSave={(edited: any) => saveEdited(edited.imageBase64, edited.fullName || edited.name, edited.mimeType)}
            onClose={() => setEditing(null)}
            annotationsCommon={{ fill: '#2e6a56' }}
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
