import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Save, ExternalLink, Loader2, Lock, Globe, KeyRound, Puzzle, Building2, Code2, ChevronRight, RefreshCw, AlertTriangle, Info, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { settingsRegistryAPI, productsAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '../utils/date';
import SettingFieldControl, { summarizeField, type RegistryField, type FieldOption } from '../components/settings/SettingFieldControl';
import {
  canonicalVariationName,
  DEFAULT_CATALOG_NAME_ORDER,
  type CatalogNamePart,
  type VariationNameParts,
} from '@/lib/variationName';

/* ────────────────────────── types (mirror the backend registry) ────────────────────────── */

interface RegistryGroup { id: string; no: number; label: string; description: string; help?: string }
interface RegistryPage { code: string; path: string; label: string; permission?: string; module?: string; hint?: string }
type CenterField = RegistryField & { code: string; help?: string };
interface RegistryDef {
  key: string; no: number; code: string; title: string; description: string; help?: string; technical?: string; group: string;
  scope: 'store' | 'platform' | 'code' | 'virtual';
  permission: { read: string; write: string };
  module?: string; isPublic?: boolean; secret?: boolean; plainSecret?: boolean; readonly?: boolean; note?: string;
  fields: CenterField[]; consumers: string[]; page?: { path: string; label: string }; keywords?: string[]; related?: string[];
  value: any; canWrite: boolean; updatedAt: string | null; options: Record<string, FieldOption[]>; secretsStored: string[]; exists: boolean;
}
interface CenterView {
  groups: RegistryGroup[]; definitions: RegistryDef[]; pages: RegistryPage[];
  unregistered: Array<{ key: string; grp: string | null; is_public: boolean }>;
  meta: { slug: string | null; environment: 'live' | 'test'; timezone: string; permissions: string[] };
}

const PAGES_GROUP = '__pages';
const UNREGISTERED_GROUP = '__unregistered';

const getPath = (obj: any, path: string): any => (!path ? obj : path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj));

/* ────────────────────────── search ────────────────────────── */

/** A token matches only at a word boundary: whole word = 1, word prefix = 0.5, never a raw substring. */
const wordHit = (hay: string, t: string): number => {
  if (!hay) return 0;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay)) return 1;
  if (new RegExp(`(^|[^a-z0-9])${esc}`).test(hay)) return 0.5;
  return 0;
};
const isCodeQuery = (q: string) => /^\d+(\.\d+)*$/.test(q.trim()) || /^p\d+$/i.test(q.trim());

/** AND over tokens; a number query ("2.1") matches by code first. */
function scoreDef(d: RegistryDef, q: string): number {
  const query = q.trim().toLowerCase();
  if (!query) return 1;
  if (isCodeQuery(query)) {
    if (d.code === query) return 100;
    if (d.code.startsWith(query + '.') || query.startsWith(d.code + '.')) return 60;
    if (d.code.split('.')[0] === query) return 40;
    return 0;
  }
  const toks = query.split(/\s+/).filter(Boolean);
  const hay = {
    title: d.title.toLowerCase(), key: d.key.toLowerCase().replace(/[._]/g, ' '), kw: (d.keywords ?? []).join(' ').toLowerCase(),
    fields: d.fields.map((f) => `${f.label} ${f.description ?? ''} ${f.help ?? ''}`).join(' ').toLowerCase(),
    desc: `${d.description} ${d.help ?? ''}`.toLowerCase(), page: d.page?.label.toLowerCase() ?? '', cons: `${d.consumers.join(' ')} ${d.technical ?? ''}`.toLowerCase(),
  };
  let s = 0;
  for (const t of toks) {
    const best = Math.max(wordHit(hay.title, t) * 10, wordHit(hay.key, t) * 8, wordHit(hay.kw, t) * 7, wordHit(hay.fields, t) * 5, wordHit(hay.desc, t) * 3, wordHit(hay.page, t) * 2, wordHit(hay.cons, t) * 1);
    if (!best) return 0;
    s += best;
  }
  if (d.scope === 'code') s -= 4;
  return Math.max(0.1, s);
}
function scorePage(p: RegistryPage, q: string): number {
  const query = q.trim().toLowerCase();
  if (!query) return 1;
  if (isCodeQuery(query)) return p.code.toLowerCase() === query ? 100 : 0;
  const toks = query.split(/\s+/).filter(Boolean);
  const hay = `${p.label} ${p.hint ?? ''} ${p.path}`.toLowerCase();
  return toks.every((t) => wordHit(hay, t) > 0) ? 4 : 0;
}

const scopeBadge = (d: RegistryDef) => {
  if (d.scope === 'platform') return { icon: Building2, text: 'Set by platform', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (d.scope === 'code') return { icon: Code2, text: 'Fixed limits', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  return null;
};

/* ────────────────────────── (i) help ────────────────────────── */

/** The (i) button: click toggles an inline explanation. Works with keyboard and touch. */
const InfoButton: React.FC<{ open: boolean; onToggle: () => void; label: string }> = ({ open, onToggle, label }) => (
  <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`About ${label}`} title="What is this?"
    className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none align-middle ${open ? 'border-primary bg-primary text-white' : 'border-gray-400 text-gray-500 hover:border-primary hover:text-primary'}`}>
    i
  </button>
);
const HelpPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950">{children}</div>
);

/* ────────────────────────── page ────────────────────────── */

const SettingsCenter: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<CenterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [groupId, setGroupId] = useState<string>(params.get('group') ?? '');
  const [selectedKey, setSelectedKey] = useState<string | null>(params.get('key'));
  const [groupHelpOpen, setGroupHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data: CenterView = await settingsRegistryAPI.get();
      setView(data);
      const linked = params.get('key') ? data.definitions.find((d) => d.key === params.get('key')) : null;
      setGroupId((g) => g || linked?.group || [...data.groups].sort((a, b) => a.no - b.no).find((grp) => data.definitions.some((d) => d.group === grp.id))?.id || '');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load settings');
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  // The URL mirrors the state so any setting is linkable (/settings?key=cod) and survives a reload.
  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (groupId) next.set('group', groupId);
    if (selectedKey) next.set('key', selectedKey);
    setParams(next, { replace: true });
  }, [query, groupId, selectedKey, setParams]);

  // "/" focuses search from anywhere on the page; Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) { setQuery(''); searchRef.current?.blur(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searching = query.trim().length > 0;

  const groups = useMemo(() => {
    if (!view) return [];
    return [...view.groups].sort((a, b) => a.no - b.no)
      .map((g) => ({ ...g, count: view.definitions.filter((d) => d.group === g.id).length }))
      .filter((g) => g.count > 0);
  }, [view]);
  const currentGroup = groups.find((g) => g.id === groupId);

  const listDefs = useMemo(() => {
    if (!view) return [];
    if (searching) {
      return view.definitions.map((d) => ({ d, s: scoreDef(d, query) })).filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.d.code.localeCompare(b.d.code, undefined, { numeric: true })).map((x) => x.d);
    }
    if (groupId === PAGES_GROUP || groupId === UNREGISTERED_GROUP) return [];
    return view.definitions.filter((d) => d.group === groupId).sort((a, b) => a.no - b.no);
  }, [view, searching, query, groupId]);

  const listPages = useMemo(() => {
    if (!view) return [];
    if (searching) return view.pages.filter((p) => scorePage(p, query) > 0);
    return groupId === PAGES_GROUP ? view.pages : [];
  }, [view, searching, query, groupId]);

  const selected = useMemo(() => view?.definitions.find((d) => d.key === selectedKey) ?? null, [view, selectedKey]);

  // Keep the selection valid; on a NEW query jump to the top-ranked hit.
  const lastQueryRef = useRef(query);
  useEffect(() => {
    if (!view) return;
    const queryChanged = lastQueryRef.current !== query;
    lastQueryRef.current = query;
    if (queryChanged && searching && listDefs.length) { setSelectedKey(listDefs[0].key); return; }
    if (selectedKey && listDefs.some((d) => d.key === selectedKey)) return;
    if (listDefs.length) setSelectedKey(listDefs[0].key);
    else if (!searching && groupId !== PAGES_GROUP && groupId !== UNREGISTERED_GROUP) setSelectedKey(null);
  }, [view, listDefs, selectedKey, searching, groupId, query]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (!listDefs.length) return;
    const i = Math.max(0, listDefs.findIndex((d) => d.key === selectedKey));
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedKey(listDefs[Math.min(listDefs.length - 1, i + 1)].key); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedKey(listDefs[Math.max(0, i - 1)].key); }
  };

  const replaceDef = (next: RegistryDef) => setView((v) => v ? { ...v, definitions: v.definitions.map((d) => (d.key === next.key ? next : d)) } : v);
  const jumpTo = (key: string) => { const t = view?.definitions.find((d) => d.key === key); if (t) { setQuery(''); setGroupId(t.group); setSelectedKey(key); } };

  if (loading && !view) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings…</div>;
  }
  if (error && !view) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        <Button className="mt-3" variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button>
      </div>
    );
  }
  if (!view) return null;

  return (
    <div className="-m-4 md:-m-6 lg:-m-8 flex h-[calc(100vh-3.5rem)] flex-col bg-white">
      {/* ── Command bar ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-2.5">
        <div className="relative min-w-[260px] flex-1 max-w-2xl">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onListKey}
            placeholder='Search by name or number — e.g. "cash on delivery", "otp", "2.1"   ( / to focus )'
            className="h-9 pl-8" autoFocus />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono">{view.meta.slug}</Badge>
          <Badge variant="outline" className={view.meta.environment === 'live' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}>
            {view.meta.environment.toUpperCase()}
          </Badge>
          <span>{view.meta.timezone}</span>
          <span>· {view.definitions.length} settings · {view.pages.length} pages</span>
          <span className="hidden xl:inline">· Every item has a number — quote it when you ask for help.</span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={load} title="Reload"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(340px,400px)_1fr]">
        {/* ── Groups ── */}
        <nav className="hidden lg:block min-h-0 overflow-auto border-r border-gray-200 py-2" aria-label="Setting groups">
          {groups.map((g) => (
            <button key={g.id} onClick={() => { setQuery(''); setGroupId(g.id); setGroupHelpOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${!searching && groupId === g.id ? 'bg-gray-100 font-semibold' : ''}`}>
              <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{g.no}</span>
              <span className="flex-1">{g.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{g.count}</span>
            </button>
          ))}
          <div className="my-2 border-t border-gray-200" />
          <button onClick={() => { setQuery(''); setGroupId(PAGES_GROUP); setSelectedKey(null); }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${!searching && groupId === PAGES_GROUP ? 'bg-gray-100 font-semibold' : ''}`}>
            <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">P</span>
            <span className="flex-1">Pages &amp; tools</span><span className="text-xs text-muted-foreground tabular-nums">{view.pages.length}</span>
          </button>
          {view.unregistered.length > 0 && (
            <button onClick={() => { setQuery(''); setGroupId(UNREGISTERED_GROUP); setSelectedKey(null); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${!searching && groupId === UNREGISTERED_GROUP ? 'bg-gray-100 font-semibold' : ''}`}>
              <span className="w-6 shrink-0 text-right"><AlertTriangle className="ml-auto h-3.5 w-3.5 text-amber-600" /></span>
              <span className="flex-1">Unlisted keys</span><span className="text-xs text-muted-foreground tabular-nums">{view.unregistered.length}</span>
            </button>
          )}
          <div className="px-3 pt-3 text-[11px] text-muted-foreground">
            <Link to="/settings/directory" className="underline">Classic settings directory</Link>
          </div>
        </nav>

        {/* ── List ── */}
        <div className="min-h-0 overflow-auto border-r border-gray-200" onKeyDown={onListKey} tabIndex={0} aria-label="Settings list">
          <div className="lg:hidden border-b border-gray-200 p-2">
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={searching ? '' : groupId} onChange={(e) => { setQuery(''); setGroupId(e.target.value); }}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.no} {g.label} ({g.count})</option>)}
              <option value={PAGES_GROUP}>P Pages &amp; tools ({view.pages.length})</option>
              {view.unregistered.length > 0 && <option value={UNREGISTERED_GROUP}>Unlisted keys ({view.unregistered.length})</option>}
            </select>
          </div>

          {searching && (
            <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {listDefs.length} setting{listDefs.length === 1 ? '' : 's'} · {listPages.length} page{listPages.length === 1 ? '' : 's'}
            </div>
          )}
          {!searching && currentGroup && (
            <div className="border-b border-gray-100 px-4 py-2.5">
              <div className="flex items-center text-sm font-semibold">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{currentGroup.no}</span>{currentGroup.label}
                {currentGroup.help && <InfoButton open={groupHelpOpen} onToggle={() => setGroupHelpOpen((o) => !o)} label={currentGroup.label} />}
              </div>
              <div className="text-xs text-muted-foreground">{currentGroup.description}</div>
              {groupHelpOpen && currentGroup.help && <HelpPanel>{currentGroup.help}</HelpPanel>}
            </div>
          )}

          {listDefs.map((d) => <ListRow key={d.key} def={d} active={d.key === selectedKey} onSelect={() => setSelectedKey(d.key)} />)}

          {listPages.length > 0 && (
            <div className="px-2 py-2">
              <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Pages &amp; tools</div>
              {listPages.map((p) => (
                <button key={p.path} onClick={() => navigate(p.path)} className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-gray-50">
                  <span className="mt-0.5 w-8 shrink-0 font-mono text-xs text-muted-foreground">{p.code}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.label}</div>
                    {p.hint && <div className="text-xs text-muted-foreground">{p.hint}</div>}
                  </div>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {!searching && groupId === UNREGISTERED_GROUP && (
            <div className="p-4 text-sm">
              <p className="mb-3 text-xs text-muted-foreground">Stored values that no numbered setting describes yet. They still work for whatever reads them. Ask the platform team to list them so they can be edited here.</p>
              {view.unregistered.map((u) => (
                <div key={u.key} className="flex items-center justify-between border-b border-gray-100 py-1.5 font-mono text-xs">
                  <span>{u.key}</span><span className="text-muted-foreground">{u.grp ?? '—'}{u.is_public ? ' · public' : ''}</span>
                </div>
              ))}
            </div>
          )}

          {searching && !listDefs.length && !listPages.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nothing matches “{query}”. Try one word, or a number such as 2.1.</div>
          )}
        </div>

        {/* ── Editor ── */}
        <div className="min-h-0 overflow-auto bg-gray-50/60">
          {selected
            ? <Editor key={selected.key} def={selected} all={view.definitions} onSaved={replaceDef} onJump={jumpTo} />
            : <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
                {groupId === PAGES_GROUP ? 'Choose a page on the left to open it.' : 'Choose a setting on the left to view or change it.'}
              </div>}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────── list row ────────────────────────── */

const ListRow: React.FC<{ def: RegistryDef; active: boolean; onSelect: () => void }> = ({ def, active, onSelect }) => {
  const sb = scopeBadge(def);
  const summary = def.fields.filter((f) => f.type !== 'json' && !f.readonly).slice(0, 3)
    .map((f) => `${f.label}: ${summarizeField(f, getPath(def.value, f.path), def.secretsStored.includes(f.path))}`);
  return (
    <button onClick={onSelect} className={`block w-full border-b border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50 ${active ? 'bg-primary/5 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{def.code}</span>
        <span className="text-sm font-medium">{def.title}</span>
        {def.isPublic && <Globe className="h-3 w-3 text-muted-foreground" aria-label="Visible on the website" />}
        {(def.secret || def.plainSecret) && <KeyRound className="h-3 w-3 text-muted-foreground" aria-label="Contains credentials" />}
        {def.module && <Badge variant="outline" className="h-4 px-1 text-[10px]"><Puzzle className="mr-0.5 h-2.5 w-2.5" />{def.module}</Badge>}
        {sb && <Badge variant="outline" className={`h-4 px-1 text-[10px] ${sb.cls}`}>{sb.text}</Badge>}
        {!def.canWrite && !sb && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Read-only for you" />}
      </div>
      <div className="mt-0.5 line-clamp-1 pl-11 text-xs text-muted-foreground">{def.description}</div>
      {summary.length > 0 && <div className="mt-1 line-clamp-1 pl-11 text-[11px] text-gray-600">{summary.join(' · ')}</div>}
      {!summary.length && def.page && <div className="mt-1 pl-11 text-[11px] text-gray-600">Edited on: {def.page.label}</div>}
    </button>
  );
};

/* ────────────────────────── editor ────────────────────────── */

const Editor: React.FC<{ def: RegistryDef; all: RegistryDef[]; onSaved: (d: RegistryDef) => void; onJump: (key: string) => void }> = ({ def, all, onSaved, onJump }) => {
  const { toast } = useToast();
  const initial = useMemo(() => Object.fromEntries(def.fields.map((f) => [f.path, f.type === 'secret' ? '' : getPath(def.value, f.path)])), [def]);
  const [work, setWork] = useState<Record<string, any>>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({});
  const [techOpen, setTechOpen] = useState(false);
  useEffect(() => { setWork(initial); setErr(null); setHelpOpen({}); setTechOpen(false); }, [initial]);
  const toggleHelp = (k: string) => setHelpOpen((h) => ({ ...h, [k]: !h[k] }));

  const dirty = useMemo(() => def.fields.filter((f) => {
    if (f.readonly) return false;
    if (f.type === 'secret') return typeof work[f.path] === 'string' && work[f.path].length > 0;
    return JSON.stringify(work[f.path]) !== JSON.stringify(initial[f.path]);
  }).map((f) => f.path), [def.fields, work, initial]);

  const visible = (f: CenterField) => !f.showIf || JSON.stringify(work[f.showIf.path]) === JSON.stringify(f.showIf.equals);

  const save = useCallback(async () => {
    if (!dirty.length || !def.canWrite) return;
    setSaving(true); setErr(null);
    try {
      const patch: Record<string, any> = {};
      for (const p of dirty) patch[p] = work[p];
      const fresh: RegistryDef = await settingsRegistryAPI.update(def.key, patch);
      onSaved(fresh);
      toast({ title: `${def.code} saved`, description: `${def.title}: ${dirty.length} change${dirty.length === 1 ? '' : 's'} applied.` });
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Save failed');
    } finally { setSaving(false); }
  }, [dirty, def, work, onSaved, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const sb = scopeBadge(def);
  const related = (def.related ?? []).map((k) => all.find((d) => d.key === k)).filter(Boolean) as RegistryDef[];

  return (
    <div className="mx-auto max-w-3xl p-5">
      {/* Header */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded bg-gray-900 px-1.5 py-0.5 font-mono text-xs text-white">{def.code}</span>
        <h2 className="text-lg font-semibold">{def.title}</h2>
        {def.help && <InfoButton open={!!helpOpen.__def} onToggle={() => toggleHelp('__def')} label={def.title} />}
        {def.isPublic && <Badge variant="outline" className="text-[10px]"><Globe className="mr-1 h-3 w-3" /> Visible on the website</Badge>}
        {(def.secret || def.plainSecret) && <Badge variant="outline" className="text-[10px]"><KeyRound className="mr-1 h-3 w-3" /> Credentials</Badge>}
        {def.module && <Badge variant="outline" className="text-[10px]"><Puzzle className="mr-1 h-3 w-3" /> Module: {def.module}</Badge>}
        {sb && <Badge variant="outline" className={`text-[10px] ${sb.cls}`}>{sb.text}</Badge>}
        {!def.canWrite && !sb && !def.readonly && <Badge variant="outline" className="text-[10px]"><Lock className="mr-1 h-3 w-3" /> Needs the {def.permission.write} permission</Badge>}
      </div>
      <p className="text-sm text-gray-700">{def.description}</p>
      {helpOpen.__def && def.help && <HelpPanel><Info className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />{def.help}</HelpPanel>}
      {def.updatedAt && <div className="mt-1 text-[11px] text-muted-foreground">Last changed {formatDateTime(def.updatedAt)}</div>}

      {def.note && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{def.note}</div>}

      {def.page && (
        <div className="mt-3">
          <Link to={def.page.path} className="inline-flex items-center gap-1 text-sm text-primary underline">
            <ExternalLink className="h-3.5 w-3.5" /> {def.readonly ? 'Open the editor:' : 'Full editor:'} {def.page.label}
          </Link>
        </div>
      )}

      {/* Fields */}
      {def.fields.length > 0 && (
        <div className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          {def.fields.filter(visible).map((f) => (
            <div key={f.path || '__value'} className="grid gap-1.5 md:grid-cols-[220px_1fr] md:gap-4">
              <div>
                <div className="flex items-start">
                  <span className="mr-2 mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">{f.code}</span>
                  <label htmlFor={`sf-${f.path || 'value'}`} className="text-sm font-medium">{f.label}</label>
                  {(f.help || f.description) && <InfoButton open={!!helpOpen[f.path]} onToggle={() => toggleHelp(f.path)} label={f.label} />}
                  {dirty.includes(f.path) && <span className="ml-1.5 mt-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsaved change" />}
                </div>
                {f.description && <p className="mt-0.5 pl-9 text-[11px] leading-snug text-muted-foreground">{f.description}</p>}
                {helpOpen[f.path] && (f.help || f.description) && <div className="pl-9"><HelpPanel>{f.help ?? f.description}</HelpPanel></div>}
              </div>
              <SettingFieldControl field={f} value={work[f.path]} onChange={(v) => setWork((w) => ({ ...w, [f.path]: v }))}
                options={def.options[f.path]} disabled={!def.canWrite} secretSet={def.secretsStored.includes(f.path)} folder={`settings/${def.key}`} />
            </div>
          ))}
          {def.canWrite && (
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="text-xs text-muted-foreground">{dirty.length ? `${dirty.length} unsaved change${dirty.length === 1 ? '' : 's'}` : 'No changes'} · Ctrl+S saves</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!dirty.length || saving} onClick={() => setWork(initial)}>Discard</Button>
                <Button size="sm" disabled={!dirty.length || saving} onClick={save}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
                </Button>
              </div>
            </div>
          )}
          {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
        </div>
      )}

      {/* Read-only / virtual / fixed-limit entries: the current state */}
      {def.fields.length === 0 && def.value != null && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current state</div>
          <ValueView value={def.value} />
        </div>
      )}

      {/* Catalogue naming (6.x): show what the config being edited actually
          produces, on a real SKU, before it is saved. */}
      {def.key === 'catalogNaming' && <CatalogNamingPreview def={def} work={work} />}

      {/* Related */}
      {related.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Related settings</div>
          <div className="flex flex-wrap gap-1.5">
            {related.map((r) => (
              <button key={r.key} onClick={() => onJump(r.key)} className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50">
                <span className="font-mono text-muted-foreground">{r.code}</span> {r.title} <ChevronRight className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Technical details — for developers and support; collapsed by default */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white">
        <button type="button" onClick={() => setTechOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Technical details {techOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {techOpen && (
          <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-700">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Number</dt><dd className="font-mono">{def.code}</dd>
              <dt className="text-muted-foreground">Key</dt><dd className="font-mono">{def.key}</dd>
              <dt className="text-muted-foreground">Stored as</dt><dd>{def.scope === 'store' ? 'a settings row for this store' : def.scope === 'platform' ? 'a platform value on the store record' : def.scope === 'virtual' ? 'derived from other records' : 'a constant in code'}</dd>
              <dt className="text-muted-foreground">Read access</dt><dd className="font-mono">{def.permission.read}</dd>
              <dt className="text-muted-foreground">Write access</dt><dd className="font-mono">{def.permission.write}</dd>
              {def.module && <><dt className="text-muted-foreground">Module</dt><dd className="font-mono">{def.module}</dd></>}
            </dl>
            {def.technical && <p className="mt-3 leading-relaxed">{def.technical}</p>}
            {def.consumers.length > 0 && (
              <>
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Read by</div>
                <ul className="mt-1 space-y-0.5">{def.consumers.map((c) => <li key={c} className="font-mono">{c}</li>)}</ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ────────────────────────── catalogue naming (6.x) — live preview ────────────────────────── */

/**
 * PREVIEW ONLY, and it calls the SHARED rule — `admin/src/lib/variationName.ts`
 * holds the same `SHARED BODY` region as the backend and the storefront,
 * byte-identical and drift-checked, so this screen can never disagree with what
 * the server will actually compose. Admin still names nothing anywhere else:
 * every real product label it renders was resolved by the API.
 *
 * It runs client-side because an UNSAVED config has nothing on the server to
 * ask about yet.
 *
 * Contract (`backend/src/config/settingsRegistry.ts` key `catalogNaming`,
 * `backend/src/utils/variationName.ts`): a root `order` (`CatalogNamePart[]`,
 * field path `order`) and `include` (`Partial<Record<CatalogNamePart,
 * boolean>>`, one BOOLEAN field per part — `include.brand` … `include.size`,
 * missing = true), plus `overrides.website` / `.admin` / `.seo` / `.channels`
 * — each `null` or a full `{ order, include }` object. No server resolver
 * merges a surface override with the root yet (nothing consumes it end to
 * end as of 2026-09-09), so `surfaceConfigFor` below states its own — and
 * only — opinion: an override REPLACES `order` when non-empty and MERGES
 * `include` on top of the root's, mirroring exactly how the root merges on
 * top of the platform default one level up. Also replicates the two
 * redundancy guards (`formIsRedundant`/`nameAlreadyStates`) so the preview
 * never shows a duplicated word the real page would already have dropped.
 */
const NAMING_SURFACES: Array<{ id: string; label: string }> = [
  { id: 'website', label: 'Website' },
  { id: 'admin', label: 'Admin' },
  { id: 'seo', label: 'SEO title' },
  { id: 'channels', label: 'Channel feeds' },
];

/** A search-result row's raw parts, in the shape the shared rule expects. */
function partsFromRow(row: any): VariationNameParts {
  const attrs = row?.attributes ?? {};
  return {
    brand: String(row?.brand_name ?? row?.brandName ?? '').trim(),
    product: String(row?.base_name ?? row?.baseName ?? row?.product_name
      ?? row?.productName ?? row?.name ?? '').trim(),
    attributes: attrs,
  };
}

/**
 * What this config WOULD produce, computed through the SHARED naming rule
 * (`admin/src/lib/variationName.ts`, byte-identical to the backend's copy and
 * drift-checked by `backend/tests/catalog-naming-smoke.ts`).
 *
 * It runs client-side only because there is nothing saved yet for a server to
 * compose from — NOT because admin has its own idea of how a name is built.
 */
function previewCatalogName(row: any, order: string[], include: Record<string, boolean>): string {
  const parts = partsFromRow(row);
  const name = canonicalVariationName(parts, {
    order: (order && order.length ? order : DEFAULT_CATALOG_NAME_ORDER) as CatalogNamePart[],
    include: include as Partial<Record<CatalogNamePart, boolean>>,
  });
  return name || String(parts.product || '') || '(no product picked)';
}

const CatalogNamingPreview: React.FC<{ def: RegistryDef; work: Record<string, any> }> = ({ def, work }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return; }
    clearTimeout(timer.current);
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const rows = await productsAPI.searchVariations(q.trim(), 8);
        setResults(Array.isArray(rows) ? rows : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  // Reads a field's current DRAFT value (unsaved edits win), falling back to
  // the effective saved value, then to the given default when neither exists.
  const draftAt = (path: string, fallback: any) => {
    if (Object.prototype.hasOwnProperty.call(work, path) && work[path] !== undefined) return work[path];
    const fromValue = getPath(def.value, path);
    return fromValue !== undefined ? fromValue : fallback;
  };

  const rootOrder: string[] = Array.isArray(draftAt('order', DEFAULT_CATALOG_NAME_ORDER)) ? draftAt('order', DEFAULT_CATALOG_NAME_ORDER) : DEFAULT_CATALOG_NAME_ORDER;
  const rootInclude: Record<string, boolean> = DEFAULT_CATALOG_NAME_ORDER.reduce((acc, part) => {
    acc[part] = draftAt(`include.${part}`, true) !== false;
    return acc;
  }, {} as Record<string, boolean>);

  const SURFACE_OVERRIDE_PATH: Record<string, string> = {
    website: 'overrides.website', admin: 'overrides.admin', seo: 'overrides.seo', channels: 'overrides.channels',
  };

  const surfaceConfigFor = (surfaceId: string): { order: string[]; include: Record<string, boolean>; overridden: boolean } => {
    const override = draftAt(SURFACE_OVERRIDE_PATH[surfaceId], null);
    if (!override || typeof override !== 'object') return { order: rootOrder, include: rootInclude, overridden: false };
    const order = Array.isArray(override.order) && override.order.length ? override.order : rootOrder;
    const include = { ...rootInclude, ...(override.include && typeof override.include === 'object' ? override.include : {}) };
    return { order, include, overridden: true };
  };

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-700">
        <Eye className="h-3.5 w-3.5" /> Live preview
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Search a real product to see how its name reads with this configuration, before you save.</p>

      <div className="relative">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          placeholder="Search by product name or SKU (3+ characters)…" className="h-9" />
        {results.length > 0 && !picked && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {results.map((r: any) => (
              <button key={r.variation_id ?? r.id ?? r.sku} type="button"
                onClick={() => { setPicked(r); setResults([]); setQ(''); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50">
                <span className="truncate">{r.name ?? r.base_name ?? r.baseName}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{r.sku}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {searching && <div className="mt-1 text-xs text-muted-foreground">Searching…</div>}

      {picked ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>SKU <span className="font-mono text-slate-700">{picked.sku}</span></span>
            <button type="button" className="underline hover:text-slate-700" onClick={() => setPicked(null)}>Change</button>
          </div>
          {NAMING_SURFACES.map((s) => {
            const cfg = surfaceConfigFor(s.id);
            return (
              <div key={s.id} className="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {s.label}
                  {cfg.overridden && <Badge variant="outline" className="h-4 px-1 text-[10px]">override</Badge>}
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{previewCatalogName(picked, cfg.order, cfg.include)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No product picked yet.</p>
      )}
    </div>
  );
};

/** Renders a resolved value: fixed-limit tables get a table, everything else a readable key/value list. */
const ValueView: React.FC<{ value: any }> = ({ value }) => {
  if (Array.isArray(value) && value.length && typeof value[0] === 'object' && 'name' in value[0] && 'source' in value[0]) {
    return (
      <table className="w-full text-xs">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Limit</th><th className="py-1 pr-2">Value</th><th className="py-1 pr-2">Where</th><th className="py-1">What it means</th></tr></thead>
        <tbody>{value.map((r: any) => (
          <tr key={r.name} className="border-t border-gray-100 align-top"><td className="py-1 pr-2 font-mono">{r.name}</td><td className="py-1 pr-2 tabular-nums">{String(r.value)}</td><td className="py-1 pr-2 font-mono text-muted-foreground">{r.source}</td><td className="py-1 text-muted-foreground">{r.note}</td></tr>
        ))}</tbody>
      </table>
    );
  }
  if (typeof value !== 'object') return <div className="font-mono text-sm">{String(value)}</div>;
  if (Array.isArray(value)) return <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(value, null, 2)}</pre>;
  return (
    <dl className="grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-4 gap-y-1 text-xs">
      {Object.entries(value).map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="font-mono text-muted-foreground">{k}</dt>
          <dd className="break-all">{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

export default SettingsCenter;
