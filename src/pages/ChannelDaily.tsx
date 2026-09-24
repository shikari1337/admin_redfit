/**
 * CHANNELS ▸ DAILY FILE — the one screen a staff member opens every morning.
 *
 * Tata 1mg and Healthmug have no API, so the working day starts and ends with
 * two files: upload the orders that came in, download the stock that goes out.
 * Everything else about a marketplace lives on other pages; this one does those
 * two things and shows what happened.
 *
 * Desktop-first (it is a desk job, not a floor job), light, plain words. The
 * upload is a three-step walk — choose the file, check what will happen, create
 * the orders — and the middle step is the one that matters: it names every
 * order that will be created, every order already in the system, and every SKU
 * the file mentions that the catalogue does not have. Nothing is written until
 * the person has seen that.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { channelsAPI, exportsAPI } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Page, PageHeader } from '@/components/erp';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import {
  UploadCloud, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2,
  RotateCcw, Info, ArrowRight, PackageSearch, ClipboardList, Copy,
} from 'lucide-react';

interface Connection { id: string; platform_code: string; display_name?: string; is_active?: boolean }

interface FieldHelp {
  key: string; label: string; group: string; hint: string; required: boolean;
  does: string; format: string; example: string | number; default_header: string | null;
}

interface FileConfig {
  file_based: boolean;
  commission_tier: 'retail' | 'b2b' | 'manual' | 'none';
  maps: Record<string, Record<string, string>>;
  export: { format: 'xlsx' | 'csv'; sheet_name: string; file_name: string; include_zero: boolean; only_mapped: boolean; column_order: string[] };
  orders: { create_orders: boolean; payment_method: string; payment_status: string; order_status: string; deduct_stock: boolean; link_customer: boolean };
  placeholder: boolean;
  notes: string;
}

interface ChannelInfo {
  channel: { id: string; platform_code: string; display_name: string; is_active: boolean; inventory_buffer_pct: number };
  platform: { code: string; name: string; platform_type: string } | null;
  fileConfig: FileConfig;
  exportColumns: Array<{ key: string; header: string }>;
  savedMappings: Record<string, Record<string, string> | null>;
  fields: Record<string, FieldHelp[]>;
  registerAvailable: boolean;
  commissionTierColumn: boolean;
  queueAvailable: boolean;
  withheld: string[];
}

interface RowProblem { row: number; message: string; field?: string }

interface PlanOrder {
  order_ref: string; order_date: string | null; lines: number; units: number;
  buyer: string; phone: string | null; city: string; state: string;
  payment_method: string;
  money: { subtotal: number; discount: number; tax: number; shipping: number; total: number; stated_total: number | null; difference: number | null; tax_included: boolean };
  notes: string[];
  items: Array<{ sku: string; name: string; quantity: number; unit_price: number; line_total: number }>;
}

interface Plan {
  registerAvailable: boolean;
  totals: { rows: number; orders: number; lines: number; units: number; value: number };
  problems: RowProblem[]; problemCount: number;
  unmatchedSkus: string[]; unmatchedSkuCount: number;
  duplicates: Array<{ order_ref: string; order_number: string | null; lines: number; total: number }>;
  orders: PlanOrder[];
}

interface PreviewResponse {
  channel: { id: string; display_name?: string; platform_code: string };
  headers: string[];
  rowCount: number;
  mapping: Record<string, string>;
  mappingSource: string;
  missing: Array<{ key: string; label: string }>;
  fields: FieldHelp[];
  createOrders: boolean;
  fileConfig: FileConfig;
  plan: Plan | null;
}

interface CreateResult {
  created: Array<{ order_ref: string; order_id: string; order_number: string; total: number; lines: number; units: number; commission_tier: string | null; stock_deducted: boolean }>;
  duplicates: Array<{ order_ref: string; order_number: string | null }>;
  problems: RowProblem[];
  rejected: boolean; partial: boolean;
  totals: { rows: number; orders: number; lines: number; units: number; value: number };
  commissionTierStamped: boolean;
}

const NONE = '__none__';
const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TIER_WORDS: Record<string, string> = {
  retail: 'Retail rate', b2b: 'Wholesale rate', manual: 'Manual / Books rate', none: 'No commission',
};

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ChannelDaily() {
  const { toast } = useToast();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm ? hasPerm('channels.manage') : true;
  const fileInput = useRef<HTMLInputElement>(null);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [channelId, setChannelId] = useState('');
  const [info, setInfo] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'create' | 'export'>('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [showMatch, setShowMatch] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  const [exports, setExports] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const rows: Connection[] = await channelsAPI.getConnections();
        setConnections(rows);
        if (rows.length && !channelId) setChannelId(rows[0].id);
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadChannel = useCallback(async (id: string) => {
    if (!id) { setInfo(null); return; }
    setLoading(true);
    try {
      const [cfg, ex, docs, imp] = await Promise.all([
        channelsAPI.fileConfig(id),
        channelsAPI.exportHistory(id),
        channelsAPI.orderDocuments(id),
        channelsAPI.importHistory(id),
      ]);
      setInfo(cfg);
      setExports(ex?.rows ?? []);
      setDocuments(docs?.rows ?? []);
      setImports(Array.isArray(imp) ? imp : []);
    } catch (e: any) {
      toast({ title: 'Could not open that channel', description: e?.message ?? 'Please try again.', variant: 'destructive' });
      setInfo(null);
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { resetUpload(); loadChannel(channelId); }, [channelId, loadChannel]);

  function resetUpload() {
    setFile(null); setPreview(null); setMapping({}); setResult(null);
    setResultMessage(''); setShowMatch(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  const orderFields = useMemo(() => preview?.fields ?? info?.fields?.orders ?? [], [preview, info]);

  async function runPreview(chosen: File) {
    setBusy('preview'); setResult(null); setResultMessage('');
    try {
      const p: PreviewResponse = await channelsAPI.importPreview(channelId, chosen, 'orders');
      setPreview(p);
      setMapping(p.mapping ?? {});
      setShowMatch((p.missing?.length ?? 0) > 0);
      if (p.missing?.length) {
        toast({
          title: 'A few columns still need matching',
          description: p.missing.map((m) => m.label).join(', '),
        });
      }
    } catch (e: any) {
      toast({ title: 'We could not read that file', description: e?.message ?? 'Please check it and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  }

  async function reRunPlan() {
    if (!file) return;
    setBusy('preview');
    try {
      const res = await channelsAPI.importOrders(channelId, file, { mapping, dryRun: true });
      setPreview((p) => (p ? { ...p, plan: res as unknown as Plan } : p));
      setShowMatch(false);
    } catch (e: any) {
      toast({ title: 'Could not check the file', description: e?.message ?? '', variant: 'destructive' });
    } finally { setBusy(''); }
  }

  async function createOrders() {
    if (!file) return;
    setBusy('create');
    try {
      const res: CreateResult = await channelsAPI.importOrders(channelId, file, { mapping, dryRun: false });
      setResult(res);
      setResultMessage(
        res.created.length
          ? `${res.created.length} order${res.created.length === 1 ? '' : 's'} created.`
          : 'Nothing new to create.');
      toast({ title: 'Done', description: `${res.created.length} order(s) created, ${res.duplicates.length} already here.` });
      loadChannel(channelId);
    } catch (e: any) {
      // A refusal is a real answer, not a crash: the server sends back the rows
      // to fix along with a 422, and this screen must show them.
      const payload = e?.response?.data;
      if (payload?.data) { setResult(payload.data as CreateResult); setResultMessage(payload.message ?? ''); }
      toast({
        title: payload?.data?.rejected ? 'Nothing was created' : 'Import stopped',
        description: payload?.message ?? e?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally { setBusy(''); }
  }

  async function downloadStockFile() {
    setBusy('export');
    try {
      const out: any = await channelsAPI.requestInventoryFile(channelId, {});
      if (out.queued) {
        toast({ title: 'Building your file', description: 'It will appear in the list below in a moment.' });
        setTimeout(() => loadChannel(channelId), 2500);
      } else {
        saveBlob(out.blob, out.fileName);
        toast({ title: 'Downloaded', description: out.fileName });
      }
    } catch (e: any) {
      toast({ title: 'Could not produce the stock file', description: e?.message ?? '', variant: 'destructive' });
    } finally { setBusy(''); }
  }

  async function downloadJob(id: string) {
    try {
      const { blob, fileName } = await exportsAPI.download(id);
      saveBlob(blob, fileName);
    } catch (e: any) {
      toast({ title: 'That file is not ready', description: e?.message ?? '', variant: 'destructive' });
    }
  }

  const plan = preview?.plan ?? null;
  const cfg = info?.fileConfig;
  const blockingProblems = useMemo(() => {
    if (!plan) return [];
    const dupRefs = new Set(plan.duplicates.map((d) => d.order_ref));
    return plan.problems.filter((p) => !/already in your system/.test(p.message) || !dupRefs.size);
  }, [plan]);

  return (
    <Page>
      <PageHeader
        title="Daily file"
        description="Upload the orders a marketplace sent you, and download the stock file it expects back."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild><Link to="/channels">All channels</Link></Button>
          </div>
        }
      />

      {/* ── Which channel ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[280px]">
            <Label className="text-xs text-gray-500">Channel</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder="Choose a channel" /></SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.display_name || c.platform_code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {info && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">
                Commission: {TIER_WORDS[cfg?.commission_tier ?? 'retail']}
              </span>
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">
                Stock file: {cfg?.export.format.toUpperCase()}
              </span>
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">
                Safety buffer: {info.channel.inventory_buffer_pct}%
              </span>
              {cfg?.placeholder && (
                <span className="px-2 py-1 rounded bg-amber-100 text-amber-800">
                  Column names are a starting point — the first real file you match replaces them
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && <Card><CardContent className="p-8 text-center text-gray-500"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></CardContent></Card>}

      {!loading && !connections.length && (
        <Card><CardContent className="p-8 text-center">
          <PackageSearch className="h-8 w-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">No channels are connected yet.</p>
          <Button className="mt-3" asChild><Link to="/channels">Connect a channel</Link></Button>
        </CardContent></Card>
      )}

      {!loading && info && !cfg?.file_based && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-900 flex gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>{info.channel.display_name} syncs over its own API.</strong> This page is for channels
              that work by file. You can still upload a file for it, but its stock is normally pushed
              automatically from <Link className="underline" to="/channels">Channels</Link>.
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && info?.withheld?.length ? (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-900">
            <div className="flex gap-2 font-medium"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> Not available on this store yet</div>
            <ul className="mt-2 ml-6 list-disc space-y-1">
              {info.withheld.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!loading && info && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* ── Orders in ───────────────────────────────────────────────── */}
          <div className="xl:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <UploadCloud className="h-4 w-4 text-gray-500" /> Today's orders
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Upload the order file from {info.channel.display_name}. Each order becomes a real order —
                      stock comes off, the invoice and pick list follow. An order already here is never created twice.
                    </p>
                  </div>
                  {(file || preview) && (
                    <Button variant="ghost" size="sm" onClick={resetUpload}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Start again
                    </Button>
                  )}
                </div>

                {!preview && (
                  <label className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50">
                    <input
                      ref={fileInput} type="file" className="hidden"
                      accept=".xlsx,.xls,.csv"
                      disabled={!canWrite || busy !== ''}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { setFile(f); runPreview(f); }
                      }}
                    />
                    <FileSpreadsheet className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <div className="text-sm font-medium">Choose the order file</div>
                    <div className="text-xs text-gray-500 mt-1">.xlsx or .csv, exactly as the marketplace gave it to you</div>
                    {busy === 'preview' && <Loader2 className="h-4 w-4 animate-spin mx-auto mt-3" />}
                  </label>
                )}

                {preview && (
                  <>
                    <div className="text-xs text-gray-600 mb-3">
                      <strong>{file?.name}</strong> · {preview.rowCount.toLocaleString('en-IN')} rows ·
                      columns matched from {preview.mappingSource === 'saved' ? 'your saved match'
                        : preview.mappingSource === 'channel' ? "the channel's layout"
                        : preview.mappingSource === 'mixed' ? 'your saved match and the column names'
                        : 'the column names'}
                      {' · '}
                      <button className="underline" onClick={() => setShowMatch((v) => !v)}>
                        {showMatch ? 'hide' : 'change'} the column match
                      </button>
                    </div>

                    {showMatch && (
                      <div className="border rounded-lg divide-y mb-4 max-h-[420px] overflow-y-auto">
                        {orderFields.map((f) => (
                          <div key={f.key} className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                            <div>
                              <div className="text-sm font-medium">
                                {f.label}{f.required && <span className="text-red-600"> *</span>}
                              </div>
                              <div className="text-[11px] text-gray-500">{f.does}</div>
                            </div>
                            <Select
                              value={mapping[f.key] ?? NONE}
                              onValueChange={(v) => setMapping((m) => {
                                const next = { ...m };
                                if (v === NONE) delete next[f.key]; else next[f.key] = v;
                                return next;
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not in this file" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>Not in this file</SelectItem>
                                {preview.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                        <div className="p-3 bg-gray-50 flex justify-end">
                          <Button size="sm" onClick={reRunPlan} disabled={busy !== ''}>
                            {busy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Check the file again
                          </Button>
                        </div>
                      </div>
                    )}

                    {plan && (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                          <Stat label="Orders to create" value={String(plan.totals.orders)} tone="good" />
                          <Stat label="Already here" value={String(plan.duplicates.length)} />
                          <Stat label="Units" value={String(plan.totals.units)} />
                          <Stat label="Value" value={money(plan.totals.value)} />
                        </div>

                        {plan.unmatchedSkuCount > 0 && (
                          <Notice tone="bad" icon={<AlertTriangle className="h-4 w-4" />}
                            title={`${plan.unmatchedSkuCount} product code${plan.unmatchedSkuCount === 1 ? '' : 's'} in this file are not in your catalogue`}>
                            <div className="font-mono text-[11px] break-all">{plan.unmatchedSkus.join(', ')}</div>
                            <p className="mt-1">Add them, or correct the codes in the file. Nothing is created until every line matches.</p>
                          </Notice>
                        )}

                        {blockingProblems.length > 0 && (
                          <Notice tone="bad" icon={<AlertTriangle className="h-4 w-4" />}
                            title={`${plan.problemCount} row${plan.problemCount === 1 ? '' : 's'} need attention`}>
                            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                              {plan.problems.slice(0, 25).map((p, i) => <li key={i}>{p.message}</li>)}
                            </ul>
                          </Notice>
                        )}

                        {plan.duplicates.length > 0 && (
                          <Notice tone="info" icon={<Copy className="h-4 w-4" />}
                            title={`${plan.duplicates.length} order${plan.duplicates.length === 1 ? '' : 's'} in this file are already in your system`}>
                            <div className="text-[11px]">
                              {plan.duplicates.slice(0, 20).map((d) => `${d.order_ref}${d.order_number ? ` → ${d.order_number}` : ''}`).join(' · ')}
                            </div>
                            <p className="mt-1">They will be left exactly as they are. Re-uploading yesterday's file is safe.</p>
                          </Notice>
                        )}

                        {plan.orders.length > 0 && (
                          <div className="border rounded-lg overflow-hidden mb-3">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                  <th className="text-left p-2">Marketplace order</th>
                                  <th className="text-left p-2">Date</th>
                                  <th className="text-left p-2">Buyer</th>
                                  <th className="text-right p-2">Lines</th>
                                  <th className="text-right p-2">Units</th>
                                  <th className="text-right p-2">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {plan.orders.slice(0, 50).map((o) => (
                                  <tr key={o.order_ref}>
                                    <td className="p-2 font-mono">{o.order_ref}</td>
                                    <td className="p-2">{o.order_date ?? '—'}</td>
                                    <td className="p-2">{o.buyer}{o.city ? ` · ${o.city}` : ''}</td>
                                    <td className="p-2 text-right">{o.lines}</td>
                                    <td className="p-2 text-right">{o.units}</td>
                                    <td className="p-2 text-right tabular-nums">{money(o.money.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {plan.orders.length > 50 && (
                              <div className="p-2 text-[11px] text-gray-500 bg-gray-50">
                                Showing the first 50 of {plan.totals.orders}.
                              </div>
                            )}
                          </div>
                        )}

                        {plan.orders.some((o) => o.money.difference) && (
                          <Notice tone="warn" icon={<Info className="h-4 w-4" />} title="Some orders do not add up to their own total">
                            <ul className="space-y-0.5">
                              {plan.orders.filter((o) => o.money.difference).slice(0, 10).map((o) => (
                                <li key={o.order_ref}>{o.order_ref}: {o.notes.join(' ')}</li>
                              ))}
                            </ul>
                            <p className="mt-1">We record the marketplace's own figure, because that is what the buyer paid.</p>
                          </Notice>
                        )}

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={createOrders}
                            disabled={!canWrite || busy !== '' || !plan.totals.orders || blockingProblems.length > 0 || !info.registerAvailable}
                          >
                            {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowRight className="h-4 w-4 mr-1" />}
                            Create {plan.totals.orders} order{plan.totals.orders === 1 ? '' : 's'}
                          </Button>
                        </div>
                      </>
                    )}

                    {!plan && preview.missing?.length > 0 && (
                      <Notice tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title="Match these columns to continue">
                        {preview.missing.map((m) => m.label).join(', ')}
                      </Notice>
                    )}
                  </>
                )}

                {result && (
                  <div className="mt-4">
                    <Notice
                      tone={result.rejected || result.partial ? 'bad' : 'good'}
                      icon={result.rejected || result.partial ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      title={resultMessage || (result.rejected ? 'Nothing was created' : 'Orders created')}
                    >
                      {result.created.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {result.created.slice(0, 30).map((c) => (
                            <div key={c.order_id}>
                              {c.order_ref} → <Link className="underline font-medium" to={`/orders/${c.order_id}`}>{c.order_number}</Link>
                              {' · '}{money(c.total)}{c.stock_deducted ? ' · stock taken off' : ' · stock NOT changed'}
                              {c.commission_tier ? ` · ${TIER_WORDS[c.commission_tier]}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                      {result.problems.length > 0 && (
                        <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                          {result.problems.slice(0, 25).map((p, i) => <li key={i}>{p.message}</li>)}
                        </ul>
                      )}
                    </Notice>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── History ──────────────────────────────────────────────── */}
            <Card>
              <CardContent className="p-5">
                <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                  <ClipboardList className="h-4 w-4 text-gray-500" /> Orders from this channel
                </h2>
                {!documents.length ? (
                  <p className="text-sm text-gray-500">No orders have been imported from this channel yet.</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left p-2">Marketplace order</th>
                          <th className="text-left p-2">Our order</th>
                          <th className="text-left p-2">Date</th>
                          <th className="text-left p-2">Buyer</th>
                          <th className="text-right p-2">Total</th>
                          <th className="text-left p-2">State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {documents.slice(0, 50).map((d) => (
                          <tr key={d.id}>
                            <td className="p-2 font-mono">{d.order_ref}</td>
                            <td className="p-2">
                              {d.order_id
                                ? <Link className="underline font-medium" to={`/orders/${d.order_id}`}>{d.order_number}</Link>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="p-2">{d.order_date ?? '—'}</td>
                            <td className="p-2">{d.buyer_name ?? '—'}</td>
                            <td className="p-2 text-right tabular-nums">{d.total_minor != null ? money(Number(d.total_minor) / 100) : '—'}</td>
                            <td className="p-2">{d.status}{d.error ? ` — ${d.error}` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {imports.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-medium text-gray-600 mb-1">Uploads</div>
                    <ul className="text-xs text-gray-600 space-y-0.5">
                      {imports.slice(0, 8).map((i) => (
                        <li key={i.id}>
                          {new Date(i.created_at).toLocaleString('en-IN')} · {i.file_name ?? 'file'} ·
                          {' '}{i.row_count} rows · {i.applied_count} applied · {i.skipped_count} skipped · {i.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Stock out ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
                  <Download className="h-4 w-4 text-gray-500" /> Today's stock file
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  Your stock in {info.channel.display_name}'s own layout, ready to upload to them. The quantity is
                  what they may sell — stock, less anything held by open orders, less your {info.channel.inventory_buffer_pct}% safety buffer.
                </p>
                <Button className="w-full" onClick={downloadStockFile} disabled={busy !== ''}>
                  {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                  Download the {cfg?.export.format.toUpperCase()} file
                </Button>
                <div className="mt-3 text-[11px] text-gray-500">
                  <div className="font-medium text-gray-600 mb-0.5">Columns it will have</div>
                  {info.exportColumns.map((c) => c.header).join(' · ') || 'None configured yet.'}
                </div>
                {exports.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <div className="text-xs font-medium text-gray-600 mb-1">Files produced</div>
                    <ul className="space-y-1">
                      {exports.slice(0, 8).map((j) => (
                        <li key={j.id} className="text-xs flex items-center justify-between gap-2">
                          <span className="truncate">
                            {new Date(j.created_at).toLocaleString('en-IN')} · {j.status}
                            {j.detail ? ` · ${j.detail}` : ''}
                          </span>
                          {j.status === 'ready' && (
                            <Button size="sm" variant="ghost" onClick={() => downloadJob(j.id)}>
                              <Download className="h-3 w-3" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 text-xs text-gray-600 space-y-2">
                <div className="font-semibold text-sm text-gray-800">How this channel is set up</div>
                {cfg?.notes && <p>{cfg.notes}</p>}
                <ul className="space-y-1">
                  <li><strong>Commission:</strong> {TIER_WORDS[cfg?.commission_tier ?? 'retail']} — stamped on every order this file creates.</li>
                  <li><strong>New orders arrive as:</strong> {cfg?.orders.order_status}, payment {cfg?.orders.payment_status === 'completed' ? 'already collected by the marketplace' : 'pending'}.</li>
                  <li><strong>Stock:</strong> {cfg?.orders.deduct_stock ? 'taken off when the order is created' : 'not changed'}.</li>
                  <li><strong>Prices and GST:</strong> exactly as the file states them. We never re-price a marketplace order.</li>
                </ul>
                <p className="pt-1 text-gray-500">
                  A super admin sets the columns and the commission tier for this channel.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className={`rounded-lg border p-2.5 ${tone === 'good' ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`}>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Notice({ tone, icon, title, children }: {
  tone: 'good' | 'bad' | 'warn' | 'info'; icon: React.ReactNode; title: string; children?: React.ReactNode;
}) {
  const cls = tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : tone === 'bad' ? 'border-red-200 bg-red-50 text-red-900'
    : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-blue-200 bg-blue-50 text-blue-900';
  return (
    <div className={`border rounded-lg p-3 mb-3 text-xs ${cls}`}>
      <div className="flex items-center gap-2 font-medium">{icon} {title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
