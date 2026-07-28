import React, { useEffect, useRef, useState } from 'react';
import {
  Hammer, Loader2, Plus, AlertTriangle, CheckCircle2, X, ArrowLeft, Lock, Unlock,
  ClipboardList, PlayCircle, CalendarClock, Package, Layers,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, SectionCard, StatCard, StatGrid, Field, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Chip, TabBar, EmptyState,
} from '../../components/erp';

/**
 * WORK ORDERS (migration 083) — the shop floor's plan over the recipes in
 * Kits & Assembly. Deliberately plain language throughout, because the people
 * who read this screen are standing at a bench, not sitting in accounts:
 *
 *   "Plan a job"        write down what to make and by when
 *   "Put on the queue"  agreed work, waiting for the floor
 *   "Release"           give it to the floor → THE PARTS ARE SET ASIDE so
 *                       nobody sells them while the build is waiting
 *   "Start"             a worker picked it up
 *   "Mark built"        the set-aside parts become the finished goods
 *   "Cancel"            the parts go straight back on sale, nothing moved
 */

interface Reservation {
  id: string; variation_id: string; sku: string | null; product_name: string | null;
  qty: number; freed_at: string | null; freed_reason: string | null;
}
interface WorkOrder {
  id: string; wo_seq: number; wo_ref: string; bom_id: string;
  finished_sku: string | null; finished_name: string | null; bom_name: string | null;
  qty_planned: number; output_qty_planned: number; due_date: string | null;
  priority: number; status: string; assigned_to: string | null;
  autobuild_subassemblies: boolean; reserved: boolean; notes: string | null;
  assembly_order_id: string | null; assembly_number?: string | null;
  cancel_reason: string | null; created_at: string;
  is_overdue?: boolean; held_units?: number; reservations?: Reservation[];
}
interface Hold {
  variation_id: string; sku: string | null; product_name: string | null; label: string;
  qty: number; available: number; is_subassembly: boolean;
}
interface BuildStep { bom_id: string; label: string; runs: number; produced_qty: number; level: number }
interface Preview {
  finished_label: string; produced_qty: number; runs: number;
  has_subassemblies: boolean; max_depth: number;
  holds: Hold[]; plan: BuildStep[]; buildable: boolean; shortage_message: string | null;
}
interface Board {
  columns: Array<{ status: string; label: string; count: number; rows: WorkOrder[] }>;
  totals: { open: number; queued: number; released: number; in_progress: number; overdue: number; held_units: number; held_skus: number };
}
interface Recipe {
  id: string; name: string; finished_sku?: string | null; finished_name?: string | null;
  output_qty: number; active: boolean;
}

const PRIORITY_LABEL: Record<number, string> = {
  1: 'Drop everything', 2: 'Urgent', 3: 'Normal', 4: 'When there is time', 5: 'Whenever',
};

const statusTone = (s: string): 'green' | 'blue' | 'amber' | 'neutral' | 'red' =>
  s === 'completed' ? 'green'
    : s === 'in_progress' ? 'blue'
      : s === 'released' ? 'amber'
        : s === 'cancelled' ? 'red' : 'neutral';

const statusWords: Record<string, string> = {
  draft: 'Draft', queued: 'Queued', released: 'Released — parts set aside',
  in_progress: 'In progress', completed: 'Built', cancelled: 'Cancelled',
};

const WorkOrders: React.FC = () => {
  const [tab, setTab] = useState('board');
  const [board, setBoard] = useState<Board | null>(null);
  const [all, setAll] = useState<WorkOrder[]>([]);
  const [detail, setDetail] = useState<WorkOrder | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');

  // ── plan-a-job form ──
  const [bomId, setBomId] = useState('');
  const [qty, setQty] = useState('1');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('3');
  const [autobuild, setAutobuild] = useState(false);
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // what the RELEASE button will set aside, for the job being looked at
  const [releasePlan, setReleasePlan] = useState<Preview | null>(null);

  const loadBoard = async () => {
    try { setBoard(payload<Board>(await api.get('/work-orders/board'))); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };
  const loadAll = async () => {
    try { setAll(payload<WorkOrder[]>(await api.get('/work-orders', { params: { limit: 200 } })) ?? []); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };
  const loadRecipes = async () => {
    try { setRecipes((payload<Recipe[]>(await api.get('/bom', { params: { active: true } })) ?? []).filter((r) => r.active)); }
    catch { /* the picker just stays empty */ }
  };
  useEffect(() => { loadBoard(); loadAll(); loadRecipes(); }, []);

  /** Ask the server what a job of this size would take off the shelf. Debounced. */
  const loadPreview = (id: string, runs: number, auto: boolean, into: (p: Preview | null) => void) => {
    if (!id) { into(null); return; }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try { into(payload<Preview>(await api.post('/work-orders/preview', { bomId: id, qty: runs, autobuildSubassemblies: auto }))); }
      catch { into(null); }
    }, 300);
  };

  const openDetail = async (id: string) => {
    setMsg(''); setOk(''); setReleasePlan(null);
    try {
      const w = payload<WorkOrder>(await api.get(`/work-orders/${id}`));
      setDetail(w);
      if (w && (w.status === 'draft' || w.status === 'queued')) {
        loadPreview(w.bom_id, w.qty_planned, w.autobuild_subassemblies, setReleasePlan);
      }
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const refresh = async (id?: string) => {
    await Promise.all([loadBoard(), loadAll()]);
    if (id) await openDetail(id);
  };

  const resetCreate = () => {
    setCreating(false); setBomId(''); setQty('1'); setDueDate(''); setPriority('3');
    setAutobuild(false); setNotes(''); setPreview(null);
  };

  const planJob = async (andQueue: boolean) => {
    if (!bomId) { setMsg('Choose which recipe this job builds.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const w = payload<WorkOrder>(await api.post('/work-orders', {
        bomId, qtyPlanned: Math.max(1, Math.round(Number(qty) || 1)),
        dueDate: dueDate || null, priority: Number(priority) || 3,
        autobuildSubassemblies: autobuild, notes: notes.trim() || null, queue: andQueue,
      }));
      setOk(`${w.wo_ref} planned — ${w.output_qty_planned}× ${w.finished_name ?? 'finished units'}${andQueue ? ', on the queue.' : ' (draft).'}`);
      resetCreate(); await refresh();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const act = async (id: string, action: string, body?: any, success?: (r: any) => string) => {
    setBusy(true); setMsg(''); setOk('');
    try {
      const res = await api.post(`/work-orders/${id}/${action}`, body ?? {});
      const r: any = res.data ?? res;
      setOk(success ? success(r) : 'Done.');
      await refresh(id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const release = (w: WorkOrder) => act(w.id, 'release', {}, (r) =>
    `${w.wo_ref} released to the floor — ${r?.reserved_units ?? 0} part(s) set aside across ${(r?.reserved ?? []).length} SKU(s). Nobody can sell them now.`);
  const start = (w: WorkOrder) => act(w.id, 'start', {}, () => `${w.wo_ref} is now in progress.`);
  const complete = (w: WorkOrder) => act(w.id, 'complete', {}, (r) =>
    `${w.wo_ref} built — ${r?.assembly?.output_qty_produced ?? ''} finished units on the shelf (${r?.assembly?.assembly_number ?? 'done'}). The set-aside parts were used up.`);
  const cancel = (w: WorkOrder) => {
    const reason = window.prompt(`Cancel ${w.wo_ref}? Any parts it is holding go straight back on sale. Reason (optional):`);
    if (reason === null) return;
    return act(w.id, 'cancel', { reason }, (r) =>
      `${w.wo_ref} cancelled — ${r?.freed_units ?? 0} part(s) back on sale. No stock was moved.`);
  };
  const queue = (w: WorkOrder) => act(w.id, 'queue', {}, () => `${w.wo_ref} is on the queue.`);

  // ── row of action buttons for one job ──
  const Actions: React.FC<{ w: WorkOrder; compact?: boolean }> = ({ w, compact }) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {w.status === 'draft' && <Btn variant="outline" disabled={busy} onClick={() => queue(w)}><ClipboardList className="h-4 w-4" />Put on queue</Btn>}
      {(w.status === 'draft' || w.status === 'queued') && (
        <Btn variant="primary" disabled={busy} onClick={() => release(w)}><Lock className="h-4 w-4" />Release &amp; set parts aside</Btn>
      )}
      {w.status === 'released' && <Btn variant="primary" disabled={busy} onClick={() => start(w)}><PlayCircle className="h-4 w-4" />Start work</Btn>}
      {(w.status === 'released' || w.status === 'in_progress') && (
        <Btn variant="success" disabled={busy} onClick={() => complete(w)}><Hammer className="h-4 w-4" />Mark built</Btn>
      )}
      {w.status !== 'completed' && w.status !== 'cancelled' && (
        <Btn variant="ghost" disabled={busy} onClick={() => cancel(w)}><X className="h-4 w-4" />Cancel</Btn>
      )}
      {!compact && <Btn variant="ghost" onClick={() => openDetail(w.id)}>Open</Btn>}
    </div>
  );

  const JobLine: React.FC<{ w: WorkOrder }> = ({ w }) => (
    <button type="button" onClick={() => openDetail(w.id)}
      className="w-full rounded-lg border border-gray-100 p-2.5 text-left hover:border-gray-200 hover:bg-gray-50">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-gray-500">{w.wo_ref}</span>
        <div className="flex items-center gap-1">
          {w.is_overdue && <Chip tone="red">Late</Chip>}
          {w.reserved && <Chip tone="amber">Parts held</Chip>}
        </div>
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-gray-800">
        {w.output_qty_planned}× {w.finished_name ?? w.bom_name ?? 'finished units'}
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
        <span>{PRIORITY_LABEL[w.priority] ?? `P${w.priority}`}</span>
        {w.due_date && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{w.due_date}</span>}
        {(w.held_units ?? 0) > 0 && <span>{w.held_units} held</span>}
      </div>
    </button>
  );

  const chosenRecipe = recipes.find((r) => r.id === bomId);

  return (
    <Page>
      <PageHeader
        title="Work Orders"
        icon={Hammer}
        description="Plan the builds before you make them. Write the job down (“make 50 Immunity Combos by Friday”), release it to the floor — that sets the parts aside so nobody sells them while the job waits — then mark it built when it's done. Cancel a job and the parts go straight back on sale."
      />

      {msg && <div className="flex items-start gap-2 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{msg}</div>}
      {ok && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{ok}</div>}

      {board && (
        <StatGrid cols={4}>
          <StatCard label="Jobs open" value={board.totals.open} sub={`${board.totals.queued} waiting · ${board.totals.in_progress} on the bench`} icon={ClipboardList} />
          <StatCard label="Released to the floor" value={board.totals.released} sub="parts set aside" tone="warn" icon={Lock} />
          <StatCard label="Parts set aside" value={board.totals.held_units} sub={`${board.totals.held_skus} SKU(s) held out of stock`} tone="info" icon={Package} />
          <StatCard label="Past their due date" value={board.totals.overdue} tone={board.totals.overdue > 0 ? 'bad' : 'default'} icon={CalendarClock} />
        </StatGrid>
      )}

      <TabBar
        tabs={[{ key: 'board', label: 'Board' }, { key: 'list', label: 'All jobs' }]}
        active={tab}
        onChange={(k) => { setTab(k); setDetail(null); resetCreate(); }}
      />

      {/* ── BOARD ── */}
      {tab === 'board' && !detail && !creating && (
        <>
          <div className="flex justify-end">
            <Btn variant="primary" onClick={() => { setCreating(true); setMsg(''); setOk(''); }}><Plus className="h-4 w-4" />Plan a job</Btn>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {(board?.columns ?? []).map((col) => (
              <SectionCard key={col.status}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800">{col.label}</span>
                  <Chip tone={statusTone(col.status)}>{col.count}</Chip>
                </div>
                <div className="space-y-2">
                  {col.rows.length === 0
                    ? <p className="py-4 text-center text-xs text-gray-400">Nothing here.</p>
                    : col.rows.map((w) => <JobLine key={w.id} w={w} />)}
                </div>
              </SectionCard>
            ))}
          </div>
        </>
      )}

      {/* ── PLAN A JOB ── */}
      {creating && (
        <SectionCard>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Plus className="h-4 w-4" />Plan a job</div>
            <Btn variant="ghost" onClick={resetCreate}><X className="h-4 w-4" />Cancel</Btn>
          </div>

          {recipes.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No recipes yet"
              description="A work order builds a recipe. Create one first in Kits & Assembly (“this Combo is made of 2× A + 1× B”), then come back and plan a job."
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <Field label="What are we making?">
                  <SelectInput
                    value={bomId}
                    onChange={(e) => { setBomId(e.target.value); loadPreview(e.target.value, Math.max(1, Number(qty) || 1), autobuild, setPreview); }}
                    className="w-72"
                  >
                    <option value="">Choose a recipe…</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}{r.finished_sku ? ` · ${r.finished_sku}` : ''}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="How many builds?">
                  <TextInput type="number" min={1} value={qty} className="w-24 text-right"
                    onChange={(e) => { setQty(e.target.value); loadPreview(bomId, Math.max(1, Number(e.target.value) || 1), autobuild, setPreview); }} />
                </Field>
                <Field label="Wanted by">
                  <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-40" />
                </Field>
                <Field label="How urgent?">
                  <SelectInput value={priority} onChange={(e) => setPriority(e.target.value)} className="w-48">
                    {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </SelectInput>
                </Field>
              </div>

              <Field label="Note for the floor (optional)">
                <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. pack in the gift boxes, not the plain ones" className="w-full max-w-xl" />
              </Field>

              {chosenRecipe && (
                <p className="mt-2 text-xs text-gray-500">
                  One build makes {chosenRecipe.output_qty} finished unit(s) → this job makes{' '}
                  <b>{chosenRecipe.output_qty * Math.max(1, Number(qty) || 1)}</b>.
                </p>
              )}

              {preview?.has_subassemblies && (
                <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={autobuild}
                    onChange={(e) => { setAutobuild(e.target.checked); loadPreview(bomId, Math.max(1, Number(qty) || 1), e.target.checked, setPreview); }} />
                  Also build the middle items this needs (it is {preview.max_depth} levels deep)
                </label>
              )}

              {preview && (
                <div className={`mt-3 rounded-lg border p-3 ${preview.buildable ? 'border-blue-100 bg-blue-50/60' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="text-sm font-semibold text-gray-800">
                    Releasing this job would set aside:
                  </div>
                  {preview.holds.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-600">Nothing — check the recipe.</p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {preview.holds.map((h) => (
                        <Chip key={h.variation_id} tone={h.is_subassembly ? 'blue' : 'neutral'}>
                          {h.qty}× {h.label}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {preview.plan.length > 0 && (
                    <p className="mt-2 text-sm text-blue-900">
                      It will also build first: {preview.plan.map((s) => `${s.produced_qty}× ${s.label}`).join(', ')}.
                    </p>
                  )}
                  {preview.shortage_message && (
                    <div className="mt-2 whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {preview.shortage_message}
                      <div className="mt-1 text-xs text-red-600">You can still write the job down — you just can't release it until the parts are in.</div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Btn variant="outline" disabled={busy || !bomId} onClick={() => planJob(false)}>Save as draft</Btn>
                <Btn variant="primary" disabled={busy || !bomId} onClick={() => planJob(true)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}Put on the queue
                </Btn>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ── ONE JOB ── */}
      {detail && !creating && (
        <>
          <Btn variant="ghost" onClick={() => { setDetail(null); setReleasePlan(null); }}><ArrowLeft className="h-4 w-4" />Back</Btn>
          <StatGrid cols={4}>
            <StatCard label="Job" value={<span className="text-base">{detail.wo_ref}</span>} sub={detail.bom_name ?? undefined} icon={Hammer} />
            <StatCard label="Making" value={`${detail.output_qty_planned}×`} sub={detail.finished_name ?? detail.finished_sku ?? undefined} icon={Package} />
            <StatCard label="Where it is" value={statusWords[detail.status] ?? detail.status}
              tone={detail.status === 'completed' ? 'good' : detail.status === 'released' ? 'warn' : 'info'} />
            <StatCard label="Wanted by" value={detail.due_date ?? 'No date'}
              sub={PRIORITY_LABEL[detail.priority]} tone={detail.is_overdue ? 'bad' : 'default'} icon={CalendarClock} />
          </StatGrid>

          <SectionCard>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-800">What happens next</div>
              <Actions w={detail} compact />
            </div>
            <p className="text-sm text-gray-600">
              {detail.status === 'draft' && 'This is still a draft — nothing is set aside. Put it on the queue when it is agreed, or release it straight to the floor.'}
              {detail.status === 'queued' && 'Waiting for the floor. Nothing is set aside yet — release it when you want the parts protected.'}
              {detail.status === 'released' && 'On the floor. The parts below are set aside: they will not be sold, shown as available, or published to any marketplace until this job is built or cancelled.'}
              {detail.status === 'in_progress' && 'Somebody is building this right now. The parts below are still set aside.'}
              {detail.status === 'completed' && `Built. The set-aside parts were used up and the finished goods are on the shelf${detail.assembly_number ? ` (build ${detail.assembly_number})` : ''}.`}
              {detail.status === 'cancelled' && `Cancelled${detail.cancel_reason ? ` — ${detail.cancel_reason}` : ''}. Every part it was holding went back on sale and no stock moved.`}
            </p>
            {detail.notes && <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">Note for the floor: {detail.notes}</p>}
          </SectionCard>

          {/* what a release WOULD hold (before it is released) */}
          {(detail.status === 'draft' || detail.status === 'queued') && releasePlan && (
            <SectionCard>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Lock className="h-4 w-4" />Releasing this job will set aside
              </div>
              <TableShell>
                <table className="w-full text-sm">
                  <THead><Th>Part</Th><Th>Set aside</Th><Th>Available now</Th><Th>Status</Th></THead>
                  <TBody>
                    {releasePlan.holds.length === 0
                      ? <EmptyRow colSpan={4}>Nothing to set aside — check the recipe.</EmptyRow>
                      : releasePlan.holds.map((h) => (
                        <Tr key={h.variation_id}>
                          <Td><span className="font-medium">{h.product_name ?? h.label}</span> <span className="font-mono text-xs text-gray-500">{h.sku}</span>
                            {h.is_subassembly && <div className="mt-0.5"><Chip tone="blue">made by another recipe</Chip></div>}</Td>
                          <Td className="font-medium">{h.qty}</Td>
                          <Td>{h.available}</Td>
                          <Td>{h.available >= h.qty ? <Chip tone="green">OK</Chip> : <Chip tone="red">Short by {h.qty - h.available}</Chip>}</Td>
                        </Tr>
                      ))}
                  </TBody>
                </table>
              </TableShell>
              {releasePlan.shortage_message && (
                <div className="mt-2 whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{releasePlan.shortage_message}</div>
              )}
            </SectionCard>
          )}

          {/* the holds themselves */}
          {(detail.reservations ?? []).length > 0 && (
            <SectionCard>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                {detail.reserved ? <Lock className="h-4 w-4 text-amber-600" /> : <Unlock className="h-4 w-4 text-gray-400" />}
                Parts set aside for this job
              </div>
              <TableShell>
                <table className="w-full text-sm">
                  <THead><Th>Part</Th><Th>Quantity</Th><Th>Status</Th></THead>
                  <TBody>
                    {(detail.reservations ?? []).map((r) => (
                      <Tr key={r.id}>
                        <Td><span className="font-medium">{r.product_name ?? '—'}</span> <span className="font-mono text-xs text-gray-500">{r.sku}</span></Td>
                        <Td className="font-medium">{r.qty}</Td>
                        <Td>{r.freed_at === null
                          ? <Chip tone="amber">Held — not sellable</Chip>
                          : <Chip tone="neutral">{r.freed_reason === 'completed' ? 'Used by the build' : 'Given back'}</Chip>}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableShell>
            </SectionCard>
          )}
        </>
      )}

      {/* ── ALL JOBS ── */}
      {tab === 'list' && !detail && !creating && (
        <SectionCard>
          <TableShell>
            <table className="w-full text-sm">
              <THead><Th>Job</Th><Th>Making</Th><Th>Urgency</Th><Th>Wanted by</Th><Th>Held</Th><Th>Where it is</Th><Th></Th></THead>
              <TBody>
                {all.length === 0 ? (
                  <EmptyRow colSpan={7}>No jobs yet. Plan one from the board.</EmptyRow>
                ) : all.map((w) => (
                  <Tr key={w.id}>
                    <Td className="font-mono text-xs">{w.wo_ref}
                      {w.assembly_number && <div className="mt-0.5 text-[11px] text-gray-500">{w.assembly_number}</div>}</Td>
                    <Td><span className="font-medium">{w.output_qty_planned}× {w.finished_name ?? '—'}</span>
                      <div className="text-xs text-gray-500">{w.bom_name}</div></Td>
                    <Td>{PRIORITY_LABEL[w.priority] ?? `P${w.priority}`}</Td>
                    <Td>{w.due_date ?? '—'} {w.is_overdue && <Chip tone="red">Late</Chip>}</Td>
                    <Td>{(w.held_units ?? 0) > 0 ? <Chip tone="amber">{w.held_units}</Chip> : '—'}</Td>
                    <Td><Chip tone={statusTone(w.status)}>{statusWords[w.status] ?? w.status}</Chip></Td>
                    <Td><Actions w={w} /></Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </SectionCard>
      )}
    </Page>
  );
};

export default WorkOrders;
