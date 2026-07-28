import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Upload, Trash2, Download, Loader2, FileText } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import { SectionCard } from './Card';
import { Btn } from './Button';

/**
 * AttachmentPanel — the ONE reusable widget for polymorphic attachments
 * (backend routes/attachments.ts, migration 099).
 *
 * Drop it into any record's detail screen:
 *
 *     <AttachmentPanel entityType="expense" entityId={id} />
 *
 * It lists the files hung off that record (name, size, uploaded-when), offers an
 * upload button, a per-file download (via a short-lived signed URL) and a delete.
 * It is DELIBERATELY self-contained — owns its own load / upload / delete / error
 * state — so a host page needs no new state or submit logic.
 *
 * Write actions (upload / delete) are hidden when the caller lacks the entity's
 * write permission; the backend enforces the same map, so the UI only mirrors it.
 * When entityId is empty (an unsaved record) the card explains it needs saving first.
 */

type PermAction = 'read' | 'write';
// Mirror of backend ENTITY_PERMS (routes/attachments.ts) — UI gate only.
const ENTITY_PERMS: Record<string, { read: string; write: string }> = {
  expense: { read: 'accounting.read', write: 'accounting.post' },
  vendor_bill: { read: 'accounting.read', write: 'accounting.post' },
  bill: { read: 'accounting.read', write: 'accounting.post' },
  journal: { read: 'accounting.read', write: 'accounting.post' },
  payment: { read: 'accounting.read', write: 'accounting.post' },
  purchase_order: { read: 'purchasing.read', write: 'purchasing.manage' },
  po: { read: 'purchasing.read', write: 'purchasing.manage' },
  grn: { read: 'purchasing.read', write: 'purchasing.receive' },
  order: { read: 'orders.read', write: 'orders.manage' },
  shipment: { read: 'shipments.read', write: 'shipments.manage' },
  product: { read: 'products.read', write: 'products.manage' },
  customer: { read: 'customers.read', write: 'customers.manage' },
};
const DEFAULT_PERMS = { read: 'content.read', write: 'content.manage' };
const permFor = (entityType: string, action: PermAction) =>
  (ENTITY_PERMS[entityType] ?? DEFAULT_PERMS)[action];

interface AttachmentRow {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number;
  createdAt: string;
}

const fmtBytes = (n: number): string => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};
const fmtWhen = (d: string) => { try { return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };

export const AttachmentPanel: React.FC<{
  entityType: string;
  /** The record's UUID. Empty/undefined → the card explains it needs saving first. */
  entityId?: string;
  title?: string;
  description?: string;
  className?: string;
}> = ({ entityType, entityId, title = 'Attachments', description, className }) => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(permFor(entityType, 'write') as any);

  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!entityId) { setRows([]); return; }
    setLoading(true); setError('');
    try {
      const res = await api.get(`/attachments/${entityType}/${entityId}`);
      setRows(payload<AttachmentRow[]>(res) ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await upload(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = async (file: File) => {
    if (!entityId) return;
    setUploading(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/attachments/${entityType}/${entityId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setUploading(false); }
  };

  const download = async (id: string) => {
    setError('');
    try {
      const res = await api.get(`/attachments/item/${id}/url`);
      const url = payload<{ url: string }>(res)?.url;
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This permanently removes the file.`)) return;
    setError('');
    try { await api.delete(`/attachments/item/${id}`); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><Paperclip className="h-4 w-4 text-gray-500" />{title}</span>}
      description={description ?? 'Receipts, PDFs and supporting files for this record.'}
      className={className}
      action={canManage && entityId ? (
        <>
          <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
          <Btn variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="mr-1 h-4 w-4" /> Upload file</>}
          </Btn>
        </>
      ) : undefined}
    >
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!entityId ? (
        <p className="py-6 text-center text-sm text-gray-400">Save this record first to attach files.</p>
      ) : loading ? (
        <p className="py-6 text-center text-sm text-gray-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No files attached yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <FileText className="h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900" title={r.fileName}>{r.fileName}</div>
                <div className="text-xs text-gray-500">{fmtBytes(r.sizeBytes)} · {fmtWhen(r.createdAt)}</div>
              </div>
              <button onClick={() => download(r.id)} title="Download"
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                <Download className="h-4 w-4" />
              </button>
              {canManage && (
                <button onClick={() => remove(r.id, r.fileName)} title="Delete"
                  className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
};

export default AttachmentPanel;
