import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, Btn, Field, SelectInput, TextInput, StatusChip, EmptyState,
  ExportMenu, type CsvColumn,
} from '../../components/erp';

/**
 * Scheduled Reports — "Email me a report on a schedule, without logging in."
 *
 * A plain-language sentence-builder: "Email me the [GST 3B summary] as a [PDF]
 * every [month] on day [5] to [a@b.com]". The report is generated server-side
 * (the SAME numbers the on-screen report shows), stored, and a download link is
 * emailed to the recipients on the chosen cadence. "Send now" runs the current
 * period immediately; "Preview" downloads the file straight to your browser.
 *
 * Sends go through the platform messaging layer as an operational cost (never
 * charged to your wallet). Each period is sent at most once.
 */

type Cadence = 'daily' | 'weekly' | 'monthly';
type Format = 'pdf' | 'csv';

interface ReportInfo { key: string; label: string; what: string; windowKind: string; }
interface Schedule {
  id: string; name: string | null; report_key: string; format: Format; cadence: Cadence;
  day_of_week: number | null; day_of_month: number | null; recipients: string[];
  time_of_day: string; active: boolean; last_run_at: string | null;
}
interface Run {
  id: string; schedule_id: string; report_key: string; format: string; period_key: string;
  period_from: string | null; period_to: string | null; status: string; item_count: number;
  recipients: string[]; detail: string | null; error: string | null; ran_at: string | null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CADENCE_WORD: Record<Cadence, string> = { daily: 'day', weekly: 'week', monthly: 'month' };
const fmtWhen = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');
const toneFor = (status: string) =>
  status === 'sent' ? 'green' : status === 'failed' ? 'red' : status === 'pending' ? 'amber' : 'neutral';

async function downloadBlob(path: string, params: Record<string, any>, fallbackName: string) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data as any]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const emptyForm = () => ({
  id: '' as string, name: '', report_key: 'sales_summary', format: 'pdf' as Format,
  cadence: 'monthly' as Cadence, day_of_week: 1, day_of_month: 1,
  recipients: '', time_of_day: '08:00', active: true,
});

const ReportSchedules: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post'); // reads=accounting.read; writes=accounting.post
  const [tab, setTab] = useState<'schedules' | 'history'>('schedules');
  const [catalogue, setCatalogue] = useState<ReportInfo[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };
  const fail = (e: any) => setError(e?.response?.data?.message ?? e?.message ?? 'Something went wrong');

  const loadAll = async () => {
    try {
      const [cat, sch, run] = await Promise.all([
        api.get('/report-schedules/reports'),
        api.get('/report-schedules'),
        api.get('/report-schedules/runs', { params: { limit: 100 } }),
      ]);
      setCatalogue(payload<any>(cat)?.data ?? payload<ReportInfo[]>(cat) ?? []);
      setSchedules(payload<Schedule[]>(sch) ?? []);
      setRuns(payload<Run[]>(run) ?? []);
    } catch (e) { fail(e); }
  };
  useEffect(() => { loadAll(); }, []);

  const selectedReport = catalogue.find((r) => r.key === form.report_key);
  const set = (patch: Partial<ReturnType<typeof emptyForm>>) => setForm((f) => ({ ...f, ...patch }));

  const startEdit = (s: Schedule) => {
    setForm({
      id: s.id, name: s.name ?? '', report_key: s.report_key, format: s.format, cadence: s.cadence,
      day_of_week: s.day_of_week ?? 1, day_of_month: s.day_of_month ?? 1,
      recipients: (s.recipients ?? []).join(', '), time_of_day: s.time_of_day, active: s.active,
    });
    setTab('schedules');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim() || null, report_key: form.report_key, format: form.format,
        cadence: form.cadence, recipients: form.recipients, time_of_day: form.time_of_day, active: form.active,
      };
      if (form.cadence === 'weekly') body.day_of_week = form.day_of_week;
      if (form.cadence === 'monthly') body.day_of_month = form.day_of_month;
      if (form.id) await api.put(`/report-schedules/${form.id}`, body);
      else await api.post('/report-schedules', body);
      setForm(emptyForm());
      flash(form.id ? 'Schedule updated.' : 'Schedule created.');
      loadAll();
    } catch (e) { fail(e); }
    finally { setSaving(false); }
  };

  const remove = async (s: Schedule) => {
    if (!window.confirm(`Delete this ${labelOf(s.report_key)} schedule?`)) return;
    setBusyId(s.id);
    try { await api.delete(`/report-schedules/${s.id}`); flash('Schedule deleted.'); loadAll(); }
    catch (e) { fail(e); } finally { setBusyId(''); }
  };

  const runNow = async (s: Schedule) => {
    setBusyId(s.id);
    setError('');
    try {
      const res = await api.post(`/report-schedules/${s.id}/run-now`, {});
      const r = payload<any>(res);
      flash(r?.status === 'sent' ? `Sent ${labelOf(s.report_key)} to ${s.recipients.join(', ') || 'recipients'}.`
        : r?.status === 'skipped' ? `Already sent for this period (${r.periodKey}).`
        : `Could not send: ${r?.detail ?? r?.status}`);
      loadAll();
    } catch (e) { fail(e); } finally { setBusyId(''); }
  };

  const preview = async (reportKey: string, format: Format) => {
    setError('');
    try {
      await downloadBlob('/report-schedules/preview', { reportKey, format }, `${reportKey}.${format}`);
    } catch (e) { fail(e); }
  };

  const labelOf = (key: string) => catalogue.find((r) => r.key === key)?.label ?? key;

  const runCols: CsvColumn<Run>[] = [
    { key: 'report_key', label: 'Report', format: (r) => labelOf(r.report_key) },
    { key: 'period_key', label: 'Period' },
    { key: 'status', label: 'Status' },
    { key: 'item_count', label: 'Rows' },
    { key: 'recipients', label: 'Sent to', format: (r) => (r.recipients ?? []).join('; ') },
    { key: 'ran_at', label: 'When', format: (r) => fmtWhen(r.ran_at) },
    { key: 'detail', label: 'Detail', format: (r) => r.error || r.detail || '' },
  ];

  return (
    <Page>
      <PageHeader
        title="Scheduled Reports"
        description="Have your sales, GST, trial balance, low-stock and receivables reports emailed to you automatically — daily, weekly or monthly — as a PDF or CSV, without logging in."
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      <div className="flex gap-1 border-b border-gray-200">
        {([['schedules', 'Schedules'], ['history', 'Delivery history']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'schedules' && (
        <div className="space-y-4">
          {/* ── Sentence-builder ─────────────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-gray-800">{form.id ? 'Edit this schedule' : 'Add a scheduled report'}</div>
            <div className="flex flex-wrap items-end gap-2 text-sm text-gray-600">
              <span className="pb-2">Email me the</span>
              <Field>
                <SelectInput value={form.report_key} onChange={(e) => set({ report_key: e.target.value })}>
                  {catalogue.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </SelectInput>
              </Field>
              <span className="pb-2">as a</span>
              <Field>
                <SelectInput value={form.format} onChange={(e) => set({ format: e.target.value as Format })}>
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV (spreadsheet)</option>
                </SelectInput>
              </Field>
              <span className="pb-2">every</span>
              <Field>
                <SelectInput value={form.cadence} onChange={(e) => set({ cadence: e.target.value as Cadence })}>
                  <option value="daily">day</option>
                  <option value="weekly">week</option>
                  <option value="monthly">month</option>
                </SelectInput>
              </Field>
              {form.cadence === 'weekly' && (
                <>
                  <span className="pb-2">on</span>
                  <Field>
                    <SelectInput value={form.day_of_week} onChange={(e) => set({ day_of_week: Number(e.target.value) })}>
                      {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </SelectInput>
                  </Field>
                </>
              )}
              {form.cadence === 'monthly' && (
                <>
                  <span className="pb-2">on day</span>
                  <Field>
                    <TextInput type="number" min={1} max={31} value={form.day_of_month}
                      onChange={(e) => set({ day_of_month: Number(e.target.value) })} className="w-20" />
                  </Field>
                </>
              )}
              <span className="pb-2">at</span>
              <Field>
                <TextInput type="time" value={form.time_of_day} onChange={(e) => set({ time_of_day: e.target.value })} className="w-28" />
              </Field>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Send to (comma-separated emails)" className="min-w-[280px] flex-1">
                <TextInput value={form.recipients} placeholder="owner@shop.com, accountant@shop.com"
                  onChange={(e) => set({ recipients: e.target.value })} />
              </Field>
              <Field label="Name (optional)" className="min-w-[160px]">
                <TextInput value={form.name} placeholder="e.g. Monday sales" onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4" />
                On
              </label>
            </div>

            {selectedReport && <p className="mt-2 text-xs text-gray-500">{selectedReport.what}</p>}
            <p className="mt-1 text-xs text-gray-400">
              A {CADENCE_WORD[form.cadence]}ly report covers the most recent complete {CADENCE_WORD[form.cadence]}. The email carries a download link that opens the file without logging in.
            </p>

            <div className="mt-3 flex items-center gap-2">
              {canPost && <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : form.id ? 'Update schedule' : 'Create schedule'}</Btn>}
              {canPost && form.id && <Btn variant="ghost" onClick={() => setForm(emptyForm())}>Cancel edit</Btn>}
              <Btn variant="outline" onClick={() => preview(form.report_key, form.format)}>Preview download</Btn>
              {!canPost && <span className="text-xs text-gray-400">You can preview reports; scheduling needs the <code className="font-mono">accounting.post</code> permission.</span>}
            </div>
          </div>

          {/* ── Existing schedules ───────────────────────────────────────────── */}
          {schedules.length === 0 ? (
            <EmptyState title="No scheduled reports yet" description="Build one above — pick a report, a cadence and who to email." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Report</th>
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">Format</th>
                    <th className="px-4 py-2">Recipients</th>
                    <th className="px-4 py-2">Last sent</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schedules.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">{labelOf(s.report_key)}</div>
                        {s.name && <div className="text-xs text-gray-500">{s.name}</div>}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{describeWhen(s)}</td>
                      <td className="px-4 py-2 uppercase text-gray-600">{s.format}</td>
                      <td className="px-4 py-2 text-gray-600">{s.recipients.join(', ') || <span className="text-amber-600">none</span>}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtWhen(s.last_run_at)}</td>
                      <td className="px-4 py-2">
                        <StatusChip status={s.active ? 'active' : 'inactive'} label={s.active ? 'On' : 'Off'} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Btn variant="outline" size="sm" onClick={() => preview(s.report_key, s.format)}>Preview</Btn>
                          {canPost && <Btn variant="success" size="sm" onClick={() => runNow(s)} disabled={busyId === s.id}>{busyId === s.id ? '…' : 'Send now'}</Btn>}
                          {canPost && <Btn variant="ghost" size="sm" onClick={() => startEdit(s)}>Edit</Btn>}
                          {canPost && <Btn variant="ghost" size="sm" className="text-red-600" onClick={() => remove(s)} disabled={busyId === s.id}>Delete</Btn>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <ExportMenu filename="report-delivery-history" columns={runCols} rows={runs} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          {runs.length === 0 ? (
            <div className="p-6"><EmptyState title="Nothing sent yet" description="Runs will appear here once a schedule fires or you use Send now." /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Report</th>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Rows</th>
                  <th className="px-4 py-2">Sent to</th>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 font-medium text-gray-900">{labelOf(r.report_key)}</td>
                    <td className="px-4 py-2 text-gray-600">{r.period_key}</td>
                    <td className="px-4 py-2"><StatusChip status={r.status} tone={toneFor(r.status)} /></td>
                    <td className="px-4 py-2 text-right text-gray-600">{r.item_count}</td>
                    <td className="px-4 py-2 text-gray-600">{r.recipients.join(', ') || '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{fmtWhen(r.ran_at)}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.error || r.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>
      )}
    </Page>
  );
};

function describeWhen(s: Schedule): string {
  if (s.cadence === 'daily') return `Every day at ${s.time_of_day}`;
  if (s.cadence === 'weekly') return `Every ${WEEKDAYS[s.day_of_week ?? 1]} at ${s.time_of_day}`;
  return `Day ${s.day_of_month ?? 1} of each month at ${s.time_of_day}`;
}

export default ReportSchedules;
