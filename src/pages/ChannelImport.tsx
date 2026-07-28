import { useEffect, useMemo, useRef, useState } from 'react';
import { channelsAPI } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '@/components/erp';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight,
  Plus, Boxes, ClipboardList, RotateCcw, Loader2, PartyPopper,
} from 'lucide-react';

type Purpose = 'inventory' | 'orders';
type Mode = 'set' | 'adjust';
type Step = 'upload' | 'match' | 'review' | 'done';

interface Connection { id: string; platform_code: string; display_name?: string; }
interface FieldDef { key: string; label: string; hint: string; required: boolean; }
interface Preview {
  channel: { id: string; display_name?: string; platform_code: string };
  purpose: Purpose;
  headers: string[];
  sampleRows: Record<string, any>[];
  rowCount: number;
  fields: FieldDef[];
  guessed: Record<string, string>;
  savedMapping: Record<string, string> | null;
  savedOptions: Record<string, any> | null;
}
interface RowProblem { row: number; message: string; field?: string }
interface ApplyResult {
  purpose: Purpose; mode: Mode | null; total: number;
  applied: number; skipped: number; problems: RowProblem[]; dryRun: boolean; importId: string | null;
  /** 'atomic' (default) = all-or-nothing; 'partial' = write the good rows only. */
  writeMode?: 'atomic' | 'partial';
  rolledBack?: boolean;
}

const NONE = '__none__';
const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload file' },
  { key: 'match', label: 'Match your columns' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

export default function ChannelImport() {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [channelId, setChannelId] = useState('');
  const [purpose, setPurpose] = useState<Purpose>('inventory');
  const [mode, setMode] = useState<Mode>('set');

  const [addingChannel, setAddingChannel] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ApplyResult | null>(null);
  const [done, setDone] = useState<ApplyResult | null>(null);
  // Imports are all-or-nothing by default; this is the explicit opt-in to write
  // only the good rows when the file still has problems.
  const [skipBadRows, setSkipBadRows] = useState(false);

  const loadConnections = async (selectId?: string) => {
    const c: Connection[] = await channelsAPI.getConnections();
    setConnections(c);
    if (selectId) setChannelId(selectId);
    else if (!channelId && c.length) setChannelId(c[0].id);
  };
  useEffect(() => { loadConnections(); /* eslint-disable-next-line */ }, []);

  const resetWizard = () => {
    setStep('upload'); setFile(null); setPreview(null); setMapping({}); setReview(null); setDone(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  // ── Create a custom channel ──────────────────────────────────────────────
  const createChannel = async () => {
    const name = newName.trim();
    if (!name) { toast({ title: 'Please give the channel a name', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const conn = await channelsAPI.createCustomChannel(name, newNotes.trim() || undefined);
      toast({ title: 'Channel added', description: name });
      setAddingChannel(false); setNewName(''); setNewNotes('');
      await loadConnections(conn?.id);
    } catch (e: any) {
      toast({ title: 'Could not add channel', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  // ── Step 1 → upload + preview ─────────────────────────────────────────────
  const onFile = async (f: File | null) => {
    if (!f) return;
    if (!channelId) { toast({ title: 'Pick a channel first', description: 'Choose or add the marketplace this file is from.', variant: 'destructive' }); return; }
    setFile(f); setBusy(true);
    try {
      const p: Preview = await channelsAPI.importPreview(channelId, f, purpose);
      setPreview(p);
      // Prefer a previously-saved match; otherwise use our auto-guess.
      const start = { ...(p.guessed || {}), ...(p.savedMapping || {}) };
      // Drop any saved header that no longer exists in this file.
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(start)) if (p.headers.includes(v as string)) cleaned[k] = v as string;
      setMapping(cleaned);
      if (p.savedOptions?.mode === 'set' || p.savedOptions?.mode === 'adjust') setMode(p.savedOptions.mode);
      setStep('match');
    } catch (e: any) {
      toast({ title: 'Could not read that file', description: e?.response?.data?.message || e.message, variant: 'destructive' });
      setFile(null);
    } finally { setBusy(false); }
  };

  // ── Step 2 → review (dry run) ─────────────────────────────────────────────
  const missingRequired = useMemo(
    () => (preview?.fields || []).filter((f) => f.required && !mapping[f.key]).map((f) => f.label),
    [preview, mapping],
  );

  const goReview = async () => {
    if (!file || !preview) return;
    if (missingRequired.length) { toast({ title: 'Almost there', description: `Please match: ${missingRequired.join(', ')}`, variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const r: ApplyResult = await channelsAPI.importApply(channelId, file, { purpose, mapping, mode, dryRun: true });
      setReview(r); setSkipBadRows(false); setStep('review');
    } catch (e: any) {
      toast({ title: 'Could not check the file', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  // ── Step 3 → apply for real ───────────────────────────────────────────────
  const apply = async () => {
    if (!file || !preview) return;
    setBusy(true);
    try {
      const r: ApplyResult = await channelsAPI.importApply(channelId, file, {
        purpose, mapping, mode, dryRun: false, writeMode: skipBadRows ? 'partial' : 'atomic',
      });
      setDone(r); setStep('done');
      toast({ title: 'Import complete', description: `${r.applied} ${purpose === 'inventory' ? 'products updated' : 'orders recorded'}` });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const setField = (key: string, header: string) => {
    setMapping((m) => {
      const next = { ...m };
      if (header === NONE) delete next[key]; else next[key] = header;
      return next;
    });
  };
  const sampleFor = (header?: string): string => {
    if (!header || !preview) return '';
    return preview.sampleRows.map((r) => r[header]).filter((v) => v !== undefined && v !== null && String(v).trim() !== '').slice(0, 3).map(String).join(',  ');
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <Page width="narrow">
      <PageHeader
        icon={FileSpreadsheet}
        title="Import from Excel"
        description={<>Sell somewhere without an app connection (like Tata 1mg)? Download their Excel and upload it here — we will match your columns and update your stock, or record the orders.{' '}
          <Link to="/channels" className="font-medium text-gray-900 hover:underline">Channels</Link></>}
      />

      {/* Channel + what are we doing */}
      <Card><CardContent className="p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Which channel is this file from?</Label>
            <div className="flex gap-2 mt-1">
              <Select value={channelId} onValueChange={(v) => { setChannelId(v); resetWizard(); }}>
                <SelectTrigger data-testid="channel-select"><SelectValue placeholder="Choose a channel…" /></SelectTrigger>
                <SelectContent>
                  {connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name || c.platform_code}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setAddingChannel((s) => !s)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
            </div>
            {connections.length === 0 && !addingChannel && (
              <p className="text-xs text-muted-foreground mt-1">No channels yet. Click <b>Add</b> to create one (e.g. "Tata 1mg").</p>
            )}
          </div>

          <div>
            <Label>What do you want to do?</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => { setPurpose('inventory'); resetWizard(); }}
                className={`flex items-start gap-2 rounded-lg border p-2 text-left text-sm ${purpose === 'inventory' ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border'}`}>
                <Boxes className="h-4 w-4 mt-0.5 shrink-0" />
                <span><span className="font-medium">Update my stock</span><br /><span className="text-xs text-muted-foreground">Set stock levels from this file</span></span>
              </button>
              <button type="button" onClick={() => { setPurpose('orders'); resetWizard(); }}
                className={`flex items-start gap-2 rounded-lg border p-2 text-left text-sm ${purpose === 'orders' ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border'}`}>
                <ClipboardList className="h-4 w-4 mt-0.5 shrink-0" />
                <span><span className="font-medium">Record orders</span><br /><span className="text-xs text-muted-foreground">Save marketplace orders to your register</span></span>
              </button>
            </div>
          </div>
        </div>

        {addingChannel && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <Label>New channel name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tata 1mg" />
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Anything to remember about this channel" />
            <div className="flex gap-2">
              <Button size="sm" onClick={createChannel} disabled={busy}>Save channel</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingChannel(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent></Card>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${i <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
            <span className={i === stepIndex ? 'font-medium' : 'text-muted-foreground'}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
          </div>
        ))}
      </div>

      {/* STEP 1 — UPLOAD */}
      {step === 'upload' && (
        <Card><CardContent className="p-6">
          <label
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center cursor-pointer hover:bg-muted/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] ?? null); }}
          >
            {busy ? <Loader2 className="h-10 w-10 text-primary animate-spin" /> : <UploadCloud className="h-10 w-10 text-primary" />}
            <div className="font-medium">Upload the Excel you downloaded from the marketplace</div>
            <div className="text-xs text-muted-foreground">Click to choose, or drag the file here — .xlsx, .xls or .csv</div>
            <input
              ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" data-testid="file-input"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {!channelId && <p className="text-xs text-amber-600 mt-2 text-center">Choose a channel above before uploading.</p>}
        </CardContent></Card>
      )}

      {/* STEP 2 — MATCH */}
      {step === 'match' && preview && (
        <Card><CardContent className="p-5 space-y-4">
          <div className="text-sm">
            We found <b>{preview.headers.length}</b> columns and <b>{preview.rowCount}</b> rows in <b>{file?.name}</b>.
            Match your columns to ours below — we filled in the obvious ones{preview.savedMapping ? ' (and remembered your last match)' : ''}.
          </div>

          {purpose === 'inventory' && (
            <div className="rounded-lg border p-3">
              <Label className="text-xs">How should we use the quantity?</Label>
              <div className="grid sm:grid-cols-2 gap-2 mt-1">
                <button type="button" onClick={() => setMode('set')}
                  className={`rounded-lg border p-2 text-left text-sm ${mode === 'set' ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}>
                  <span className="font-medium">Set stock to this number</span><br />
                  <span className="text-xs text-muted-foreground">The file has the exact stock on hand (most common)</span>
                </button>
                <button type="button" onClick={() => setMode('adjust')}
                  className={`rounded-lg border p-2 text-left text-sm ${mode === 'adjust' ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}>
                  <span className="font-medium">Add / subtract this number</span><br />
                  <span className="text-xs text-muted-foreground">The file has a change (e.g. +5 received, −2 sold)</span>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {preview.fields.map((f) => (
              <div key={f.key} className="grid md:grid-cols-2 gap-2 items-start border-b pb-3 last:border-0">
                <div>
                  <div className="text-sm font-medium">{f.label}{f.required && <span className="text-red-500"> *</span>}</div>
                  <div className="text-xs text-muted-foreground">{f.hint}</div>
                </div>
                <div>
                  <Select value={mapping[f.key] ?? NONE} onValueChange={(v) => setField(f.key, v)}>
                    <SelectTrigger data-testid={`map-${f.key}`}><SelectValue placeholder="Choose your column…" /></SelectTrigger>
                    <SelectContent>
                      {!f.required && <SelectItem value={NONE}>— not in my file —</SelectItem>}
                      {preview.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {mapping[f.key] && (
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      From your file: <span className="font-mono">{sampleFor(mapping[f.key]) || '(blank)'}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={resetWizard}><ArrowLeft className="h-4 w-4 mr-1" /> Start over</Button>
            <Button onClick={goReview} disabled={busy || missingRequired.length > 0}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />} Next: Review
            </Button>
          </div>
        </CardContent></Card>
      )}

      {/* STEP 3 — REVIEW */}
      {step === 'review' && review && (
        <Card><CardContent className="p-5 space-y-4">
          <div className="rounded-lg bg-green-50 border border-green-200 p-4">
            <div className="flex items-center gap-2 text-green-800 font-medium">
              <CheckCircle2 className="h-5 w-5" />
              {purpose === 'inventory'
                ? <>We will update stock for <b>{review.applied}</b> product{review.applied === 1 ? '' : 's'}.</>
                : <>We will record <b>{review.applied}</b> order line{review.applied === 1 ? '' : 's'}.</>}
            </div>
            {purpose === 'inventory' && (
              <div className="text-sm text-green-700 mt-1">
                Mode: {mode === 'set' ? 'set stock to the number in the file' : 'add / subtract the number in the file'}.
              </div>
            )}
          </div>

          {review.problems.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
                <AlertTriangle className="h-5 w-5" /> {review.problems.length} row{review.problems.length === 1 ? ' has' : 's have'} a problem — nothing will be imported until they are fixed
              </div>
              <ul className="text-sm text-amber-900 space-y-1 max-h-56 overflow-y-auto list-disc pl-5">
                {review.problems.map((p, i) => <li key={i}>{p.message}</li>)}
              </ul>
              <label className="mt-3 flex items-start gap-2 text-sm text-amber-900">
                <input type="checkbox" className="mt-0.5" checked={skipBadRows} onChange={(e) => setSkipBadRows(e.target.checked)} />
                <span>
                  Import the {review.applied} good row{review.applied === 1 ? '' : 's'} anyway and skip{' '}
                  {review.problems.length === 1 ? 'this row' : `these ${review.problems.length} rows`}.
                  <span className="block text-xs text-amber-700">
                    Leave this unticked to fix the file and upload it again — safest, because a half-finished
                    import is hard to undo.
                  </span>
                </span>
              </label>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {review.total} rows in the file · {review.applied} ready · {review.skipped} with problems. Nothing has changed yet.
          </p>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('match')}><ArrowLeft className="h-4 w-4 mr-1" /> Back to columns</Button>
            <Button onClick={apply} disabled={busy || review.applied === 0 || (review.problems.length > 0 && !skipBadRows)}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {purpose === 'inventory' ? 'Apply — update my stock' : 'Apply — record these orders'}
            </Button>
          </div>
        </CardContent></Card>
      )}

      {/* DONE */}
      {step === 'done' && done && (
        <Card><CardContent className="p-6 space-y-4 text-center">
          <PartyPopper className="h-12 w-12 text-primary mx-auto" />
          <div className="text-lg font-semibold">All done!</div>
          <div className="text-sm">
            {purpose === 'inventory'
              ? <><b>{done.applied}</b> product{done.applied === 1 ? '' : 's'} updated</>
              : <><b>{done.applied}</b> order line{done.applied === 1 ? '' : 's'} recorded</>}
            {done.skipped > 0 && <> · <b>{done.skipped}</b> skipped</>}
          </div>
          <p className="text-xs text-muted-foreground">We saved your column match for this channel — next time it is one click.</p>

          {done.problems.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-left">
              <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
                <AlertTriangle className="h-4 w-4" /> Skipped rows
              </div>
              <ul className="text-sm text-amber-900 space-y-1 max-h-56 overflow-y-auto list-disc pl-5">
                {done.problems.map((p, i) => <li key={i}>{p.message}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-center gap-2">
            <Button onClick={resetWizard}><RotateCcw className="h-4 w-4 mr-1" /> Import another file</Button>
            {purpose === 'orders' && <Button variant="outline" asChild><Link to="/channels">Back to channels</Link></Button>}
          </div>
        </CardContent></Card>
      )}
    </Page>
  );
}
