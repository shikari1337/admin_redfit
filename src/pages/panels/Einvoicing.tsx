import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, Chip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
} from '../../components/erp';

/**
 * E-invoicing (IRP) — credentials + 30-day countdown worklist + generate-IRN.
 *
 * A document past the reporting window is permanently invalid for the buyer's
 * ITC, so nothing here should ever age past ~25 days. Live IRN submission
 * activates the moment IRP/GSP credentials are saved below; until then a
 * "Generate IRN" enqueues the submit and the document parks here visibly
 * (awaiting_credentials) — never fake-acked.
 */

const bandColor: Record<string, string> = {
  none: 'bg-gray-100 text-gray-700',
  notice: 'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
  blocked: 'bg-red-600 text-white',
};

interface CredStatus {
  configured: boolean; source: string | null; missing: string[];
  gstin: string; username: string; baseUrl: string; pathPrefix: string;
  environment: string; provider: string;
  passwordSet: boolean; clientSecretSet: boolean; publicKeySet: boolean; enabled: boolean;
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

const CredentialsCard: React.FC = () => {
  const [status, setStatus] = useState<CredStatus | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ status: string; message: string } | null>(null);
  const [msg, setMsg] = useState('');

  const load = () => api.get('/accounting/einvoice/credentials')
    .then((r) => {
      const s = payload<CredStatus>(r);
      setStatus(s);
      setEnabled(s.enabled);
      setForm({
        provider: s.provider || 'nic', gstin: s.gstin || '', username: s.username || '',
        baseUrl: s.baseUrl || '', pathPrefix: s.pathPrefix || '', environment: s.environment || 'sandbox',
        password: '', clientId: '', clientSecret: '', publicKey: '',
      });
    })
    .catch((e) => setMsg(e?.response?.data?.message ?? e.message));

  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await api.put('/accounting/einvoice/credentials', { ...form, enabled });
      setMsg('Saved.'); setTest(null);
      await load();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  const runTest = async () => {
    setTesting(true); setTest(null);
    try {
      const r = await api.post('/accounting/einvoice/credentials/test', {});
      setTest(payload(r));
    } catch (e: any) { setTest({ status: 'error', message: e?.response?.data?.message ?? e.message }); }
    finally { setTesting(false); }
  };

  const secretBadge = (label: string, isSet: boolean) => (
    <Chip tone={isSet ? 'green' : 'neutral'}>{label}: {isSet ? 'set' : 'not set'}</Chip>
  );

  return (
    <SectionCard
      title="IRP / GSP credentials"
      description="Your e-invoice API account (NIC direct or a GSP). Secrets are encrypted at rest and never shown again. Enter them once — IRN generation goes live immediately."
      action={status && (
        <Chip tone={status.configured ? 'green' : 'amber'}>
          {status.configured ? `Configured (${status.source})` : 'Not configured'}
        </Chip>
      )}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>GSTIN</label>
          <input className={inputCls} value={form.gstin ?? ''} onChange={set('gstin')} placeholder="29ABCDE1234F1Z5" />
        </div>
        <div>
          <label className={labelCls}>Environment</label>
          <select className={inputCls} value={form.environment ?? 'sandbox'} onChange={set('environment')}>
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>API username</label>
          <input className={inputCls} value={form.username ?? ''} onChange={set('username')} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls}>API password {status?.passwordSet && <span className="text-gray-400">(leave blank to keep)</span>}</label>
          <input className={inputCls} type="password" value={form.password ?? ''} onChange={set('password')} autoComplete="new-password" />
        </div>
        <div>
          <label className={labelCls}>Client ID (GSP)</label>
          <input className={inputCls} value={form.clientId ?? ''} onChange={set('clientId')} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls}>Client secret (GSP) {status?.clientSecretSet && <span className="text-gray-400">(leave blank to keep)</span>}</label>
          <input className={inputCls} type="password" value={form.clientSecret ?? ''} onChange={set('clientSecret')} autoComplete="new-password" />
        </div>
        <div>
          <label className={labelCls}>IRP / GSP base URL</label>
          <input className={inputCls} value={form.baseUrl ?? ''} onChange={set('baseUrl')} placeholder="https://einv-apisandbox.nic.in" />
        </div>
        <div>
          <label className={labelCls}>Auth path prefix (optional)</label>
          <input className={inputCls} value={form.pathPrefix ?? ''} onChange={set('pathPrefix')} placeholder="/eivital/v1.04" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>IRP public key (PEM / base64) {status?.publicKeySet && <span className="text-gray-400">(leave blank to keep)</span>}</label>
          <textarea className={`${inputCls} font-mono h-20`} value={form.publicKey ?? ''} onChange={set('publicKey')} placeholder="-----BEGIN PUBLIC KEY----- …" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {status && secretBadge('Password', status.passwordSet)}
        {status && secretBadge('Client secret', status.clientSecretSet)}
        {status && secretBadge('Public key', status.publicKeySet)}
        {status && !status.configured && status.missing.length > 0 && (
          <Chip tone="amber">Missing: {status.missing.join(', ')}</Chip>
        )}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable e-invoicing for this store
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save credentials'}</Btn>
        <Btn variant="outline" onClick={runTest} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Btn>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
        {test && (
          <Chip tone={test.status === 'connected' ? 'green' : test.status === 'awaiting_credentials' ? 'amber' : 'red'}>
            {test.status === 'connected' ? 'Connected' : test.status === 'awaiting_credentials' ? 'Awaiting credentials' : 'Error'}
            {test.message ? ` — ${test.message}` : ''}
          </Chip>
        )}
      </div>
    </SectionCard>
  );
};

const GenerateCard: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');

  const generate = async () => {
    if (!orderId.trim()) return;
    setBusy(true); setResult('');
    try {
      const r = await api.post('/accounting/einvoice/generate', { orderId: orderId.trim() });
      const d = payload<any>(r);
      const errs = (d.validations || []).filter((v: any) => v.level === 'error');
      setResult(
        `${d.queued ? 'Queued for IRP' : 'Already terminal'} — state: ${d.state}.`
        + (errs.length ? ` Blocking: ${errs.map((e: any) => e.message).join('; ')}` : '')
      );
      onDone();
    } catch (e: any) { setResult(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <SectionCard title="Generate IRN" description="Enter an order number or id to enqueue an IRP submission. It appears in the worklist below and is picked up by the outbox dispatcher.">
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-xs`} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order number or id" />
        <Btn variant="primary" onClick={generate} disabled={busy}>{busy ? 'Enqueuing…' : 'Generate IRN'}</Btn>
        {result && <span className="text-sm text-gray-600">{result}</span>}
      </div>
    </SectionCard>
  );
};

const Einvoicing: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string>('');

  const load = () => {
    setLoading(true);
    return api.get('/accounting/einvoice/worklist')
      .then((r) => setRows(payload(r) ?? []))
      .catch((e) => setError(e?.response?.data?.message ?? e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const retry = async (orderId: string) => {
    setRetrying(orderId);
    try { await api.post('/accounting/einvoice/generate', { orderId }); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setRetrying(''); }
  };

  return (
    <Page>
      <PageHeader
        title="E-invoicing (IRN)"
        description="Government IRP reporting — signed IRN + QR on every B2B tax invoice, exactly like the compliance leaders. Configure credentials, then generate. Documents past the 30-day window are permanently invalid for the buyer's ITC."
      />

      <CredentialsCard />
      <GenerateCard onDone={load} />

      <SectionCard title="Worklist" description="Pending documents (with their countdown) and generated IRNs." flush>
        {error && <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div>}
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Type</Th><Th>Number</Th><Th>Date</Th><Th>State</Th>
              <Th>IRN</Th><Th>Ack No.</Th><Th num>Days left</Th><Th>Escalation</Th><Th>Action</Th>
            </THead>
            <TBody>
              {loading && <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <EmptyRow colSpan={9}>Nothing yet — generate an IRN above, or every taxable document already has a terminal reporting state. ✔</EmptyRow>
              )}
              {rows.map((r: any) => (
                <Tr key={r.id}>
                  <Td className="capitalize">{String(r.document_type).replace('_', ' ')}</Td>
                  <Td className="font-mono">{r.document_number}</Td>
                  <Td>{r.document_date}</Td>
                  <Td className="capitalize">{String(r.state).replace('_', ' ')}</Td>
                  <Td className="font-mono text-xs">{r.irn ? `${String(r.irn).slice(0, 12)}…` : (r.has_qr ? 'QR ✓' : '—')}</Td>
                  <Td className="font-mono text-xs">{r.ack_no ?? '—'}</Td>
                  <Td num>{r.days_remaining ?? '—'}</Td>
                  <Td>
                    {r.escalation_level && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${bandColor[r.escalation_level] ?? ''}`}>
                        {r.escalation_level}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {r.state !== 'irn_received' && r.state !== 'report_not_required' && (
                      <button
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => retry(r.document_id)}
                        disabled={retrying === r.document_id}
                      >
                        {retrying === r.document_id ? '…' : 'Generate'}
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>
    </Page>
  );
};

export default Einvoicing;
