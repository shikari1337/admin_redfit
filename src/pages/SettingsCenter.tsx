import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Save, ExternalLink, Loader2, Lock, Globe, KeyRound, Puzzle, Building2, Code2, Archive, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { settingsRegistryAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import SettingFieldControl, { summarizeField, type RegistryField, type FieldOption } from '../components/settings/SettingFieldControl';

/* ────────────────────────── types (mirror the backend registry) ────────────────────────── */

interface RegistryGroup { id: string; label: string; description: string; order: number }
interface RegistryPage { path: string; label: string; permission?: string; module?: string; hint?: string }
interface RegistryDef {
  key: string; title: string; description: string; group: string;
  scope: 'store' | 'platform' | 'code' | 'virtual' | 'legacy';
  permission: { read: string; write: string };
  module?: string; isPublic?: boolean; secret?: boolean; readonly?: boolean; note?: string;
  fields: RegistryField[]; consumers: string[]; page?: RegistryPage; keywords?: string[]; related?: string[];
  value: any; canWrite: boolean; options: Record<string, FieldOption[]>; secretsStored: string[]; exists: boolean;
}
interface CenterView {
  groups: RegistryGroup[]; definitions: RegistryDef[]; pages: RegistryPage[];
  unregistered: Array<{ key: string; grp: string | null; is_public: boolean }>;
  meta: { slug: string | null; environment: 'live' | 'test'; timezone: string; permissions: string[] };
}

const PAGES_GROUP = '__pages';
const UNREGISTERED_GROUP = '__unregistered';

const getPath = (obj: any, path: string): any => (!path ? obj : path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj));

/**
 * AND over query tokens. A token matches a haystack only at a WORD boundary —
 * as a whole word (full weight) or a word prefix (half weight) — never as a raw
 * substring, so "cod" finds COD/cod first and "code"/"postal code" only after
 * it. Legacy and code-constant entries are pushed below live settings.
 */
const wordHit = (hay: string, t: string): number => {
  if (!hay) return 0;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay)) return 1;
  if (new RegExp(`(^|[^a-z0-9])${esc}`).test(hay)) return 0.5;
  return 0;
};
function scoreDef(d: RegistryDef, q: string): number {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return 1;
  const hay = {
    title: d.title.toLowerCase(), key: d.key.toLowerCase().replace(/[._]/g, ' '), kw: (d.keywords ?? []).join(' ').toLowerCase(),
    fields: d.fields.map((f) => `${f.label} ${f.description ?? ''}`).join(' ').toLowerCase(),
    desc: d.description.toLowerCase(), page: d.page?.label.toLowerCase() ?? '', cons: d.consumers.join(' ').toLowerCase(),
  };
  let s = 0;
  for (const t of toks) {
    const best = Math.max(
      wordHit(hay.title, t) * 10, wordHit(hay.key, t) * 8, wordHit(hay.kw, t) * 7,
      wordHit(hay.fields, t) * 5, wordHit(hay.desc, t) * 3, wordHit(hay.page, t) * 2, wordHit(hay.cons, t) * 1,
    );
    if (!best) return 0;
    s += best;
  }
  if (d.scope === 'legacy') s -= 8;
  if (d.scope === 'code') s -= 4;
  return Math.max(0.1, s);
}
function scorePage(p: RegistryPage, q: string): number {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return 1;
  const hay = `${p.label} ${p.hint ?? ''} ${p.path}`.toLowerCase();
  return toks.every((t) => hay.includes(t)) ? 4 : 0;
}

const scopeBadge = (d: RegistryDef) => {
  if (d.scope === 'platform') return { icon: Building2, text: 'Set by platform', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (d.scope === 'code') return { icon: Code2, text: 'Code constants', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (d.scope === 'legacy') return { icon: Archive, text: 'Unused', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  return null;
};

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
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data: CenterView = await settingsRegistryAPI.get();
      setView(data);
      // A deep link (/settings?key=gst) lands on that setting's group, not the first group.
      const linked = params.get('key') ? data.definitions.find((d) => d.key === params.get('key')) : null;
      setGroupId((g) => g || linked?.group || data.groups.find((grp) => data.definitions.some((d) => d.group === grp.id))?.id || '');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load settings');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // URL mirrors the state so a setting is linkable (/settings?key=cod) and reload-safe.
  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (groupId) next.set('group', groupId);
    if (selectedKey) next.set('key', selectedKey);
    setParams(next, { replace: true });
  }, [query, groupId, selectedKey, setParams]);

  // "/" focuses search anywhere on the page; Esc clears it.
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
    return view.groups
      .map((g) => ({ ...g, count: view.definitions.filter((d) => d.group === g.id).length }))
      .filter((g) => g.count > 0)
      .sort((a, b) => a.order - b.order);
  }, [view]);

  const listDefs = useMemo(() => {
    if (!view) return [];
    if (searching) {
      return view.definitions.map((d) => ({ d, s: scoreDef(d, query) })).filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title)).map((x) => x.d);
    }
    if (groupId === PAGES_GROUP || groupId === UNREGISTERED_GROUP) return [];
    return view.definitions.filter((d) => d.group === groupId);
  }, [view, searching, query, groupId]);

  const listPages = useMemo(() => {
    if (!view) return [];
    if (searching) return view.pages.filter((p) => scorePage(p, query) > 0);
    return groupId === PAGES_GROUP ? view.pages : [];
  }, [view, searching, query, groupId]);

  const selected = useMemo(() => view?.definitions.find((d) => d.key === selectedKey) ?? null, [view, selectedKey]);

  // Keep the selection valid: when the list changes and the selected key is not in it, pick the
  // first row — and on a NEW query always jump to the top-ranked hit (the previous selection may
  // still match somewhere far down the list, which reads as "search did nothing").
  const lastQueryRef = useRef(query);
  useEffect(() => {
    if (!view) return;
    const queryChanged = lastQueryRef.current !== query;
    lastQueryRef.current = query;
    if (queryChanged && searching && listDefs.length) { setSelectedKey(listDefs[0].key); return; }
    if (selectedKey && listDefs.some((d) => d.key === selectedKey)) return;
    if (listDefs.length) setSelectedKey(listDefs[0].key);
    else if (!searching && groupId !== PAGES_GROUP && groupId !== UNREGISTERED_GROUP) setSelectedKey(null);
  }, [view, listDefs, selectedKey, searching, groupId]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (!listDefs.length) return;
    const i = Math.max(0, listDefs.findIndex((d) => d.key === selectedKey));
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedKey(listDefs[Math.min(listDefs.length - 1, i + 1)].key); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedKey(listDefs[Math.max(0, i - 1)].key); }
  };

  const replaceDef = (next: RegistryDef) => setView((v) => v ? { ...v, definitions: v.definitions.map((d) => (d.key === next.key ? next : d)) } : v);

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
            placeholder='Find any setting — try "cod", "otp", "free shipping", "gst", "whatsapp"   ( / to focus )'
            className="h-9 pl-8" autoFocus />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono">{view.meta.slug}</Badge>
          <Badge variant="outline" className={view.meta.environment === 'live' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}>
            {view.meta.environment.toUpperCase()}
          </Badge>
          <span>{view.meta.timezone}</span>
          <span>· {view.definitions.length} settings · {view.pages.length} pages visible to you</span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={load} title="Reload"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[230px_minmax(320px,380px)_1fr]">
        {/* ── Groups ── */}
        <nav className="hidden lg:block min-h-0 overflow-auto border-r border-gray-200 py-2">
          {groups.map((g) => (
            <button key={g.id} onClick={() => { setQuery(''); setGroupId(g.id); }}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 ${!searching && groupId === g.id ? 'bg-gray-100 font-semibold' : ''}`}>
              <span>{g.label}</span><span className="text-xs text-muted-foreground tabular-nums">{g.count}</span>
            </button>
          ))}
          <div className="my-2 border-t border-gray-200" />
          <button onClick={() => { setQuery(''); setGroupId(PAGES_GROUP); setSelectedKey(null); }}
            className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 ${!searching && groupId === PAGES_GROUP ? 'bg-gray-100 font-semibold' : ''}`}>
            <span>Pages &amp; tools</span><span className="text-xs text-muted-foreground tabular-nums">{view.pages.length}</span>
          </button>
          {view.unregistered.length > 0 && (
            <button onClick={() => { setQuery(''); setGroupId(UNREGISTERED_GROUP); setSelectedKey(null); }}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 ${!searching && groupId === UNREGISTERED_GROUP ? 'bg-gray-100 font-semibold' : ''}`}>
              <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Unregistered keys</span>
              <span className="text-xs text-muted-foreground tabular-nums">{view.unregistered.length}</span>
            </button>
          )}
          <div className="px-4 pt-3 text-[11px] text-muted-foreground">
            <Link to="/settings/directory" className="underline">Classic settings directory</Link>
          </div>
        </nav>

        {/* ── List ── */}
        <div className="min-h-0 overflow-auto border-r border-gray-200" onKeyDown={onListKey} tabIndex={0}>
          {/* mobile group picker */}
          <div className="lg:hidden border-b border-gray-200 p-2">
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={searching ? '' : groupId} onChange={(e) => { setQuery(''); setGroupId(e.target.value); }}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.label} ({g.count})</option>)}
              <option value={PAGES_GROUP}>Pages &amp; tools ({view.pages.length})</option>
              {view.unregistered.length > 0 && <option value={UNREGISTERED_GROUP}>Unregistered keys ({view.unregistered.length})</option>}
            </select>
          </div>

          {searching && (
            <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {listDefs.length} setting{listDefs.length === 1 ? '' : 's'} · {listPages.length} page{listPages.length === 1 ? '' : 's'}
            </div>
          )}
          {!searching && groupId && groupId !== PAGES_GROUP && groupId !== UNREGISTERED_GROUP && (
            <div className="border-b border-gray-100 px-4 py-2">
              <div className="text-sm font-semibold">{groups.find((g) => g.id === groupId)?.label}</div>
              <div className="text-xs text-muted-foreground">{groups.find((g) => g.id === groupId)?.description}</div>
            </div>
          )}

          {listDefs.map((d) => <ListRow key={d.key} def={d} active={d.key === selectedKey} onSelect={() => setSelectedKey(d.key)} />)}

          {listPages.length > 0 && (
            <div className="px-2 py-2">
              <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Pages &amp; tools</div>
              {listPages.map((p) => (
                <button key={p.path} onClick={() => navigate(p.path)} className="flex w-full items-start justify-between gap-2 rounded px-2 py-2 text-left hover:bg-gray-50">
                  <div>
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
              <p className="mb-3 text-xs text-muted-foreground">Rows in the settings table that no registry entry describes. They still work for whatever code reads them; add a registry entry (backend/src/config/settingsRegistry.ts) so they become editable and documented here.</p>
              {view.unregistered.map((u) => (
                <div key={u.key} className="flex items-center justify-between border-b border-gray-100 py-1.5 font-mono text-xs">
                  <span>{u.key}</span><span className="text-muted-foreground">{u.grp ?? '—'}{u.is_public ? ' · public' : ''}</span>
                </div>
              ))}
            </div>
          )}

          {searching && !listDefs.length && !listPages.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nothing matches “{query}”. Try a shorter word — settings are searched by title, key, field names, description and the code that reads them.</div>
          )}
        </div>

        {/* ── Editor ── */}
        <div className="min-h-0 overflow-auto bg-gray-50/60">
          {selected
            ? <Editor key={selected.key} def={selected} all={view.definitions} onSaved={replaceDef} onJump={(k) => { setQuery(''); const t = view.definitions.find((d) => d.key === k); if (t) { setGroupId(t.group); setSelectedKey(k); } }} />
            : <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
                {groupId === PAGES_GROUP ? 'Pick a page on the left to open its full editor.' : 'Select a setting to view or edit it.'}
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
    <button onClick={onSelect} className={`block w-full border-b border-gray-100 px-4 py-2.5 text-left hover:bg-gray-50 ${active ? 'bg-primary/5 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{def.title}</span>
        {def.isPublic && <Globe className="h-3 w-3 text-muted-foreground" aria-label="Public" />}
        {def.secret && <KeyRound className="h-3 w-3 text-muted-foreground" aria-label="Contains credentials" />}
        {def.module && <Badge variant="outline" className="h-4 px-1 text-[10px]"><Puzzle className="mr-0.5 h-2.5 w-2.5" />{def.module}</Badge>}
        {sb && <Badge variant="outline" className={`h-4 px-1 text-[10px] ${sb.cls}`}>{sb.text}</Badge>}
        {!def.canWrite && !sb && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Read-only for you" />}
      </div>
      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{def.description}</div>
      {summary.length > 0 && <div className="mt-1 line-clamp-1 text-[11px] text-gray-600">{summary.join(' · ')}</div>}
      {!summary.length && def.page && <div className="mt-1 text-[11px] text-gray-600">Edited on: {def.page.label}</div>}
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
  useEffect(() => { setWork(initial); setErr(null); }, [initial]);

  const dirty = useMemo(() => def.fields.filter((f) => {
    if (f.readonly) return false;
    if (f.type === 'secret') return typeof work[f.path] === 'string' && work[f.path].length > 0;
    return JSON.stringify(work[f.path]) !== JSON.stringify(initial[f.path]);
  }).map((f) => f.path), [def.fields, work, initial]);

  const visible = (f: RegistryField) => !f.showIf || JSON.stringify(work[f.showIf.path]) === JSON.stringify(f.showIf.equals);

  const save = useCallback(async () => {
    if (!dirty.length || !def.canWrite) return;
    setSaving(true); setErr(null);
    try {
      const patch: Record<string, any> = {};
      for (const p of dirty) patch[p] = work[p];
      const fresh: RegistryDef = await settingsRegistryAPI.update(def.key, patch);
      onSaved(fresh);
      toast({ title: 'Saved', description: `${def.title} updated (${dirty.length} field${dirty.length === 1 ? '' : 's'}).` });
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Save failed');
    } finally { setSaving(false); }
  }, [dirty, def, work, onSaved, toast]);

  // Ctrl/Cmd+S saves the open setting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const sb = scopeBadge(def);
  const related = (def.related ?? []).map((k) => all.find((d) => d.key === k)).filter(Boolean) as RegistryDef[];

  return (
    <div className="mx-auto max-w-3xl p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{def.title}</h2>
        {def.isPublic && <Badge variant="outline" className="text-[10px]"><Globe className="mr-1 h-3 w-3" /> Public to storefront</Badge>}
        {def.secret && <Badge variant="outline" className="text-[10px]"><KeyRound className="mr-1 h-3 w-3" /> Credentials</Badge>}
        {def.module && <Badge variant="outline" className="text-[10px]"><Puzzle className="mr-1 h-3 w-3" /> Module: {def.module}</Badge>}
        {sb && <Badge variant="outline" className={`text-[10px] ${sb.cls}`}>{sb.text}</Badge>}
        {!def.canWrite && !sb && !def.readonly && <Badge variant="outline" className="text-[10px]"><Lock className="mr-1 h-3 w-3" /> Needs {def.permission.write}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{def.description}</p>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground">key: {def.key}</div>

      {def.note && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{def.note}</div>}

      {def.page && (
        <div className="mt-3">
          <Link to={def.page.path} className="inline-flex items-center gap-1 text-sm text-primary underline">
            <ExternalLink className="h-3.5 w-3.5" /> {def.readonly ? 'Open editor:' : 'Full editor:'} {def.page.label}
          </Link>
        </div>
      )}

      {/* Fields */}
      {def.fields.length > 0 && (
        <div className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          {def.fields.filter(visible).map((f) => (
            <div key={f.path || '__value'} className="grid gap-1.5 md:grid-cols-[200px_1fr] md:gap-4">
              <div>
                <label htmlFor={`sf-${f.path || 'value'}`} className="text-sm font-medium">{f.label}</label>
                {dirty.includes(f.path) && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" title="Unsaved" />}
                {f.description && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{f.description}</p>}
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

      {/* Value view for read-only / virtual / code / legacy entries */}
      {def.fields.length === 0 && def.value != null && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current state</div>
          <ValueView value={def.value} />
        </div>
      )}

      {/* Context */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What this changes</div>
          {def.consumers.length ? (
            <ul className="space-y-1 text-xs text-gray-700">{def.consumers.map((c) => <li key={c} className="font-mono">{c}</li>)}</ul>
          ) : <p className="text-xs text-muted-foreground">—</p>}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access</div>
          <div className="text-xs text-gray-700">Read: <span className="font-mono">{def.permission.read}</span> · Write: <span className="font-mono">{def.permission.write}</span></div>
          {related.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Related</div>
              <div className="flex flex-wrap gap-1.5">
                {related.map((r) => (
                  <button key={r.key} onClick={() => onJump(r.key)} className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50">
                    {r.title} <ChevronRight className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** Renders a resolved value: code-constant tables get a table, everything else a readable key/value list. */
const ValueView: React.FC<{ value: any }> = ({ value }) => {
  if (Array.isArray(value) && value.length && typeof value[0] === 'object' && 'name' in value[0] && 'source' in value[0]) {
    return (
      <table className="w-full text-xs">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Constant</th><th className="py-1 pr-2">Value</th><th className="py-1 pr-2">Where</th><th className="py-1">Note</th></tr></thead>
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
