import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';

/**
 * Marketing templates with the mandatory approval workflow:
 * draft → pending approval → approved / rejected. Only APPROVED templates can
 * be attached to campaigns or automation rules.
 */
const CHANNELS = ['sms', 'whatsapp', 'email', 'push'] as const;

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

const MarketingTemplates: React.FC = () => {
  const { hasPerm } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [editing, setEditing] = useState<any>(null); // null | {} (new) | row
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    const r = await api.get('/marketing-hub/templates', { params: filterStatus ? { status: filterStatus } : {} });
    setRows(payload(r) ?? []);
  };
  useEffect(() => { load().catch(() => {}); }, [filterStatus]);

  const act = async (fn: () => Promise<any>) => {
    setError('');
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  /** Variables auto-detected live from {{placeholders}} in the body. */
  const detectedVars = Array.from(new Set(
    [...String(editing?.body ?? '').matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])
  ));

  const save = () => act(async () => {
    const body = {
      name: editing.name, channel: editing.channel ?? 'sms',
      subject: editing.subject || (['email', 'push'].includes(editing.channel) ? editing.name : undefined),
      body: editing.body, variables: detectedVars,
      provider_template_id: editing.provider_template_id || null,
    };
    if (editing.id) await api.put(`/marketing-hub/templates/${editing.id}`, body);
    else await api.post('/marketing-hub/templates', body);
    setEditing(null);
  });

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Templates</h1>
          <p className="text-sm text-gray-500">
            Every template must be <b>approved</b> before a campaign or automation can send it.
            Editing an approved template sends it back to draft.
          </p>
        </div>
        <div className="flex gap-2">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          {hasPerm('marketing.manage') && (
            <button disabled={syncing} onClick={async () => {
              setSyncing(true); setError(''); setInfo('');
              try {
                const r = await api.post('/marketing-hub/templates/sync-sms');
                setInfo(payload(r).message); await load();
              } catch (e: any) {
                setError(e?.response?.data?.data?.message ?? e?.response?.data?.message ?? e.message);
              } finally { setSyncing(false); }
            }} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              title="Auto-fetch DLT/approved SMS templates from the SMS panel (Settings → SMS/WhatsApp Templates)">
              {syncing ? 'Syncing…' : '⟳ Sync SMS panel'}
            </button>
          )}
          {hasPerm('marketing.manage') && (
            <button disabled={syncing} onClick={async () => {
              setSyncing(true); setError(''); setInfo('');
              try {
                const r = await api.post('/marketing-hub/templates/sync-whatsapp');
                setInfo(payload(r).message); await load();
              } catch (e: any) {
                setError(e?.response?.data?.data?.message ?? e?.response?.data?.message ?? e.message);
              } finally { setSyncing(false); }
            }} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              title="Auto-fetch your APPROVED WhatsApp templates from the WhatsApp platform">
              {syncing ? 'Syncing…' : '⟳ Sync WhatsApp'}
            </button>
          )}
          {hasPerm('marketing.manage') && (
            <button onClick={() => setEditing({ channel: 'sms', name: '', body: '' })}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              + Template
            </button>
          )}
        </div>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

      {editing && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Name
              <input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm">Channel
              <select value={editing.channel ?? 'sms'} disabled={!!editing.id}
                onChange={(e) => setEditing({ ...editing, channel: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5 capitalize">
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm">Provider template id (DLT / WhatsApp HSM)
              <input value={editing.provider_template_id ?? ''}
                onChange={(e) => setEditing({ ...editing, provider_template_id: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" placeholder="optional" />
            </label>
          </div>
          {(editing.channel === 'email' || editing.channel === 'push') && (
            <label className="block text-sm">{editing.channel === 'push' ? 'Push title' : 'Email subject'}
              <input value={editing.subject ?? ''} onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
          )}
          <label className="block text-sm">Body — variables: {'{{name}}'}, {'{{products}}'}, {'{{orderNumber}}'}, {'{{cartValue}}'}…
            <textarea rows={5} value={editing.body ?? ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-500">Detected variables (auto):</span>
            {detectedVars.length
              ? detectedVars.map((v) => <span key={v} className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-700">{'{{' + v + '}}'}</span>)
              : <span className="text-gray-400">none yet — type {'{{name}}'} style placeholders in the body</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!editing.name || !editing.body}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Save draft
            </button>
            <button onClick={() => setEditing(null)} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm divide-y">
        {rows.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No templates yet.</div>}
        {rows.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
            <div className="min-w-[220px] flex-1">
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs uppercase">{t.channel}</span>
              <span className={`ml-2 rounded px-1.5 py-0.5 text-xs capitalize ${STATUS_BADGE[t.status] ?? ''}`}>
                {t.status.replace('_', ' ')}
              </span>
              {t.rejected_reason && <span className="ml-2 text-xs text-red-500" title={t.rejected_reason}>reason ⓘ</span>}
              <div className="mt-0.5 truncate text-xs text-gray-400" title={t.body}>{t.body}</div>
            </div>
            <div className="flex gap-1.5">
              {hasPerm('marketing.manage') && ['draft', 'rejected'].includes(t.status) && (
                <>
                  <button onClick={() => setEditing(t)} className="rounded border px-2 py-1 text-xs">Edit</button>
                  <button onClick={() => act(() => api.post(`/marketing-hub/templates/${t.id}/submit`))}
                    className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white">
                    Submit for approval
                  </button>
                </>
              )}
              {hasPerm('marketing.approve') && t.status === 'pending_approval' && (
                <>
                  <button onClick={() => act(() => api.post(`/marketing-hub/templates/${t.id}/approve`))}
                    className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white">Approve</button>
                  <button onClick={() => {
                    const reason = rejectReason || window.prompt('Rejection reason?') || '';
                    if (reason) act(() => api.post(`/marketing-hub/templates/${t.id}/reject`, { reason }));
                    setRejectReason('');
                  }} className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">Reject</button>
                </>
              )}
              {hasPerm('marketing.manage') && t.status === 'approved' && (
                <button onClick={() => setEditing(t)} className="rounded border px-2 py-1 text-xs"
                  title="Editing sends it back to draft for re-approval">Edit (re-approval)</button>
              )}
              {hasPerm('marketing.manage') && (
                <button onClick={() => { if (window.confirm('Delete template?')) act(() => api.delete(`/marketing-hub/templates/${t.id}`)); }}
                  className="rounded border px-2 py-1 text-xs text-red-600">✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketingTemplates;
