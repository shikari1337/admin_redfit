import React, { useEffect, useState } from 'react';
import { Lock, CalendarCheck2, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import { formatDate } from '../../utils/date';
import {
  Page, PageHeader, SectionCard, Btn, Field, TextInput, ExportMenu,
  type CsvColumn,
} from '../../components/erp';

/** Accounting configuration: GL auto-posting, books lock + year-end close, series counters + statutory registry. */

interface PeriodLock { id: string; lockedUpTo: string; lockedBy: string | null; lockedAt: string; note: string | null; }
interface SeriesRow { doc_type: string; series_code: string; fy: string; prefix: string; next_number: string; }
interface StatutoryRule {
  rule_code: string; value_json: unknown; effective_from: string; effective_to: string | null;
  source_reference: string; verification_state: string; verified_by: string | null;
}

/** Local YYYY-MM-DD (never toISOString — that would shift the day in IST). */
const localDate = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The most recent 31-March that has already passed (Indian FY end). */
const defaultFyEnd = (): string => {
  const today = new Date();
  const y = today.getFullYear();
  const march31 = new Date(y, 2, 31);
  return `${today >= march31 ? y : y - 1}-03-31`;
};

const seriesCols: CsvColumn<SeriesRow>[] = [
  { key: 'doc_type', label: 'Type' },
  { key: 'series_code', label: 'Series' },
  { key: 'fy', label: 'FY' },
  { key: 'prefix', label: 'Prefix' },
  { key: 'next_number', label: 'Next number' },
];
const ruleCols: CsvColumn<StatutoryRule>[] = [
  { key: 'rule_code', label: 'Rule' },
  { key: 'value_json', label: 'Value', format: (r) => JSON.stringify(r.value_json) },
  { key: 'effective_from', label: 'Effective from' },
  { key: 'effective_to', label: 'Effective to', format: (r) => r.effective_to ?? 'open' },
  { key: 'source_reference', label: 'Source' },
  { key: 'verification_state', label: 'Verified', format: (r) => `${r.verification_state}${r.verified_by ? ' · CA' : ''}` },
];

const AccountingSettings: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const canReadGst = hasPerm('gst.read');

  const [glAutoPosting, setGl] = useState(false);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [rules, setRules] = useState<StatutoryRule[]>([]);
  const [lock, setLock] = useState<PeriodLock | null>(null);
  const [saving, setSaving] = useState(false);

  const [lockDate, setLockDate] = useState(localDate());
  const [lockNote, setLockNote] = useState('');
  const [lockBusy, setLockBusy] = useState(false);

  const [fyEnd, setFyEnd] = useState(defaultFyEnd());
  const [closeBusy, setCloseBusy] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const flash = (m: string) => { setNotice(m); setError(''); };
  const fail = (e: any) => setError(e?.response?.data?.message ?? e?.message ?? 'Something went wrong.');

  const loadLock = () =>
    api.get('/accounting/period-lock').then((r) => setLock(payload<PeriodLock | null>(r) ?? null)).catch(() => {});

  useEffect(() => {
    api.get('/accounting/config').then((r) => setGl(payload<any>(r)?.glAutoPosting === true)).catch(() => {});
    api.get('/accounting/series').then((r) => setSeries(payload<SeriesRow[]>(r) ?? [])).catch(() => {});
    api.get('/accounting/statutory-rules').then((r) => setRules(payload<StatutoryRule[]>(r) ?? [])).catch(() => {});
    loadLock();
  }, []);

  const toggle = async () => {
    setSaving(true); setError('');
    try {
      const next = !glAutoPosting;
      await api.put('/accounting/config', { glAutoPosting: next });
      setGl(next);
      flash(next ? 'GL auto-posting is ON — new documents post to the books.' : 'GL auto-posting is OFF.');
    } catch (e) { fail(e); } finally { setSaving(false); }
  };

  const lockBooks = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lockDate)) { setError('Pick a valid lock date.'); return; }
    if (!window.confirm(
      `Lock the books up to and including ${lockDate}? No journal may then post on or before that date. This is meant for after your CA signs off.`,
    )) return;
    setLockBusy(true); setError('');
    try {
      const saved = payload<PeriodLock>(await api.post('/accounting/period-lock', { date: lockDate, note: lockNote.trim() || undefined }));
      setLock(saved ?? null);
      setLockNote('');
      flash(`Books locked up to ${lockDate}.`);
    } catch (e) { fail(e); } finally { setLockBusy(false); }
  };

  const closeYear = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fyEnd)) { setError('Pick a valid financial-year end date.'); return; }
    if (!window.confirm(
      `Post the year-end closing entry as of ${fyEnd}? This moves every income & expense balance into Retained Earnings in one balanced journal. It is idempotent — a second run for the same date does nothing.`,
    )) return;
    setCloseBusy(true); setError('');
    try {
      const result = payload<any>(await api.post('/accounting/year-end-close', { fyEnd }));
      flash(result?.message ?? `Year-end close processed for ${fyEnd}.`);
      await loadLock();
    } catch (e) { fail(e); } finally { setCloseBusy(false); }
  };

  return (
    <Page>
      <PageHeader
        title="Accounting Settings"
        description="Configuration, the books lock and year-end close, series counters and the statutory rules this store runs on."
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      {/* GL auto-posting */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-gray-900">GL auto-posting</div>
            <div className="text-sm text-gray-500">
              Posts sale, COGS, GRN and bill journals automatically. Keep OFF until the account
              mapping has been reviewed by your CA — books are immutable once posted.
            </div>
          </div>
          <button onClick={toggle} disabled={!canPost || saving}
            className={`shrink-0 rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${glAutoPosting ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            {glAutoPosting ? 'ON — posting to books' : 'OFF'}
          </button>
        </div>
        {!canPost && <p className="mt-2 text-xs text-gray-400">Changing this needs the <code className="font-mono">accounting.post</code> permission.</p>}
      </div>

      {/* Books lock + year-end close */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={<span className="inline-flex items-center gap-2"><Lock className="h-4 w-4 text-gray-500" />Books lock (close the period)</span>}
          description="Once locked, no journal may post on or before the lock date — the 'no back-dated edits after sign-off' control."
        >
          {lock ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Books are locked up to <span className="font-semibold">{lock.lockedUpTo}</span>.
              <span className="text-amber-600"> Locked {formatDate(lock.lockedAt, 'dd MMM yyyy')}{lock.note ? ` · ${lock.note}` : ''}.</span>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">The books are currently open — no lock is set.</div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Lock up to (inclusive)">
              <TextInput type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} className="w-44" disabled={!canPost} />
            </Field>
            <Field label="Note (optional)" className="min-w-[12rem] flex-1">
              <TextInput value={lockNote} placeholder="e.g. FY23-24 signed off" onChange={(e) => setLockNote(e.target.value)} disabled={!canPost} />
            </Field>
            <Btn variant="primary" onClick={lockBooks} disabled={!canPost || lockBusy}>
              {lockBusy ? 'Locking…' : 'Lock books'}
            </Btn>
          </div>
          {!canPost && <p className="mt-2 text-xs text-gray-400">Locking needs the <code className="font-mono">accounting.post</code> permission.</p>}
        </SectionCard>

        <SectionCard
          title={<span className="inline-flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-gray-500" />Year-end close</span>}
          description="Post one balanced journal that moves every income & expense balance into Retained Earnings. Idempotent per financial-year end. Close BEFORE you lock."
        >
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Financial-year end">
              <TextInput type="date" value={fyEnd} onChange={(e) => setFyEnd(e.target.value)} className="w-44" disabled={!canPost} />
            </Field>
            <Btn variant="success" onClick={closeYear} disabled={!canPost || closeBusy}>
              {closeBusy ? 'Closing…' : 'Post closing entry'}
            </Btn>
          </div>
          {!canPost && <p className="mt-2 text-xs text-gray-400">Closing the year needs the <code className="font-mono">accounting.post</code> permission.</p>}
        </SectionCard>
      </div>

      {/* Document series */}
      <SectionCard
        title="Document series (gapless, per financial year)"
        flush
        action={<ExportMenu filename="document-series" columns={seriesCols} rows={series} canExport={hasPerm('accounting.read')} />}
      >
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <tr><th className="px-4 py-2">Type</th><th className="px-4 py-2">Series</th><th className="px-4 py-2">FY</th>
                <th className="px-4 py-2">Prefix</th><th className="px-4 py-2 text-right">Next number</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {series.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500">No series allocated yet — the first document of each type creates its own.</td></tr>}
            {series.map((s) => (
              <tr key={`${s.doc_type}-${s.series_code}-${s.fy}`}>
                <td className="px-4 py-1.5 capitalize">{String(s.doc_type).replace('_', ' ')}</td>
                <td className="px-4 py-1.5 font-mono">{s.series_code}</td>
                <td className="px-4 py-1.5 font-mono">{s.fy}</td>
                <td className="px-4 py-1.5 font-mono">{s.prefix}</td>
                <td className="px-4 py-1.5 text-right font-mono">{s.next_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* Statutory rules registry */}
      <SectionCard
        title={<span>Statutory rules registry <span className="ml-2 text-xs font-normal text-gray-500">every tax value is dated + cited; nothing hardcoded</span></span>}
        flush
        action={<ExportMenu filename="statutory-rules" columns={ruleCols} rows={rules} canExport={canReadGst} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr><th className="px-4 py-2">Rule</th><th className="px-4 py-2">Value</th><th className="px-4 py-2">Effective</th>
                  <th className="px-4 py-2">Source</th><th className="px-4 py-2">Verified</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500">No statutory rules visible (needs the gst.read permission).</td></tr>}
              {rules.map((r, i) => (
                <tr key={i} className={r.effective_to ? 'text-gray-400' : ''}>
                  <td className="px-4 py-1.5 font-mono text-xs">{r.rule_code}</td>
                  <td className="px-4 py-1.5 font-mono text-xs max-w-[260px] truncate" title={JSON.stringify(r.value_json)}>{JSON.stringify(r.value_json)}</td>
                  <td className="px-4 py-1.5 whitespace-nowrap">{r.effective_from} → {r.effective_to ?? 'open'}</td>
                  <td className="px-4 py-1.5 max-w-[280px] truncate" title={r.source_reference}>{r.source_reference}</td>
                  <td className="px-4 py-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.verification_state === 'T1' ? 'bg-emerald-100 text-emerald-800' : r.verification_state === 'T2' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                      {r.verification_state}{r.verified_by ? ' · CA' : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </Page>
  );
};

export default AccountingSettings;
