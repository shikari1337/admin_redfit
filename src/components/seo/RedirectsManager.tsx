import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Plus, Trash2, Upload, Download, FlaskConical, History, Power,
  Search, ArrowRight, AlertTriangle, CheckCircle2, FileText, Info,
} from 'lucide-react';
import { seoAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '../../utils/date';

/**
 * URL redirects, grouped — admin ▸ SEO & Analytics.
 *
 * Replaces a two-column from/to table that could only express "this exact path
 * goes to that exact path". The store's real problem was a BRAND rename, which
 * moves one segment inside thousands of URLs at once; the rules behind this
 * screen come in three kinds and are created automatically when a slug changes.
 *
 * Everything here is grouped by what the rule is ABOUT (brand / product /
 * category / page / blog / manual), because that is the unit an owner wants to
 * reason about and switch off — "turn off the brand redirects" is a real request
 * and used to be impossible.
 */

interface Rule {
  id: string;
  source_path: string;
  target_path: string;
  match_type: 'exact' | 'prefix' | 'segment';
  path_prefix: string | null;
  segment_index: number | null;
  status_code: number;
  entity_type: string;
  entity_name: string | null;
  is_active: boolean;
  is_auto: boolean;
  note: string | null;
  hit_count: number | string;
  last_hit_at: string | null;
  created_at: string;
}

const GROUP_LABEL: Record<string, string> = {
  brand: 'Brands', product: 'Products', category: 'Categories',
  page: 'Pages', blog: 'Blog posts', attribute: 'Variant pages', manual: 'Manual',
};

const MATCH_HELP: Record<string, string> = {
  exact: 'This one URL only.',
  prefix: 'This URL and everything under it — the rest of the path is carried across.',
  segment: 'One segment inside many URLs (e.g. the brand in /product/{brand}/…). One rule covers every URL that carries it.',
};

/** How a rule reads in the "from" column, including the segment case. */
function sourceLabel(r: Rule): string {
  if (r.match_type === 'segment') return `${r.path_prefix}/…/${r.source_path}/…`;
  if (r.match_type === 'prefix') return `${r.source_path}/*`;
  return r.source_path;
}
function targetLabel(r: Rule): string {
  if (r.match_type === 'segment') return `${r.path_prefix}/…/${r.target_path}/…`;
  if (r.match_type === 'prefix') return `${r.target_path}/*`;
  return r.target_path;
}

const download = (name: string, text: string, mime = 'text/csv') => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
};

export default function RedirectsManager({ canManage }: { canManage: boolean }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [groups, setGroups] = useState<Array<{ entity_type: string; total: number; active: number }>>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('all');

  // Add form
  const [form, setForm] = useState({ source: '', target: '', match_type: 'exact', path_prefix: '/product', segment_index: '1', status_code: '301' });

  // Tester
  const [testPath, setTestPath] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // CSV
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<any>(null);

  // History + log + score
  const [history, setHistory] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [score, setScore] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Two calls, not one: the axios interceptor unwraps the response envelope
      // to `data`, so the list route's `meta` (group counts + master switch)
      // never survives to a caller here. The counts are derivable from the rules
      // themselves, and /seo/redirects/config carries the switch inside `data`.
      const [rows, cfg] = await Promise.all([
        seoAPI.getRedirects(),
        seoAPI.getRedirectConfig().catch(() => null),
      ]);
      const list: Rule[] = Array.isArray(rows) ? rows : [];
      setRules(list);
      const counts = new Map<string, { entity_type: string; total: number; active: number }>();
      for (const r of list) {
        const g = counts.get(r.entity_type) ?? { entity_type: r.entity_type, total: 0, active: 0 };
        g.total += 1;
        if (r.is_active) g.active += 1;
        counts.set(r.entity_type, g);
      }
      setGroups([...counts.values()]);
      setEnabled(cfg?.enabled !== false);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load redirects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadInsights = useCallback(async () => {
    const [h, l, s] = await Promise.all([
      seoAPI.getSlugHistory({ limit: 100 }).catch(() => []),
      seoAPI.getRedirectLog({ limit: 100 }).catch(() => []),
      seoAPI.getRedirectScore(90).catch(() => null),
    ]);
    setHistory(Array.isArray(h) ? h : []);
    setLog(Array.isArray(l) ? l : []);
    setScore(s);
  }, []);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 4000); };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (activeGroup !== 'all' && r.entity_type !== activeGroup) return false;
      if (!q) return true;
      return [r.source_path, r.target_path, r.entity_name, r.note].some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [rules, search, activeGroup]);

  const grouped = useMemo(() => {
    const map = new Map<string, Rule[]>();
    for (const r of visible) {
      if (!map.has(r.entity_type)) map.set(r.entity_type, []);
      map.get(r.entity_type)!.push(r);
    }
    return [...map.entries()];
  }, [visible]);

  const act = async (key: string, fn: () => Promise<any>, done?: string) => {
    setBusy(key); setError('');
    try { await fn(); await load(); if (done) flash(done); }
    catch (e: any) { setError(e?.response?.data?.message || 'That did not work'); }
    finally { setBusy(null); }
  };

  const addRule = () => act('add', async () => {
    if (!form.source.trim() || !form.target.trim()) throw { response: { data: { message: 'Enter both a source and a target URL' } } };
    await seoAPI.createRedirect({
      source_path: form.source.trim(),
      target_path: form.target.trim(),
      match_type: form.match_type,
      path_prefix: form.match_type === 'segment' ? form.path_prefix : null,
      segment_index: form.match_type === 'segment' ? Number(form.segment_index) : null,
      status_code: Number(form.status_code),
    });
    setForm((f) => ({ ...f, source: '', target: '' }));
  }, 'Redirect added');

  const runTest = async () => {
    if (!testPath.trim()) return;
    setTesting(true);
    try { setTestResult(await seoAPI.testRedirect(testPath.trim())); }
    catch (e: any) { setError(e?.response?.data?.message || 'Test failed'); }
    finally { setTesting(false); }
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setBusy('import'); setError(''); setImportResult(null);
    try {
      const res = await seoAPI.importRedirectsCsv(text);
      setImportResult(res?.data ?? null);
      flash(res?.message || 'Import finished');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Import failed');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const groupCount = (t: string) => groups.find((g) => g.entity_type === t);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">URL redirects</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Old URLs keep working after a rename. A brand, product, category, page or blog slug
              change creates its redirects automatically — including the ones buried inside product URLs.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Power className={`h-4 w-4 ${enabled ? 'text-emerald-600' : 'text-muted-foreground'}`} />
            <Label htmlFor="rd-master" className="text-xs font-medium">
              {enabled ? 'Redirects are on' : 'All redirects are off'}
            </Label>
            <Switch
              id="rd-master"
              checked={enabled}
              disabled={!canManage || busy === 'master'}
              onCheckedChange={(v) => act('master', () => seoAPI.setRedirectConfig(v),
                v ? 'Redirects switched on' : 'Redirects switched off — every old URL now 404s again')}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />{notice}
          </div>
        )}

        <Tabs defaultValue="rules" onValueChange={(v) => { if (v === 'insights') loadInsights(); }}>
          <TabsList>
            <TabsTrigger value="rules">Rules{rules.length ? ` (${rules.length})` : ''}</TabsTrigger>
            <TabsTrigger value="bulk">Bulk CSV</TabsTrigger>
            <TabsTrigger value="insights">History &amp; log</TabsTrigger>
          </TabsList>

          {/* ── Rules ─────────────────────────────────────── */}
          <TabsContent value="rules" className="space-y-4 pt-4">
            {/* Add */}
            {canManage && (
              <div className="rounded-md border p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{form.match_type === 'segment' ? 'Old segment' : 'Old URL'}</Label>
                    <Input
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                      placeholder={form.match_type === 'segment' ? 'schwabe-india' : '/brand/schwabe-india'}
                      className="h-9 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{form.match_type === 'segment' ? 'New segment' : 'New URL'}</Label>
                    <Input
                      value={form.target}
                      onChange={(e) => setForm({ ...form, target: e.target.value })}
                      placeholder={form.match_type === 'segment' ? 'dr-willmar-schwabe-india' : '/brand/dr-willmar-schwabe-india'}
                      className="h-9 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Match</Label>
                    <Select value={form.match_type} onValueChange={(v) => setForm({ ...form, match_type: v })}>
                      <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exact">Exact URL</SelectItem>
                        <SelectItem value="prefix">URL + below</SelectItem>
                        <SelectItem value="segment">Segment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">&nbsp;</Label>
                    <Button onClick={addRule} disabled={busy === 'add'} className="h-9">
                      {busy === 'add' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                      Add
                    </Button>
                  </div>
                </div>

                {form.match_type === 'segment' && (
                  <div className="mt-2 grid gap-2 md:grid-cols-[200px_160px_1fr]">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Under path</Label>
                      <Input value={form.path_prefix} onChange={(e) => setForm({ ...form, path_prefix: e.target.value })} className="h-9 font-mono text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Segment position</Label>
                      <Input type="number" min={0} value={form.segment_index} onChange={(e) => setForm({ ...form, segment_index: e.target.value })} className="h-9" />
                    </div>
                  </div>
                )}

                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  {MATCH_HELP[form.match_type]} You can paste a full address —
                  <span className="font-mono"> https://www.site.com/x/ </span> and
                  <span className="font-mono"> /x </span> are stored as the same rule and both keep matching.
                </p>
              </div>
            )}

            {/* Tester */}
            <div className="rounded-md border p-3">
              <Label className="text-xs font-medium">Test a URL</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  value={testPath}
                  onChange={(e) => setTestPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runTest()}
                  placeholder="/product/schwabe-india/apocynum-cannabinum/30c/100-ml"
                  className="h-9 font-mono text-sm"
                />
                <Button variant="outline" onClick={runTest} disabled={testing} className="h-9">
                  {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1.5 h-4 w-4" />}
                  Test
                </Button>
              </div>
              {testResult && (
                <div className="mt-2 rounded bg-muted/50 p-2 text-sm">
                  {testResult.redirected ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                        <span>{testResult.path}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-semibold">{testResult.target}</span>
                        <Badge variant="secondary">{testResult.status}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {testResult.rules?.length > 1
                          ? `${testResult.rules.length} rules combined into one redirect: `
                          : 'Matched by: '}
                        {(testResult.rules ?? []).map((r: any) => r.source_path).join(' → ')}
                      </p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">No redirect — this URL is served as-is.</span>
                  )}
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search redirects…" className="h-9 pl-8" />
              </div>
              <Button variant={activeGroup === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setActiveGroup('all')}>
                All ({rules.length})
              </Button>
              {Object.keys(GROUP_LABEL).map((t) => {
                const g = groupCount(t);
                if (!g?.total) return null;
                return (
                  <Button key={t} variant={activeGroup === t ? 'default' : 'outline'} size="sm" onClick={() => setActiveGroup(t)}>
                    {GROUP_LABEL[t]} ({g.total})
                  </Button>
                );
              })}
            </div>

            {loading ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…
              </div>
            ) : grouped.length === 0 ? (
              <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                No redirects yet. Rename a brand, product or category and its redirect appears here automatically.
              </div>
            ) : grouped.map(([type, list]) => {
              const g = groupCount(type);
              return (
                <div key={type} className="rounded-md border">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{GROUP_LABEL[type] ?? type}</span>
                      <Badge variant="secondary">{list.length}</Badge>
                      {g && g.active < g.total && (
                        <span className="text-[11px] text-muted-foreground">{g.total - g.active} off</span>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          disabled={busy === `on-${type}`}
                          onClick={() => act(`on-${type}`, () => seoAPI.bulkRedirects({ action: 'enable', entityType: type }), `${GROUP_LABEL[type] ?? type} redirects switched on`)}>
                          Enable all
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          disabled={busy === `off-${type}`}
                          onClick={() => act(`off-${type}`, () => seoAPI.bulkRedirects({ action: 'disable', entityType: type }), `${GROUP_LABEL[type] ?? type} redirects switched off`)}>
                          Disable all
                        </Button>
                      </div>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead className="w-24">Match</TableHead>
                        <TableHead className="w-16 text-right">Used</TableHead>
                        <TableHead className="w-20">On</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((r) => (
                        <TableRow key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                          <TableCell className="font-mono text-xs">
                            {sourceLabel(r)}
                            {r.entity_name && <div className="mt-0.5 font-sans text-[11px] text-muted-foreground">{r.entity_name}</div>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{targetLabel(r)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{r.match_type}</Badge>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              {r.status_code}{r.is_auto ? ' · auto' : ''}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {Number(r.hit_count) || 0}
                            {r.last_hit_at && <div className="text-[10px] text-muted-foreground">{formatDateTime(r.last_hit_at)}</div>}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={r.is_active}
                              disabled={!canManage || busy === r.id}
                              onCheckedChange={(v) => act(r.id, () => seoAPI.updateRedirect(r.id, { is_active: v }))}
                            />
                          </TableCell>
                          <TableCell>
                            {canManage && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                                onClick={() => {
                                  if (!confirm(`Delete the redirect from ${sourceLabel(r)}?\n\nThe old URL will 404 again.`)) return;
                                  act(r.id, () => seoAPI.deleteRedirectById(r.id), 'Redirect deleted');
                                }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </TabsContent>

          {/* ── Bulk CSV ──────────────────────────────────── */}
          <TabsContent value="bulk" className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={async () => download('redirects-template.csv', await seoAPI.redirectsCsvTemplate())}>
                <FileText className="mr-1.5 h-4 w-4" />Download template
              </Button>
              <Button variant="outline" onClick={async () => download('redirects.csv', await seoAPI.exportRedirectsCsv())}>
                <Download className="mr-1.5 h-4 w-4" />Export all rules
              </Button>
              {canManage && (
                <>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
                  <Button onClick={() => fileRef.current?.click()} disabled={busy === 'import'}>
                    {busy === 'import' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                    Import CSV
                  </Button>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Two columns is enough — <span className="font-mono">source,target</span> — and a header row is optional.
              Paste a Search Console 404 export straight in: full addresses, <span className="font-mono">www</span>,
              <span className="font-mono"> http</span>, trailing slashes and query strings are all reduced to the same rule.
              Re-importing an export you have not edited changes nothing.
            </p>

            {importResult && (
              <div className="rounded-md border">
                <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2 text-sm">
                  <span><b>{importResult.created}</b> created</span>
                  <span><b>{importResult.updated}</b> updated</span>
                  <span><b>{importResult.skipped}</b> skipped</span>
                  <span className={importResult.failed ? 'text-destructive' : ''}>
                    <b>{importResult.failed}</b> failed
                  </span>
                </div>
                <div className="max-h-72 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Line</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="w-24">Result</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(importResult.rows ?? []).map((r: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs tabular-nums">{r.line}</TableCell>
                          <TableCell className="font-mono text-xs">{r.source}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === 'failed' ? 'destructive' : r.status === 'skipped' ? 'secondary' : 'outline'}
                              className="text-[10px]">{r.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.message ?? ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── History, log and variant score ────────────── */}
          <TabsContent value="insights" className="space-y-5 pt-4">
            {score && Number(score.total) > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">How visitors arrive ({score.days} days)</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['With www', score.with_www, 'Without www', score.without_www],
                    ['https', score.https, 'http', score.http],
                    ['Trailing slash', score.with_trailing_slash, 'No slash', score.without_trailing_slash],
                    ['With query', score.with_query, 'No query', score.without_query],
                  ].map(([aL, aV, bL, bV]) => (
                    <div key={String(aL)} className="rounded-md border p-2.5">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">{aL}</span><b className="tabular-nums">{Number(aV) || 0}</b></div>
                      <div className="mt-1 flex justify-between text-xs"><span className="text-muted-foreground">{bL}</span><b className="tabular-nums">{Number(bV) || 0}</b></div>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  All of these forms match the same rule — this is just what real traffic looks like.
                  {' '}{Number(score.total)} redirects served across {Number(score.distinct_paths)} URLs.
                </p>
              </div>
            )}

            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <History className="h-4 w-4" />URL edit history
              </h4>
              <div className="max-h-80 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>What</TableHead><TableHead>Old URL</TableHead>
                      <TableHead>New URL</TableHead><TableHead className="w-40">When / who</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        No slug changes recorded yet.
                      </TableCell></TableRow>
                    ) : history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px]">{GROUP_LABEL[h.entity_type] ?? h.entity_type}</Badge>
                          {h.entity_name && <div className="mt-0.5 text-muted-foreground">{h.entity_name}</div>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{h.old_url ?? h.old_slug}</TableCell>
                        <TableCell className="font-mono text-xs">{h.new_url ?? h.new_slug}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {formatDateTime(h.changed_at)}
                          <div>{h.changed_by ?? '—'}{h.source === 'reconstructed' ? ' · entered later' : ''}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Redirect log</h4>
              <div className="max-h-80 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requested</TableHead><TableHead>Sent to</TableHead>
                      <TableHead className="w-20">Code</TableHead><TableHead className="w-36">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        Nothing logged yet — entries appear once a visitor actually follows a redirect.
                      </TableCell></TableRow>
                    ) : log.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-[11px] break-all">{l.source_url}</TableCell>
                        <TableCell className="font-mono text-[11px] break-all">{l.target_url}</TableCell>
                        <TableCell className="text-xs">{l.status_code}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">{formatDateTime(l.hit_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
