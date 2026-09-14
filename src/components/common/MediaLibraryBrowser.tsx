import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder, FolderOpen, ChevronRight, ChevronDown, Search, Upload, Trash2, Loader2, Check, Copy, RefreshCw, ImageIcon, Film, FileIcon, Info,
} from 'lucide-react';
import api, { uploadAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { type ImageSpec, checkAgainstSpec, readImageDimensions, specHint } from '../../lib/imageSpecs';

/**
 * The store's media, as it really is in the bucket: FOLDERS (every prefix
 * under the store root — products, sku, brands, categories, banners, ai/…,
 * including the ~48,000 product photos the old localStorage "Gallery" never
 * showed) and one page of files at a time via `GET /upload/browse`.
 *
 * Used by the Media library page (manager mode: delete, copy URL) and by
 * every image picker (picker mode: select). Scoped to THIS store by the
 * server — the browser only ever sends a relative folder.
 */
export interface MediaFile {
  key: string; url: string; name: string; size?: number; lastModified?: string | Date; kind: 'image' | 'video' | 'file'; ext: string;
}

export interface MediaLibraryBrowserProps {
  mode?: 'picker' | 'manager';
  accept?: 'image' | 'video' | 'all';
  selected?: string | null;
  onSelect?: (file: MediaFile) => void;
  /** Double-click / Enter — "pick and close" in a picker. */
  onConfirm?: (file: MediaFile) => void;
  initialPrefix?: string;
  /** Folder new uploads go to when the user is at the root (relative, e.g. "products/gallery"). */
  uploadFolder?: string;
  /** The slot this picker is for — files are judged against it. */
  spec?: ImageSpec | null;
  className?: string;
  /** Height of the scroll area; the page passes a large one, the picker a modal-sized one. */
  height?: string;
}

interface BrowsePage { prefix: string; folders: Array<{ name: string; prefix: string }>; files: MediaFile[]; nextCursor: string | null; root: string }

const PAGE = 120;
const fmtSize = (b?: number) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

async function browse(prefix: string, cursor?: string | null, search?: string, limit = PAGE): Promise<BrowsePage> {
  const r = await api.get('/upload/browse', { params: { prefix, cursor: cursor || undefined, limit, search: search || undefined } });
  const d = r.data?.files ? r.data : r.data?.data;
  return { prefix: d?.prefix ?? '', folders: d?.folders ?? [], files: d?.files ?? [], nextCursor: d?.nextCursor ?? null, root: d?.root ?? '' };
}

/** Lazy folder tree node. */
const TreeNode: React.FC<{
  prefix: string; name: string; depth: number; current: string; onNavigate: (p: string) => void;
  childrenOf: (p: string) => Promise<Array<{ name: string; prefix: string }>>;
}> = ({ prefix, name, depth, current, onNavigate, childrenOf }) => {
  const [open, setOpen] = useState(depth === 0 || current.startsWith(prefix));
  const [kids, setKids] = useState<Array<{ name: string; prefix: string }> | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || kids !== null) return;
    let alive = true;
    setLoading(true);
    childrenOf(prefix).then((k) => alive && setKids(k)).catch(() => alive && setKids([])).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [open, kids, prefix, childrenOf]);
  useEffect(() => { if (current.startsWith(prefix) && current !== prefix) setOpen(true); }, [current, prefix]);
  const active = current === prefix;
  return (
    <div>
      <div className={`flex items-center gap-1 rounded-md pr-2 ${active ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-100'}`} style={{ paddingLeft: depth * 12 + 4 }}>
        <button type="button" onClick={() => setOpen((v) => !v)} className="w-5 h-6 inline-flex items-center justify-center text-gray-400" aria-label={open ? 'Collapse' : 'Expand'}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : kids && kids.length === 0 ? <span className="w-3" /> : open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <button type="button" onClick={() => onNavigate(prefix)} className="flex-1 min-w-0 flex items-center gap-1.5 h-7 text-[13px] text-left">
          {active || open ? <FolderOpen size={14} className={active ? 'text-brand-600' : 'text-amber-500'} /> : <Folder size={14} className="text-amber-500" />}
          <span className="truncate">{name}</span>
        </button>
      </div>
      {open && kids && kids.map((k) => (
        <TreeNode key={k.prefix} prefix={k.prefix} name={k.name} depth={depth + 1} current={current} onNavigate={onNavigate} childrenOf={childrenOf} />
      ))}
    </div>
  );
};

const MediaLibraryBrowser: React.FC<MediaLibraryBrowserProps> = ({
  mode = 'picker', accept = 'image', selected, onSelect, onConfirm, initialPrefix = '', uploadFolder, spec, className = '', height = '60vh',
}) => {
  const { hasPerm } = useAuth();
  const canUpload = hasPerm('page_editor');
  const canDelete = hasPerm('content.delete');
  const [prefix, setPrefix] = useState(initialPrefix);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [folders, setFolders] = useState<Array<{ name: string; prefix: string }>>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deepSearch, setDeepSearch] = useState(false);
  const [sort, setSort] = useState<'newest' | 'name' | 'size'>('newest');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dims, setDims] = useState<Record<string, { width: number; height: number } | null>>({});
  const [detail, setDetail] = useState<MediaFile | null>(null);
  const treeCache = useRef(new Map<string, Array<{ name: string; prefix: string }>>());
  const fileInput = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const childrenOf = useCallback(async (p: string) => {
    const hit = treeCache.current.get(p);
    if (hit) return hit;
    const page = await browse(p, null, undefined, 200);
    treeCache.current.set(p, page.folders);
    return page.folders;
  }, []);

  const load = useCallback(async (p: string, opts: { append?: boolean; cursor?: string | null; search?: string } = {}) => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const page = await browse(p, opts.cursor, opts.search);
      if (id !== reqId.current) return;
      treeCache.current.set(p, page.folders);
      setFolders((prev) => (opts.append ? mergeFolders(prev, page.folders) : page.folders));
      setFiles((prev) => (opts.append ? dedupe([...prev, ...page.files]) : page.files));
      setCursor(page.nextCursor);
      setMore(!!page.nextCursor);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setError(e?.response?.data?.message || e?.message || 'Could not load media');
    } finally { if (id === reqId.current) setLoading(false); }
  }, []);

  useEffect(() => { setSearch(''); setDeepSearch(false); load(prefix); }, [prefix, load]);

  // Server-side page filter when typing (debounced); deep search walks pages.
  useEffect(() => {
    const t = setTimeout(() => { if (!deepSearch) load(prefix, { search }); }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchAllPages = async () => {
    setDeepSearch(true); setLoading(true); setError(null);
    const id = ++reqId.current;
    try {
      let c: string | null = null; let acc: MediaFile[] = []; let n = 0;
      do {
        const page: BrowsePage = await browse(prefix, c, search, 500);
        acc = dedupe([...acc, ...page.files]); c = page.nextCursor; n++;
        if (id !== reqId.current) return;
        setFiles(acc);
      } while (c && n < 40);
      setCursor(c); setMore(!!c);
    } catch (e: any) { setError(e?.message || 'Search failed'); }
    finally { if (id === reqId.current) setLoading(false); }
  };

  const visible = useMemo(() => {
    let list = files.filter((f) => accept === 'all' || f.kind === accept);
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'size') list = [...list].sort((a, b) => (b.size || 0) - (a.size || 0));
    else list = [...list].sort((a, b) => new Date(b.lastModified || 0).getTime() - new Date(a.lastModified || 0).getTime());
    return list;
  }, [files, accept, sort]);

  const uploadTarget = prefix ? prefix.replace(/\/$/, '') : (uploadFolder || 'uploads');

  const handleUpload = async (list: FileList | File[]) => {
    const arr = Array.from(list).filter((f) => accept === 'all' ? true : accept === 'image' ? f.type.startsWith('image/') : f.type.startsWith('video/'));
    if (!arr.length) return;
    setUploading(true); setError(null);
    try {
      const res: any = await uploadAPI.uploadMultiple(arr, uploadTarget);
      const uploaded: any[] = res?.files || res?.data?.files || [];
      const fresh: MediaFile[] = uploaded.map((u: any) => ({
        key: u.key, url: u.url, name: String(u.key || '').split('/').pop() || '', size: undefined, lastModified: new Date().toISOString(),
        kind: /\.(mp4|webm|mov|m4v)$/i.test(u.key || '') ? 'video' : 'image', ext: (String(u.key || '').split('.').pop() || '').toLowerCase(),
      }));
      // The upload went to a folder that may not be the one on screen — show it there.
      if (uploadTarget === prefix.replace(/\/$/, '') || (!prefix && uploadTarget === (uploadFolder || 'uploads'))) {
        setFiles((prev) => dedupe([...fresh, ...prev]));
        if (fresh[0] && onSelect) onSelect(fresh[0]);
      } else {
        setPrefix(uploadTarget + '/');
      }
      treeCache.current.clear();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDelete = async (f: MediaFile) => {
    if (!window.confirm(`Delete "${f.name}"? Anything on the website using it will show a broken image.`)) return;
    setDeleting(f.key);
    try { await uploadAPI.deleteFile(f.key); setFiles((prev) => prev.filter((x) => x.key !== f.key)); if (detail?.key === f.key) setDetail(null); }
    catch (e: any) { setError(e?.response?.data?.message || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const copyUrl = (f: MediaFile) => { navigator.clipboard?.writeText(f.url).then(() => { setCopied(f.key); setTimeout(() => setCopied(null), 1200); }); };

  const measure = (f: MediaFile) => {
    if (f.kind !== 'image' || dims[f.key] !== undefined) return;
    readImageDimensions(f.url).then((d) => setDims((prev) => ({ ...prev, [f.key]: d })));
  };

  const crumbs = useMemo(() => {
    const parts = prefix.split('/').filter(Boolean);
    return parts.map((p, i) => ({ name: p, prefix: parts.slice(0, i + 1).join('/') + '/' }));
  }, [prefix]);

  const check = detail && spec && detail.kind === 'image' ? checkAgainstSpec(dims[detail.key] ?? null, detail.size ?? null, spec) : null;

  return (
    <div className={`flex flex-col md:flex-row gap-0 border border-gray-200 rounded-lg overflow-hidden bg-white ${className}`} style={{ height }}>
      {/* Folder tree */}
      <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50/60 overflow-auto p-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-400 px-2 pt-1 pb-1.5">Folders</div>
        <TreeNode prefix="" name="All media" depth={0} current={prefix} onNavigate={setPrefix} childrenOf={childrenOf} />
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200">
          <nav className="flex items-center gap-1 text-xs text-gray-600 min-w-0 flex-1">
            <button type="button" onClick={() => setPrefix('')} className={`hover:underline ${!prefix ? 'font-semibold text-gray-900' : ''}`}>All media</button>
            {crumbs.map((c) => (
              <React.Fragment key={c.prefix}>
                <ChevronRight size={12} className="text-gray-300" />
                <button type="button" onClick={() => setPrefix(c.prefix)} className={`hover:underline truncate ${c.prefix === prefix ? 'font-semibold text-gray-900' : ''}`}>{c.name}</button>
              </React.Fragment>
            ))}
          </nav>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setDeepSearch(false); }} placeholder="Search file names…"
              onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) searchAllPages(); }}
              className="h-8 pl-7 pr-2 w-44 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-8 text-xs border border-gray-300 rounded-md px-1.5">
            <option value="newest">Newest</option><option value="name">Name</option><option value="size">Largest</option>
          </select>
          <button type="button" onClick={() => { treeCache.current.clear(); load(prefix); }} className="h-8 w-8 inline-flex items-center justify-center border border-gray-300 rounded-md text-gray-500 hover:bg-gray-50" title="Refresh"><RefreshCw size={13} /></button>
          {canUpload && (
            <>
              <input ref={fileInput} type="file" multiple className="hidden" accept={accept === 'image' ? 'image/*' : accept === 'video' ? 'video/*' : undefined}
                onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); e.currentTarget.value = ''; }} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
                className="h-8 inline-flex items-center gap-1.5 px-2.5 text-xs rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50" title={`Upload into ${uploadTarget}`}>
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload{prefix ? '' : ` to ${uploadTarget}`}
              </button>
            </>
          )}
        </div>

        {spec && (
          <div className="px-3 py-1.5 text-[11px] text-brand-800 bg-brand-50 border-b border-brand-100 flex items-center gap-1.5">
            <Info size={12} /> This field needs <b className="font-semibold">{specHint(spec, { short: true })}</b> · {spec.fit === 'cover' ? 'edges are cropped to fit' : 'shown whole'}{spec.uses ? ` · ${spec.uses}` : ''}
          </div>
        )}

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-auto p-3"
            onDragOver={(e) => { if (canUpload) e.preventDefault(); }}
            onDrop={(e) => { if (canUpload && e.dataTransfer.files?.length) { e.preventDefault(); handleUpload(e.dataTransfer.files); } }}>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-2">{error}</p>}
            {search && !deepSearch && (
              <p className="text-[11px] text-gray-500 mb-2">Filtering this page · <button type="button" className="text-brand-700 hover:underline" onClick={searchAllPages}>search every file in this folder</button></p>
            )}
            {folders.length > 0 && !search && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 mb-3">
                {folders.map((f) => (
                  <button key={f.prefix} type="button" onClick={() => setPrefix(f.prefix)} onDoubleClick={() => setPrefix(f.prefix)}
                    className="flex flex-col items-center gap-1 p-2 rounded-md border border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 text-gray-700">
                    <Folder size={26} className="text-amber-500" />
                    <span className="text-[11px] truncate w-full text-center">{f.name}</span>
                  </button>
                ))}
              </div>
            )}
            {loading && files.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm"><Loader2 size={20} className="animate-spin inline-block mr-2" />Loading…</div>
            ) : visible.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <ImageIcon size={30} className="mx-auto mb-2" />
                <p className="text-sm">{files.length ? 'No files of this type here.' : folders.length ? 'No files at this level — open a folder.' : 'Nothing here yet.'}</p>
                {canUpload && <p className="text-xs mt-1">Drop files here or click Upload.</p>}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                {visible.map((f) => {
                  const isSel = selected === f.url;
                  return (
                    <div key={f.key} className={`group relative rounded-md overflow-hidden border-2 cursor-pointer bg-gray-50 ${isSel ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-400'}`}
                      onClick={() => { onSelect?.(f); setDetail(f); measure(f); }}
                      onDoubleClick={() => onConfirm?.(f)}
                      onMouseEnter={() => measure(f)}
                      title={f.name}>
                      <div className="aspect-square flex items-center justify-center">
                        {f.kind === 'image' ? <img src={f.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                          : f.kind === 'video' ? <Film size={26} className="text-gray-400" /> : <FileIcon size={26} className="text-gray-400" />}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[10px] text-white truncate">{f.name}</p>
                        <p className="text-[9px] text-gray-300">{fmtSize(f.size)}{dims[f.key] ? ` · ${dims[f.key]!.width}×${dims[f.key]!.height}` : ''}</p>
                      </div>
                      {isSel && <span className="absolute top-1 right-1 bg-brand-600 text-white rounded-full p-0.5"><Check size={11} /></span>}
                      {mode === 'manager' && (
                        <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={(e) => { e.stopPropagation(); copyUrl(f); }} className="bg-white/90 rounded p-1 text-gray-700 hover:text-brand-700" title="Copy URL">{copied === f.key ? <Check size={11} /> : <Copy size={11} />}</button>
                          {canDelete && <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(f); }} disabled={deleting === f.key} className="bg-white/90 rounded p-1 text-red-600 hover:bg-red-50" title="Delete">{deleting === f.key ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {more && !deepSearch && (
              <div className="pt-3 text-center">
                <button type="button" disabled={loading} onClick={() => load(prefix, { append: true, cursor, search })}
                  className="px-3 h-8 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">{loading ? 'Loading…' : 'Load more'}</button>
              </div>
            )}
          </div>

          {/* Detail rail */}
          {detail && (
            <aside className="hidden lg:block w-56 shrink-0 border-l border-gray-200 p-3 overflow-auto text-xs">
              {detail.kind === 'image' && <img src={detail.url} alt="" className="w-full rounded border border-gray-200 bg-gray-50 object-contain max-h-40" />}
              <p className="mt-2 font-medium text-gray-900 break-all">{detail.name}</p>
              <p className="text-gray-500 mt-0.5">{fmtSize(detail.size)}{dims[detail.key] ? ` · ${dims[detail.key]!.width} × ${dims[detail.key]!.height} px` : ''}</p>
              <p className="text-gray-400 mt-0.5 break-all">{detail.key.replace(/^[^/]+\//, '')}</p>
              {check && (
                <p className={`mt-2 rounded px-2 py-1 ${check.level === 'ok' ? 'bg-brand-50 text-brand-800' : check.level === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>{check.message}</p>
              )}
              <div className="flex gap-1.5 mt-3">
                <button type="button" onClick={() => copyUrl(detail)} className="flex-1 h-7 inline-flex items-center justify-center gap-1 border border-gray-300 rounded hover:bg-gray-50">{copied === detail.key ? <Check size={11} /> : <Copy size={11} />} URL</button>
                {mode === 'manager' && canDelete && <button type="button" onClick={() => handleDelete(detail)} className="h-7 px-2 inline-flex items-center justify-center border border-red-200 text-red-600 rounded hover:bg-red-50"><Trash2 size={11} /></button>}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

function dedupe(list: MediaFile[]): MediaFile[] {
  const seen = new Set<string>();
  return list.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
}
function mergeFolders(a: Array<{ name: string; prefix: string }>, b: Array<{ name: string; prefix: string }>) {
  const seen = new Set(a.map((f) => f.prefix));
  return [...a, ...b.filter((f) => !seen.has(f.prefix))];
}

export default MediaLibraryBrowser;
