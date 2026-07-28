import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Folder, FolderPlus, Upload, Trash2, Download, FileText, Loader2, Home, ChevronRight,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, Btn, SectionCard, TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
} from '../../components/erp';

/**
 * Document Library — a Zoho Documents-style general file cabinet for the store's
 * business documents that are NOT tied to one transaction: agreements, licences,
 * statutory certificates, policy PDFs, scanned correspondence.
 *
 * Backend: routes/documentLibrary.ts (/documents), migration 100. Folders nest;
 * files are the leaves (root files sit at "All files"). Separate from generated
 * business documents (Sales Documents / Document Templates) and from record
 * attachments (the AttachmentPanel widget).
 */

interface FolderRow { id: string; name: string; parentId: string | null; fileCount: number; }
interface FileRow { id: string; folderId: string | null; fileName: string; contentType: string | null; sizeBytes: number; notes: string | null; createdAt: string; }

const fmtBytes = (n: number): string => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};
const fmtWhen = (d: string) => { try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };

const DocumentLibrary: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('content.manage');

  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // null = root ("All files")
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFolders = useCallback(async () => {
    try { setFolders(payload<FolderRow[]>(await api.get('/documents/folders')) ?? []); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true); setError('');
    try {
      const res = await api.get('/documents/files', { params: selected ? { folderId: selected } : {} });
      setFiles(payload<FileRow[]>(res) ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoadingFiles(false); }
  }, [selected]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadFiles(); }, [loadFiles]);

  // Build the parent→children map for the tree.
  const childrenOf = (parentId: string | null) => folders.filter((f) => f.parentId === parentId);

  const newFolder = async () => {
    const name = window.prompt(selected ? 'New sub-folder name:' : 'New folder name:');
    if (!name || !name.trim()) return;
    setError('');
    try {
      await api.post('/documents/folders', { name: name.trim(), parentId: selected });
      await loadFolders();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const renameFolder = async (f: FolderRow) => {
    const name = window.prompt('Rename folder:', f.name);
    if (!name || !name.trim() || name.trim() === f.name) return;
    setError('');
    try { await api.put(`/documents/folders/${f.id}`, { name: name.trim() }); await loadFolders(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const deleteFolder = async (f: FolderRow) => {
    if (!window.confirm(`Delete folder "${f.name}"? Sub-folders are removed; files inside move to All files.`)) return;
    setError('');
    try {
      await api.delete(`/documents/folders/${f.id}`);
      if (selected === f.id) setSelected(null);
      await loadFolders(); await loadFiles();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await upload(file);
    if (fileRef.current) fileRef.current.value = '';
  };
  const upload = async (file: File) => {
    setUploading(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (selected) form.append('folderId', selected);
      await api.post('/documents/files', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadFiles(); await loadFolders();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setUploading(false); }
  };

  const download = async (id: string) => {
    setError('');
    try {
      const url = payload<{ url: string }>(await api.get(`/documents/files/${id}/url`))?.url;
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const removeFile = async (f: FileRow) => {
    if (!window.confirm(`Delete "${f.fileName}"? This permanently removes the file.`)) return;
    setError('');
    try { await api.delete(`/documents/files/${f.id}`); await loadFiles(); await loadFolders(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const selectedName = selected ? (folders.find((f) => f.id === selected)?.name ?? 'Folder') : 'All files';

  // Recursive tree node.
  const TreeNode: React.FC<{ folder: FolderRow; depth: number }> = ({ folder, depth }) => {
    const kids = childrenOf(folder.id);
    const active = selected === folder.id;
    return (
      <div>
        <div
          className={`group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm ${active ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => setSelected(folder.id)}
        >
          <Folder className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className={`text-xs ${active ? 'text-gray-300' : 'text-gray-400'}`}>{folder.fileCount || ''}</span>
          {canManage && (
            <span className={`hidden shrink-0 gap-1 group-hover:flex ${active ? 'text-gray-200' : 'text-gray-400'}`}>
              <button title="Rename" onClick={(e) => { e.stopPropagation(); renameFolder(folder); }} className="hover:text-current">✎</button>
              <button title="Delete" onClick={(e) => { e.stopPropagation(); deleteFolder(folder); }} className="hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </span>
          )}
        </div>
        {kids.map((k) => <TreeNode key={k.id} folder={k} depth={depth + 1} />)}
      </div>
    );
  };

  return (
    <Page>
      <PageHeader
        title="Document Library"
        description="Your store's file cabinet — agreements, licences, certificates and scanned documents, organised in folders. Separate from generated invoices and record attachments."
        actions={canManage && (
          <div className="flex gap-2">
            <Btn variant="outline" onClick={newFolder}><FolderPlus className="mr-1 h-4 w-4" /> New folder</Btn>
            <>
              <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
              <Btn onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="mr-1 h-4 w-4" /> Upload file</>}
              </Btn>
            </>
          </div>
        )}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Folder tree */}
        <SectionCard title="Folders" bodyClassName="p-2">
          <div
            className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm ${selected === null ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setSelected(null)}
          >
            <Home className={`h-4 w-4 ${selected === null ? 'text-white' : 'text-gray-400'}`} />
            <span className="flex-1">All files</span>
          </div>
          {childrenOf(null).map((f) => <TreeNode key={f.id} folder={f} depth={0} />)}
          {folders.length === 0 && <p className="px-2 py-4 text-center text-xs text-gray-400">No folders yet.</p>}
        </SectionCard>

        {/* File grid */}
        <SectionCard
          flush
          title={<span className="inline-flex items-center gap-1.5 text-sm text-gray-500"><Home className="h-4 w-4" /><ChevronRight className="h-3.5 w-3.5" /><span className="font-semibold text-gray-900">{selectedName}</span></span>}
        >
          <TableShell maxHeight="60vh">
            <table className="w-full text-sm">
              <THead>
                <Th>Name</Th><Th num>Size</Th><Th>Added</Th><Th num>Actions</Th>
              </THead>
              <TBody>
                {loadingFiles && <EmptyRow colSpan={4}>Loading…</EmptyRow>}
                {!loadingFiles && files.length === 0 && <EmptyRow colSpan={4}>No files in this folder yet.</EmptyRow>}
                {!loadingFiles && files.map((f) => (
                  <Tr key={f.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-900" title={f.fileName}>{f.fileName}</span>
                          {f.notes && <span className="block truncate text-xs text-gray-500" title={f.notes}>{f.notes}</span>}
                        </span>
                      </div>
                    </Td>
                    <Td num>{fmtBytes(f.sizeBytes)}</Td>
                    <Td>{fmtWhen(f.createdAt)}</Td>
                    <Td num>
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => download(f.id)} title="Download" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"><Download className="h-4 w-4" /></button>
                        {canManage && <button onClick={() => removeFile(f)} title="Delete" className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </SectionCard>
      </div>
    </Page>
  );
};

export default DocumentLibrary;
