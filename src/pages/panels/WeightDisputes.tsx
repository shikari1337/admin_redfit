import React, { useEffect, useRef, useState } from 'react';
import {
  Scale, Plus, Loader2, X, CheckCircle2, ShieldAlert, Camera, Clock,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput, SelectInput,
  StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip,
} from '../../components/erp';

/**
 * Courier weight disputes (migration 078). Plain-language screen:
 * "The courier billed my 200 g parcel as 900 g and charged ₹120 extra."
 *
 * Upload the courier's weight report (or type in a charge), we compare what they
 * billed against what you declared — including the volumetric weight they are
 * fairly allowed to charge — and put the unfair ones in front of you with a
 * countdown to the objection deadline. Then you either accept the charge or
 * fight it with evidence.
 */

const inr = (minor: any) => {
  const n = Number(minor);
  return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
};
const grams = (g: any) => {
  const n = Number(g);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${n} g`;
};
const pct = (milli: any) => {
  const n = Number(milli);
  return Number.isFinite(n) ? `${(n / 1000).toFixed(1)}%` : '—';
};

interface Dispute {
  id: string; awb: string | null; courier: string | null; order_number?: string | null;
  declared_weight_g: number; volumetric_weight_g: number; billed_weight_g: number;
  chargeable_declared_g: number; excess_weight_g: number; excess_pct_milli: number;
  declared_cost_minor: string; billed_cost_minor: string; excess_minor: string;
  refund_expected_minor: string;
  status: string; dispute_window_ends_at: string | null; days_left: number | null;
  billed_on: string | null; courier_ref: string | null; source: string;
  evidence: any[]; timeline: any[]; note: string | null; resolution_note: string | null;
  declared_dims: any; created_at: string;
}

interface CourierStats {
  courier: string; disputes: number; open: number; disputing: number; won: number; lost: number;
  accepted: number; expired: number; atStakeMinor: string; recoveredMinor: string;
  writtenOffMinor: string; avgExcessMinor: string; winRatePct: number | null; avgExcessPct: number;
}
interface Summary {
  totals: {
    disputes: number; open: number; disputing: number; won: number; lost: number;
    accepted: number; expired: number;
    atStakeMinor: string; recoveredMinor: string; writtenOffMinor: string;
    avgExcessMinor: string; winRatePct: number | null; closingSoon: number; overdueUnacted: number;
  };
  byCourier: CourierStats[];
}

const STATUS_TONE: Record<string, any> = {
  open: 'amber', disputing: 'blue', won: 'green', lost: 'red', accepted: 'neutral', expired: 'red',
};
const STATUS_LABEL: Record<string, string> = {
  open: 'Needs a decision',
  disputing: 'Fighting it',
  won: 'Courier refunded',
  lost: 'Courier said no',
  accepted: 'Charge accepted',
  expired: 'Too late — window closed',
};

const STATUS_FILTERS = [
  { v: '', label: 'All disputes' },
  { v: 'open', label: 'Needs a decision' },
  { v: 'disputing', label: 'Fighting it' },
  { v: 'won', label: 'Courier refunded' },
  { v: 'lost', label: 'Courier said no' },
  { v: 'accepted', label: 'Charge accepted' },
  { v: 'expired', label: 'Window closed' },
];

/** The countdown a merchant actually reads. */
const Countdown: React.FC<{ d: Dispute }> = ({ d }) => {
  if (!['open', 'disputing'].includes(d.status)) return <span className="text-xs text-gray-400">—</span>;
  const days = Number(d.days_left);
  if (!Number.isFinite(days)) return <span className="text-xs text-gray-400">no deadline</span>;
  if (days <= 0) return <span className="text-xs font-semibold text-red-600">closed</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${days <= 3 ? 'text-red-600' : days <= 5 ? 'text-amber-700' : 'text-gray-600'}`}>
      <Clock className="h-3 w-3" />{days} day{days === 1 ? '' : 's'} left
    </span>
  );
};

const blankManual = () => ({
  awb: '', orderNumber: '', courier: '', billedWeight: '', declaredWeight: '',
  billedCost: '', declaredCost: '', lengthCm: '', breadthCm: '', heightCm: '',
  billedOn: '', note: '',
});

const WeightDisputes: React.FC = () => {
  const [list, setList] = useState<Dispute[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [config, setConfig] = useState<{ thresholdPercent: number; windowDays: number; divisor: number } | null>(null);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<Dispute | null>(null);
  const [msg, setMsg] = useState(''); const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // create + import
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blankManual());
  const fileRef = useRef<HTMLInputElement>(null);
  const [importCourier, setImportCourier] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  // drawer actions
  const [actionNote, setActionNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const reload = async (nextStatus = status) => {
    try {
      const [l, s] = await Promise.all([
        api.get('/weight-disputes', { params: nextStatus ? { status: nextStatus } : {} }),
        api.get('/weight-disputes/summary'),
      ]);
      setList(payload<Dispute[]>(l) ?? []);
      setSummary(payload<Summary>(s) ?? null);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  useEffect(() => {
    reload();
    api.get('/weight-disputes/config').then((r) => setConfig(payload(r))).catch(() => { /* defaults shown */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (id: string) => {
    setMsg(''); setOkMsg(''); setActionNote(''); setPhotoUrl('');
    try { setDetail(payload<Dispute>(await api.get(`/weight-disputes/${id}`))); setCreating(false); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const setF = (patch: Partial<ReturnType<typeof blankManual>>) => setForm((f) => ({ ...f, ...patch }));

  const create = async () => {
    if (!form.awb.trim() && !form.orderNumber.trim()) { setMsg('Enter the courier tracking number (AWB) or the order number.'); return; }
    if (!Number(form.billedWeight)) { setMsg('Enter the weight the courier charged you for.'); return; }
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      const r = payload<Dispute>(await api.post('/weight-disputes', {
        awb: form.awb.trim() || null, orderNumber: form.orderNumber.trim() || null,
        courier: form.courier.trim() || null,
        weightUnit: 'g',
        billedWeight: Number(form.billedWeight),
        declaredWeight: form.declaredWeight ? Number(form.declaredWeight) : null,
        billedCost: form.billedCost ? Number(form.billedCost) : null,
        declaredCost: form.declaredCost ? Number(form.declaredCost) : null,
        lengthCm: form.lengthCm ? Number(form.lengthCm) : null,
        breadthCm: form.breadthCm ? Number(form.breadthCm) : null,
        heightCm: form.heightCm ? Number(form.heightCm) : null,
        billedOn: form.billedOn || null, note: form.note.trim() || null,
      }));
      setOkMsg('Dispute recorded. Open it to attach evidence and fight the charge.');
      setCreating(false); setForm(blankManual()); await reload();
      if (r?.id) openDetail(r.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const upload = async (file: File) => {
    setBusy(true); setMsg(''); setOkMsg(''); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (importCourier.trim()) fd.append('courier', importCourier.trim());
      fd.append('weightUnit', 'kg');
      const res = await api.post('/weight-disputes/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const out = payload<any>(res);
      setImportResult(out);
      setOkMsg(`Checked ${out?.rows ?? 0} parcel(s): ${out?.opened ?? 0} unfair charge(s) flagged, ${out?.clean ?? 0} fair, ${out?.unmatched?.length ?? 0} we could not find.`);
      await reload();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const transition = async (to: string) => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      await api.post(`/weight-disputes/${detail.id}/transition`, {
        to, note: actionNote.trim() || null,
        evidence: photoUrl.trim() ? [{ kind: 'photo', url: photoUrl.trim() }] : undefined,
      });
      setOkMsg(
        to === 'disputing' ? 'Dispute filed. Keep the courier reference handy and record their answer here.'
        : to === 'accepted' ? 'Charge accepted — this one is closed.'
        : to === 'won' ? 'Recorded. The refund you expect is shown on the dispute.'
        : 'Recorded.');
      setActionNote(''); setPhotoUrl('');
      await openDetail(detail.id); await reload();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const addEvidence = async () => {
    if (!detail) return;
    if (!actionNote.trim() && !photoUrl.trim()) { setMsg('Write a note or paste a photo link first.'); return; }
    setBusy(true); setMsg(''); setOkMsg('');
    try {
      await api.post(`/weight-disputes/${detail.id}/evidence`, {
        evidence: [
          ...(photoUrl.trim() ? [{ kind: 'photo', url: photoUrl.trim() }] : []),
          ...(actionNote.trim() ? [{ kind: 'note', text: actionNote.trim() }] : []),
        ],
      });
      setOkMsg('Added to the evidence pack.');
      setActionNote(''); setPhotoUrl('');
      await openDetail(detail.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const t = summary?.totals;

  return (
    <Page>
      <PageHeader
        title="Courier weight disputes — are you being over-billed?"
        icon={Scale}
        description={`Couriers re-weigh parcels after pickup and quietly charge the difference. We compare what they billed against what you declared (including the volumetric weight they are fairly allowed to charge) and flag anything more than ${config?.thresholdPercent ?? 10}% over — so you can fight it before the ${config?.windowDays ?? 7}-day objection window closes.`}
        actions={
          <Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating((v) => !v); setDetail(null); setMsg(''); setOkMsg(''); }}>
            <Plus className="h-4 w-4" />{creating ? 'Cancel' : 'Record a charge'}
          </Btn>
        }
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{okMsg}</div>}

      {/* ── Money tiles ─────────────────────────────────────────────────── */}
      <StatGrid cols={4}>
        <StatCard
          label="Money still winnable"
          value={inr(t?.atStakeMinor ?? 0)}
          sub={`${t?.open ?? 0} awaiting your decision · ${t?.disputing ?? 0} being fought`}
          tone={Number(t?.atStakeMinor ?? 0) > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Deadline in 3 days or less"
          value={t?.closingSoon ?? 0}
          sub="Act on these first — after the window the charge is final"
          tone={(t?.closingSoon ?? 0) > 0 ? 'bad' : 'good'}
        />
        <StatCard
          label="Win rate"
          value={t?.winRatePct == null ? '—' : `${t.winRatePct}%`}
          sub={`${t?.won ?? 0} won · ${t?.lost ?? 0} rejected · ${inr(t?.recoveredMinor ?? 0)} recovered`}
          tone={(t?.winRatePct ?? 0) >= 50 ? 'good' : 'default'}
        />
        <StatCard
          label="Paid without a fight"
          value={inr(t?.writtenOffMinor ?? 0)}
          sub={`${t?.accepted ?? 0} accepted · ${t?.lost ?? 0} lost · ${t?.expired ?? 0} expired without action`}
          tone={(t?.expired ?? 0) > 0 ? 'bad' : 'default'}
        />
      </StatGrid>

      {/* ── Upload the courier's report ─────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Upload the courier's weight report</h3>
        <p className="text-xs text-gray-500">
          Download the weight-reconciliation / freight report from your courier panel and drop the CSV or Excel file here.
          We read the tracking number and the charged weight, match each parcel to your shipment, and flag the unfair ones.
          Parcels we cannot find are listed back to you — nothing is silently ignored.
        </p>
        <FilterBar>
          <Field label="Courier (used when the file has no courier column)">
            <TextInput value={importCourier} onChange={(e) => setImportCourier(e.target.value)} placeholder="e.g. Delhivery" />
          </Field>
          <Field label="Report file">
            <input
              ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
              className="block w-full cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
          </Field>
          {busy && <div className="self-end pb-2 text-xs text-gray-500"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Checking…</div>}
        </FilterBar>

        {importResult && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
            <div><strong>{importResult.rows}</strong> parcel(s) in the file · <strong>{importResult.opened}</strong> flagged · <strong>{importResult.refreshed}</strong> updated · <strong>{importResult.clean}</strong> fair · <strong>{importResult.unmatched?.length ?? 0}</strong> not found</div>
            {(importResult.unmatched ?? []).length > 0 && (
              <div>Not found: {(importResult.unmatched ?? []).map((u: any) => u.awb || u.orderNumber).join(', ')}</div>
            )}
            {(importResult.problems ?? []).map((p: any, i: number) => (
              <div key={i} className="text-amber-700">Row {p.row}: {p.message}</div>
            ))}
          </div>
        )}
      </div>

      {/* ── Record a charge by hand ─────────────────────────────────────── */}
      {creating && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Record one over-charge</h3>
          <p className="text-xs text-gray-500">
            Weights are in grams. Leave "what you declared" blank and we read it off the shipment. Adding the box size lets us
            work out the volumetric weight the courier is fairly allowed to charge.
          </p>
          <FilterBar>
            <Field label="Tracking number (AWB)"><TextInput value={form.awb} onChange={(e) => setF({ awb: e.target.value })} placeholder="courier AWB" /></Field>
            <Field label="or Order number"><TextInput value={form.orderNumber} onChange={(e) => setF({ orderNumber: e.target.value })} placeholder="e.g. ORD-00003" /></Field>
            <Field label="Courier"><TextInput value={form.courier} onChange={(e) => setF({ courier: e.target.value })} placeholder="e.g. Delhivery" /></Field>
            <Field label="Date on their bill"><TextInput type="date" value={form.billedOn} onChange={(e) => setF({ billedOn: e.target.value })} /></Field>
          </FilterBar>
          <FilterBar>
            <Field label="They charged for (g)"><TextInput type="number" min={0} value={form.billedWeight} onChange={(e) => setF({ billedWeight: e.target.value })} placeholder="900" /></Field>
            <Field label="You declared (g)"><TextInput type="number" min={0} value={form.declaredWeight} onChange={(e) => setF({ declaredWeight: e.target.value })} placeholder="200" /></Field>
            <Field label="They billed (₹)"><TextInput type="number" min={0} step="0.01" value={form.billedCost} onChange={(e) => setF({ billedCost: e.target.value })} placeholder="200.00" /></Field>
            <Field label="You expected (₹)"><TextInput type="number" min={0} step="0.01" value={form.declaredCost} onChange={(e) => setF({ declaredCost: e.target.value })} placeholder="80.00" /></Field>
          </FilterBar>
          <FilterBar>
            <Field label="Box length (cm)"><TextInput type="number" min={0} value={form.lengthCm} onChange={(e) => setF({ lengthCm: e.target.value })} placeholder="20" /></Field>
            <Field label="Box width (cm)"><TextInput type="number" min={0} value={form.breadthCm} onChange={(e) => setF({ breadthCm: e.target.value })} placeholder="15" /></Field>
            <Field label="Box height (cm)"><TextInput type="number" min={0} value={form.heightCm} onChange={(e) => setF({ heightCm: e.target.value })} placeholder="10" /></Field>
            <Field label="Note"><TextInput value={form.note} onChange={(e) => setF({ note: e.target.value })} placeholder="Where this charge came from" /></Field>
          </FilterBar>
          <Btn variant="success" disabled={busy} onClick={create}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Record it
          </Btn>
        </div>
      )}

      {/* ── Detail drawer ──────────────────────────────────────────────── */}
      {detail && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className="font-mono">{detail.awb || detail.order_number || '—'}</span>
                <Chip tone={STATUS_TONE[detail.status] ?? 'neutral'}>{STATUS_LABEL[detail.status] ?? detail.status}</Chip>
                <Countdown d={detail} />
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {detail.courier ? `${detail.courier} · ` : ''}
                {detail.order_number ? `order ${detail.order_number} · ` : ''}
                {detail.billed_on ? `billed ${detail.billed_on} · ` : ''}
                came from {detail.source === 'csv_import' ? 'their report' : detail.source === 'webhook' ? 'a courier update' : detail.source === 'api' ? 'a courier invoice line' : 'manual entry'}
              </div>
            </div>
            <Btn variant="ghost" onClick={() => setDetail(null)}><X className="h-4 w-4" />Close</Btn>
          </div>

          {/* The comparison, in one sentence a shopkeeper can read out loud. */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You declared <strong>{grams(detail.declared_weight_g)}</strong>
            {Number(detail.volumetric_weight_g) > 0 && <> in a box that works out to <strong>{grams(detail.volumetric_weight_g)}</strong> by volume</>}
            {' '}— so <strong>{grams(detail.chargeable_declared_g)}</strong> was fair. The courier billed{' '}
            <strong>{grams(detail.billed_weight_g)}</strong> ({pct(detail.excess_pct_milli)} over) and charged{' '}
            <strong>{inr(detail.billed_cost_minor)}</strong> instead of <strong>{inr(detail.declared_cost_minor)}</strong> —{' '}
            <strong>{inr(detail.excess_minor)}</strong> extra.
            {Number(detail.refund_expected_minor) > 0 && <> Refund expected: <strong>{inr(detail.refund_expected_minor)}</strong>.</>}
          </div>

          {['open', 'disputing'].includes(detail.status) && (
            <div className="space-y-3">
              <FilterBar>
                <Field label="Note / what you told the courier">
                  <TextInput value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="e.g. Weighed 205 g on our scale at dispatch" />
                </Field>
                <Field label="Photo link (weighing slip, packed parcel)">
                  <TextInput value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
                </Field>
              </FilterBar>
              <div className="flex flex-wrap items-center gap-2">
                <Btn variant="outline" disabled={busy} onClick={addEvidence}><Camera className="h-4 w-4" />Add to evidence</Btn>
                {detail.status === 'open' && (
                  <>
                    <Btn variant="primary" disabled={busy} onClick={() => transition('disputing')}><ShieldAlert className="h-4 w-4" />Fight it</Btn>
                    <Btn variant="outline" disabled={busy} onClick={() => transition('accepted')}>Accept the charge</Btn>
                  </>
                )}
                {detail.status === 'disputing' && (
                  <>
                    <Btn variant="success" disabled={busy} onClick={() => transition('won')}><CheckCircle2 className="h-4 w-4" />Courier refunded it</Btn>
                    <Btn variant="danger" disabled={busy} onClick={() => transition('lost')}>Courier said no</Btn>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500">
                "Fight it" records your objection and the evidence you attached — file it in the courier's panel too and put their
                ticket number in the note. Winning records the refund you expect; the money landing in your courier wallet is not
                posted to your books automatically.
              </p>
            </div>
          )}

          {detail.resolution_note && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">{detail.resolution_note}</div>
          )}

          {(detail.evidence ?? []).length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Evidence pack</div>
              <ul className="space-y-1 text-xs text-gray-700">
                {(detail.evidence ?? []).map((e: any, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <Chip tone="neutral">{e.kind ?? 'note'}</Chip>
                    {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">{e.url}</a> : <span>{e.text}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(detail.timeline ?? []).length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">What happened</div>
              <ul className="space-y-1 text-xs text-gray-600">
                {(detail.timeline ?? []).map((e: any, i: number) => (
                  <li key={i}>• {e.event}{e.note ? ` — ${e.note}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── The queue ──────────────────────────────────────────────────── */}
      <FilterBar>
        <Field label="Show">
          <SelectInput value={status} onChange={(e) => { setStatus(e.target.value); reload(e.target.value); }}>
            {STATUS_FILTERS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
          </SelectInput>
        </Field>
      </FilterBar>

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Parcel</Th><Th>Courier</Th>
            <Th num>You declared</Th><Th num>By volume</Th><Th num>They billed</Th>
            <Th num>Over by</Th><Th num>Extra charge</Th>
            <Th>Deadline</Th><Th>Status</Th>
          </THead>
          <TBody>
            {list == null ? (
              <EmptyRow colSpan={9}>Loading disputes…</EmptyRow>
            ) : list.length === 0 ? (
              <EmptyRow colSpan={9}>
                <EmptyState
                  title="No weight disputes"
                  description="Upload your courier's weight-reconciliation report above and we will check every parcel against the weight you declared."
                />
              </EmptyRow>
            ) : list.map((d) => (
              <Tr key={d.id} className="cursor-pointer" onClick={() => openDetail(d.id)}>
                <Td className="font-mono text-xs">
                  {d.awb || '—'}
                  {d.order_number && <span className="block text-gray-400">{d.order_number}</span>}
                </Td>
                <Td>{d.courier || '—'}</Td>
                <Td num muted>{grams(d.declared_weight_g)}</Td>
                <Td num muted>{grams(d.volumetric_weight_g)}</Td>
                <Td num>{grams(d.billed_weight_g)}</Td>
                <Td num className={Number(d.excess_pct_milli) >= 50000 ? 'text-red-600 font-semibold' : ''}>{pct(d.excess_pct_milli)}</Td>
                <Td num className="font-semibold">{inr(d.excess_minor)}</Td>
                <Td><Countdown d={d} /></Td>
                <Td><Chip tone={STATUS_TONE[d.status] ?? 'neutral'}>{STATUS_LABEL[d.status] ?? d.status}</Chip></Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>

      {/* ── Per-courier scoreboard ─────────────────────────────────────── */}
      {(summary?.byCourier ?? []).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800">Which couriers over-bill you most?</h3>
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Courier</Th><Th num>Disputes</Th><Th num>Still winnable</Th>
                <Th num>Recovered</Th><Th num>Paid anyway</Th>
                <Th num>Avg extra</Th><Th num>Avg over-charge</Th><Th num>Win rate</Th>
              </THead>
              <TBody>
                {(summary?.byCourier ?? []).map((c) => (
                  <Tr key={c.courier}>
                    <Td>{c.courier}</Td>
                    <Td num>{c.disputes}</Td>
                    <Td num className={Number(c.atStakeMinor) > 0 ? 'text-amber-700 font-semibold' : ''}>{inr(c.atStakeMinor)}</Td>
                    <Td num className="text-emerald-700">{inr(c.recoveredMinor)}</Td>
                    <Td num className={Number(c.writtenOffMinor) > 0 ? 'text-red-600' : ''}>{inr(c.writtenOffMinor)}</Td>
                    <Td num muted>{inr(c.avgExcessMinor)}</Td>
                    <Td num muted>{c.avgExcessPct?.toFixed(1)}%</Td>
                    <Td num>{c.winRatePct == null ? '—' : `${c.winRatePct}%`}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </div>
      )}
    </Page>
  );
};

export default WeightDisputes;
