import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronDown, ChevronUp, Eye, EyeOff, GripVertical,
  Loader2, Monitor, Plus, Settings2, Smartphone, Tablet, Trash2, X, LayoutTemplate,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { themeEngineAPI, EditorPayload, SectionSchema } from '../services/themeEngine';
import { formatDateTime, fromStoreDateTimeInput } from '../utils/date';
import ThemeSettingField from '../components/themeEditor/ThemeSettingField';
import { useThemeLookups, ThemeLookups } from '../components/themeEditor/useThemeLookups';

/**
 * Theme Customizer — Shopify-style live editor.
 * Left: section tree / settings forms driven by each section's {% schema %}.
 * Center: live preview iframe (draft state, re-rendered on every change).
 */

type PanelSel =
  | { kind: 'tree' }
  | { kind: 'themeSettings' }
  | { kind: 'section'; scope: string; sectionId: string; blockId?: string };

const TEMPLATE_OPTIONS = [
  { value: 'index', label: 'Home page' },
  { value: 'product', label: 'Product page' },
  { value: 'collection', label: 'Collection page' },
  { value: 'list-collections', label: 'Collections list' },
  { value: 'page', label: 'Content page' },
  { value: 'cart', label: 'Cart' },
  { value: 'search', label: 'Search' },
  { value: 'blog', label: 'Blog' },
  { value: 'article', label: 'Article' },
  { value: '404', label: '404' },
];

const DEVICE_WIDTHS: Record<string, string> = { desktop: '100%', tablet: '768px', mobile: '390px' };

/** The template picker: the theme's own template names (alternates such as `page.contact` included), labelled. */
function templateOptions(names: string[]): { value: string; label: string }[] {
  if (!names.length) return TEMPLATE_OPTIONS;
  const base = new Map(TEMPLATE_OPTIONS.map((t) => [t.value, t.label]));
  const label = (n: string) => {
    if (base.has(n)) return base.get(n)!;
    const [kind, ...rest] = n.split('.');
    const alt = rest.join('.').replace(/[-_]/g, ' ');
    return `${base.get(kind) || kind}: ${alt}`;
  };
  const order = (n: string) => { const i = TEMPLATE_OPTIONS.findIndex((t) => t.value === n.split('.')[0]); return i < 0 ? 99 : i; };
  return [...names].sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((n) => ({ value: n, label: label(n) }));
}

/**
 * A readable name for one section or block in the lists: its type's name plus the words a person would know it
 * by (its title, heading or text), so two "Promises" sections read "Promises: Trust bar" and "Promises: Customer care".
 */
const LABEL_KEYS = ['title', 'heading', 'label', 'eyebrow', 'name', 'question', 'text', 'caption', 'message', 'kicker'];
function itemSubtitle(settings: any, name = ''): string {
  const s = settings || {};
  for (const k of LABEL_KEYS) {
    const v = s[k];
    if (typeof v !== 'string' || !v.trim()) continue;
    // tags out; a theme's line-break mark (`|` in a headline) reads as a space
    const words = v.replace(/<[^>]*>/g, ' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
    return words.toLowerCase() === name.trim().toLowerCase() ? '' : words;
  }
  return '';
}

/** Shopify placement rules for the Add section list: presets only, then enabled_on / disabled_on. */
function canAddHere(schema: SectionSchema, scope: string): boolean {
  if (!schema.presets?.length) return false;
  const isGroup = scope.startsWith('group:');
  const where = isGroup ? scope.slice('group:'.length).replace(/-group$/, '') : scope.slice('template:'.length).split('.')[0];
  const listed = (l?: string[]) => (l || []).some((x) => x === '*' || x === where);
  if (isGroup) {
    if (schema.enabled_on && !listed(schema.enabled_on.groups)) return false;
    return !listed(schema.disabled_on?.groups);
  }
  if (schema.enabled_on?.templates && !listed(schema.enabled_on.templates)) return false;
  if (schema.enabled_on && !schema.enabled_on.templates) return false;
  return !listed(schema.disabled_on?.templates);
}

/**
 * Sections without presets that the editor always offered (everything but a page's main section and a group):
 * kept reachable under "More sections" so no section staff could add before disappears (owner rule: never narrow a control).
 */
function moreSections(all: SectionSchema[]): SectionSchema[] {
  return all.filter((s) => !s.presets?.length && !/(^|-)main-/.test(s.type) && !/-group$/.test(s.type))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

let idCounter = 0;
const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function schemaDefaults(settings: any[] | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const s of settings || []) if (s?.id !== undefined) out[s.id] = s.default !== undefined ? s.default : '';
  return out;
}

export default function ThemeCustomizer() {
  const { id: themeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lookups = useThemeLookups();

  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable state (the draft)
  const [settingsData, setSettingsData] = useState<Record<string, any>>({});
  const [templates, setTemplates] = useState<Record<string, any>>({});
  const [groups, setGroups] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);

  // `?template=index` opens straight on that page (the Pages screen links the home page here on a theme store)
  const [currentTemplate, setCurrentTemplate] = useState(() => searchParams.get('template') || 'index');
  const [sel, setSel] = useState<PanelSel>({ kind: 'tree' });
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeRev, setIframeRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addPicker, setAddPicker] = useState<string | null>(null); // scope to add into
  // Why the last draft save was refused (a check report, or someone else's newer draft); shown in the top bar.
  const [draftError, setDraftError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sectionSchemaByType = useMemo(() => {
    const map = new Map<string, SectionSchema>();
    for (const s of payload?.sectionSchemas || []) map.set(s.type, s);
    return map;
  }, [payload]);

  // Authoritative editable state — React state mirrors this ref. Mutations go
  // through mutate() so a single synchronous copy feeds both the UI and the
  // debounced draft push (nested setState updaters are not safe for that).
  const stateRef = useRef<{ settingsData: any; templates: any; groups: any }>({ settingsData: {}, templates: {}, groups: {} });

  const adoptState = useCallback((s: any, t: any, g: any) => {
    stateRef.current = { settingsData: s || {}, templates: t || {}, groups: g || {} };
    setSettingsData(stateRef.current.settingsData);
    setTemplates(stateRef.current.templates);
    setGroups(stateRef.current.groups);
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!themeId) return;
    themeEngineAPI.getEditor(themeId)
      .then((data) => {
        setPayload(data);
        adoptState(data.settingsData, data.templates, data.groups);
      })
      .catch((e) => setLoadError(e?.response?.data?.message || e?.message || 'Failed to load editor'));
  }, [themeId, adoptState]);

  // ── Preview ─────────────────────────────────────────────────────────────
  // v2 renders the saved draft for the frame (POST /themes/{id}/preview) with the staff member's own access,
  // so no key or ticket rides in a frame address; the document goes in through srcdoc and runs sandboxed
  // (scripts only: the editor bridge posts section clicks back here).
  const [previewDoc, setPreviewDoc] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!themeId) return;
    let cancelled = false;
    themeEngineAPI.previewHtml(themeId, currentTemplate)
      .then((html) => { if (!cancelled) { setPreviewDoc(html); setPreviewError(null); } })
      .catch((e) => { if (!cancelled) setPreviewError(e?.response?.data?.message || 'The preview could not be shown.'); });
    return () => { cancelled = true; };
  }, [themeId, currentTemplate, iframeRev]);

  // ── Draft sync (debounced) → reload preview ─────────────────────────────
  const syncTimer = useRef<ReturnType<typeof setTimeout>>();
  const pushDraft = useCallback((s: any, t: any, g: any) => {
    if (!themeId) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        await themeEngineAPI.saveDraft(themeId, { settingsData: s, templates: t, groups: g });
        setDraftError(null);
        setIframeRev((r) => r + 1);
      } catch (e: any) {
        setDraftError(e?.response?.data?.message || 'The draft could not be saved.');
      }
    }, 400);
  }, [themeId]);

  const mutate = useCallback((fn: (draft: { settingsData: any; templates: any; groups: any }) => void) => {
    const draft = JSON.parse(JSON.stringify(stateRef.current));
    fn(draft);
    stateRef.current = draft;
    setSettingsData(draft.settingsData);
    setTemplates(draft.templates);
    setGroups(draft.groups);
    setDirty(true);
    pushDraft(draft.settingsData, draft.templates, draft.groups);
  }, [pushDraft]);

  // ── Preview → editor messages ───────────────────────────────────────────
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data || {};
      if (d.source !== 'theme-preview') return;
      if (d.type === 'select-section' && d.sectionId) {
        const scope = findScopeOfSection(String(d.sectionId));
        if (scope) setSel({ kind: 'section', scope, sectionId: String(d.sectionId) });
      }
      // The preview is drawn again after every change; bring back the section being edited instead of the top of the page.
      if (d.type === 'ready' && selRef.current.kind === 'section') {
        const sid = selRef.current.sectionId;
        scrollPreviewTo(sid);
        // a theme engine that says ready before its sections are parsed: ask once more when they are there
        setTimeout(() => scrollPreviewTo(sid), 400);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, groups, currentTemplate]);
  const selRef = useRef<PanelSel>(sel);
  useEffect(() => { selRef.current = sel; }, [sel]);

  const findScopeOfSection = (sectionId: string): string | null => {
    if (templates[currentTemplate]?.sections?.[sectionId]) return `template:${currentTemplate}`;
    for (const [gName, g] of Object.entries<any>(groups)) {
      if (g?.sections?.[sectionId]) return `group:${gName}`;
    }
    return null;
  };

  const scrollPreviewTo = (sectionId: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: 'theme-editor', type: 'scroll-to-section', sectionId }, '*',
    );
  };

  // ── Container accessors (template or group) ─────────────────────────────
  const getContainer = (draft: any, scope: string): any | null => {
    if (scope.startsWith('template:')) {
      const name = scope.slice('template:'.length);
      if (!draft.templates[name] || draft.templates[name].__liquid) return null;
      return draft.templates[name];
    }
    return draft.groups[scope.slice('group:'.length)] ?? null;
  };

  const liveContainer = (scope: string): any | null => {
    if (scope.startsWith('template:')) {
      const t = templates[scope.slice('template:'.length)];
      return t && !t.__liquid ? t : null;
    }
    return groups[scope.slice('group:'.length)] ?? null;
  };

  // ── Section operations ──────────────────────────────────────────────────
  const moveSection = (scope: string, sectionId: string, dir: -1 | 1) => mutate((d) => {
    const c = getContainer(d, scope); if (!c) return;
    const order: string[] = c.order || Object.keys(c.sections);
    const i = order.indexOf(sectionId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    c.order = order;
  });

  /** Drag and drop: the new order of a template's or group's sections. */
  const reorderSections = (scope: string, fromId: string, toId: string) => mutate((d) => {
    const c = getContainer(d, scope); if (!c) return;
    const order: string[] = c.order || Object.keys(c.sections);
    const i = order.indexOf(fromId), j = order.indexOf(toId);
    if (i < 0 || j < 0 || i === j) return;
    c.order = arrayMove(order, i, j);
  });

  const reorderBlocks = (scope: string, sectionId: string, fromId: string, toId: string) => mutate((d) => {
    const c = getContainer(d, scope);
    const s = c?.sections?.[sectionId];
    if (!s) return;
    const order: string[] = s.block_order || Object.keys(s.blocks || {});
    const i = order.indexOf(fromId), j = order.indexOf(toId);
    if (i < 0 || j < 0 || i === j) return;
    s.block_order = arrayMove(order, i, j);
  });

  const toggleSection = (scope: string, sectionId: string) => mutate((d) => {
    const c = getContainer(d, scope);
    const s = c?.sections?.[sectionId];
    if (s) s.disabled = !s.disabled;
  });

  const removeSection = (scope: string, sectionId: string) => {
    if (!window.confirm('Remove this section?')) return;
    mutate((d) => {
      const c = getContainer(d, scope); if (!c) return;
      delete c.sections[sectionId];
      c.order = (c.order || []).filter((x: string) => x !== sectionId);
    });
    setSel({ kind: 'tree' });
  };

  const addSection = (scope: string, schema: SectionSchema, presetIndex = 0) => {
    const preset = schema.presets?.[presetIndex];
    const sectionId = genId(schema.type);
    mutate((d) => {
      const c = getContainer(d, scope); if (!c) return;
      const blocks: Record<string, any> = {};
      const blockOrder: string[] = [];
      for (const pb of preset?.blocks || []) {
        const bid = genId('block');
        blocks[bid] = { type: pb.type, settings: { ...schemaDefaults(schema.blocks?.find((b: any) => b.type === pb.type)?.settings), ...(pb.settings || {}) } };
        blockOrder.push(bid);
      }
      c.sections[sectionId] = {
        type: schema.type,
        settings: { ...schemaDefaults(schema.settings), ...(preset?.settings || {}) },
        ...(blockOrder.length ? { blocks, block_order: blockOrder } : {}),
      };
      c.order = [...(c.order || Object.keys(c.sections).filter((k) => k !== sectionId)), sectionId];
    });
    setAddPicker(null);
    setSel({ kind: 'section', scope, sectionId });
  };

  const setSectionSetting = (scope: string, sectionId: string, key: string, value: any, blockId?: string) => mutate((d) => {
    const c = getContainer(d, scope);
    const s = c?.sections?.[sectionId];
    if (!s) return;
    if (blockId) {
      if (!s.blocks?.[blockId]) return;
      s.blocks[blockId].settings = { ...(s.blocks[blockId].settings || {}), [key]: value };
    } else {
      s.settings = { ...(s.settings || {}), [key]: value };
    }
  });

  // ── Block operations ────────────────────────────────────────────────────
  const addBlock = (scope: string, sectionId: string, blockSchema: any) => {
    const bid = genId('block');
    mutate((d) => {
      const c = getContainer(d, scope);
      const s = c?.sections?.[sectionId];
      if (!s) return;
      s.blocks = s.blocks || {};
      s.blocks[bid] = { type: blockSchema.type, settings: schemaDefaults(blockSchema.settings) };
      s.block_order = [...(s.block_order || Object.keys(s.blocks).filter((k) => k !== bid)), bid];
    });
    // open the new block straight away: what a person adds, they want to fill in
    setSel({ kind: 'section', scope, sectionId, blockId: bid });
  };

  const removeBlock = (scope: string, sectionId: string, blockId: string) => mutate((d) => {
    const c = getContainer(d, scope);
    const s = c?.sections?.[sectionId];
    if (!s?.blocks) return;
    delete s.blocks[blockId];
    s.block_order = (s.block_order || []).filter((x: string) => x !== blockId);
  });

  const moveBlock = (scope: string, sectionId: string, blockId: string, dir: -1 | 1) => mutate((d) => {
    const c = getContainer(d, scope);
    const s = c?.sections?.[sectionId];
    if (!s) return;
    const order: string[] = s.block_order || Object.keys(s.blocks || {});
    const i = order.indexOf(blockId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    s.block_order = order;
  });

  // ── Save / discard ──────────────────────────────────────────────────────
  const onPublish = async () => {
    if (!themeId) return;
    setSaving(true);
    try {
      clearTimeout(syncTimer.current);
      await themeEngineAPI.saveDraft(themeId, { settingsData, templates, groups });
      await themeEngineAPI.publish(themeId);
      setDirty(false);
      setDraftError(null);
      setPayload((p) => (p ? { ...p, hasDraft: false, publishAt: null } : p));
      setIframeRev((r) => r + 1);
    } catch (e: any) {
      setDraftError(e?.response?.data?.message || 'The changes could not be published.');
    } finally { setSaving(false); }
  };

  // Publish later: the draft is saved, then scheduled; v2 publishes it at that time.
  const onSchedule = async () => {
    if (!themeId) return;
    const at = fromStoreDateTimeInput(scheduleAt);
    if (!at || Date.parse(at) <= Date.now()) { setDraftError('Pick a time in the future to publish.'); return; }
    setSaving(true);
    try {
      clearTimeout(syncTimer.current);
      await themeEngineAPI.saveDraft(themeId, { settingsData, templates, groups });
      await themeEngineAPI.schedule(themeId, at);
      setPayload((p) => (p ? { ...p, hasDraft: true, publishAt: at } : p));
      setDraftError(null);
      setScheduleOpen(false);
    } catch (e: any) {
      setDraftError(e?.response?.data?.message || 'The publish could not be scheduled.');
    } finally { setSaving(false); }
  };

  const onCancelSchedule = async () => {
    if (!themeId) return;
    try {
      await themeEngineAPI.cancelSchedule(themeId);
      setPayload((p) => (p ? { ...p, publishAt: null } : p));
    } catch (e: any) {
      setDraftError(e?.response?.data?.message || 'The schedule could not be cancelled.');
    }
  };

  const onDiscard = async () => {
    if (!themeId || !payload) return;
    if (dirty && !window.confirm('Discard all unsaved changes?')) return;
    await themeEngineAPI.discardDraft(themeId).catch(() => {});
    setDraftError(null);
    const data = await themeEngineAPI.getEditor(themeId);
    setPayload(data);
    adoptState(data.settingsData, data.templates, data.groups);
    setDirty(false);
    setSel({ kind: 'tree' });
    setIframeRev((r) => r + 1);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="h-screen grid place-items-center bg-gray-100">
        <div className="text-center">
          <p className="font-semibold text-gray-800">{loadError}</p>
          <button onClick={() => navigate('/appearance/themes')} className="mt-3 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold">Back to themes</button>
        </div>
      </div>
    );
  }
  if (!payload || !themeId) {
    return <div className="h-screen grid place-items-center bg-gray-100 text-gray-500"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading editor…</span></div>;
  }

  const templateScope = `template:${currentTemplate}`;
  const templateContainer = liveContainer(templateScope);
  const groupNames = Object.keys(groups);
  const headerGroups = groupNames.filter((g) => /header/i.test(g));
  const footerGroups = groupNames.filter((g) => /footer/i.test(g));

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* ── Top bar ── */}
      <div className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center gap-3 px-3">
        <button onClick={() => navigate('/appearance/themes')} className="p-2 rounded-lg hover:bg-gray-100" title="Back to themes">
          <ArrowLeft className="h-4.5 w-4.5 h-[18px] w-[18px]" />
        </button>
        <span className="font-bold text-gray-900 text-sm hidden md:flex items-center gap-1.5"><LayoutTemplate className="h-4 w-4 text-indigo-600" /> Customize</span>
        <select
          value={currentTemplate}
          onChange={(e) => { setCurrentTemplate(e.target.value); setSel({ kind: 'tree' }); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium bg-white"
        >
          {templateOptions(payload.templateNames).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div className="flex items-center gap-1 ml-auto">
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => {
            const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
            return (
              <button key={d} onClick={() => setDevice(d)} title={d}
                className={`p-2 rounded-lg ${device === d ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-500'}`}>
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
          {draftError && <span className="text-[11px] font-semibold text-red-600 max-w-[280px] truncate" title={draftError}>{draftError}</span>}
          {!draftError && dirty && <span className="text-[11px] font-semibold text-amber-600 hidden sm:inline">Not published yet</span>}
          {payload.publishAt && (
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 hidden md:inline-flex items-center gap-1.5">
              Publishes {formatDateTime(payload.publishAt)}
              <button onClick={onCancelSchedule} className="underline">Cancel</button>
            </span>
          )}
          <button onClick={onDiscard} className="px-3 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Discard</button>
          <div className="relative">
            <button onClick={() => setScheduleOpen((o) => !o)} disabled={saving}
              className="px-3 py-2 text-[13px] font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-60">
              Schedule
            </button>
            {scheduleOpen && (
              <div className="absolute right-0 top-full mt-2 z-40 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Publish these changes at (store time)</label>
                <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => setScheduleOpen(false)} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
                  <button onClick={onSchedule} disabled={saving || !scheduleAt}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-60">Schedule</button>
                </div>
              </div>
            )}
          </div>
          <button onClick={onPublish} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-[13px] font-bold hover:bg-indigo-700 disabled:opacity-60">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Publish
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* ── Left panel ── */}
        <div className="w-[300px] shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-0">
          {sel.kind === 'section' ? (
            <SectionSettingsPanel
              sel={sel}
              container={liveContainer(sel.scope)}
              schemaByType={sectionSchemaByType}
              onBack={() => setSel({ kind: 'tree' })}
              onChange={setSectionSetting}
              onAddBlock={addBlock}
              onRemoveBlock={removeBlock}
              onMoveBlock={moveBlock}
              onReorderBlocks={reorderBlocks}
              onSelectBlock={(blockId) => setSel({ ...sel, blockId })}
              lookups={lookups}
            />
          ) : sel.kind === 'themeSettings' ? (
            <ThemeSettingsPanel
              schema={payload.settingsSchema}
              values={settingsData}
              onBack={() => setSel({ kind: 'tree' })}
              onChange={(key, value) => mutate((d) => { d.settingsData[key] = value; })}
              lookups={lookups}
            />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <p className="px-4 pt-3 pb-1 text-[11.5px] text-gray-500 m-0 leading-snug">
                Click a section here or in the preview to edit it. Drag the handle to reorder. Changes save as a draft by themselves; Publish puts them on the website.
              </p>
              {headerGroups.map((g) => (
                <SectionTreeGroup key={g} label="Header" scope={`group:${g}`} container={groups[g]}
                  schemaByType={sectionSchemaByType}
                  onSelect={(sid) => { setSel({ kind: 'section', scope: `group:${g}`, sectionId: sid }); scrollPreviewTo(sid); }}
                  onMove={moveSection} onReorder={reorderSections} onToggle={toggleSection} onRemove={removeSection}
                  onAdd={() => setAddPicker(`group:${g}`)}
                  canAdd={payload.sectionSchemas.some((s) => canAddHere(s, `group:${g}`))}
                />
              ))}
              <SectionTreeGroup label={templateOptions(payload.templateNames).find((t) => t.value === currentTemplate)?.label || 'Template'} scope={templateScope} container={templateContainer}
                schemaByType={sectionSchemaByType}
                emptyNote={!templates[currentTemplate]
                  ? 'This page is laid out by a .liquid file, not sections. Change it in the theme code.'
                  : 'No sections yet.'}
                onSelect={(sid) => { setSel({ kind: 'section', scope: templateScope, sectionId: sid }); scrollPreviewTo(sid); }}
                onMove={moveSection} onReorder={reorderSections} onToggle={toggleSection} onRemove={removeSection}
                onAdd={() => setAddPicker(templateScope)}
                canAdd
              />
              {footerGroups.map((g) => (
                <SectionTreeGroup key={g} label="Footer" scope={`group:${g}`} container={groups[g]}
                  schemaByType={sectionSchemaByType}
                  onSelect={(sid) => { setSel({ kind: 'section', scope: `group:${g}`, sectionId: sid }); scrollPreviewTo(sid); }}
                  onMove={moveSection} onReorder={reorderSections} onToggle={toggleSection} onRemove={removeSection}
                  onAdd={() => setAddPicker(`group:${g}`)}
                  canAdd={payload.sectionSchemas.some((s) => canAddHere(s, `group:${g}`))}
                />
              ))}
            </div>
          )}
          {/* Theme settings entry */}
          {sel.kind === 'tree' && (
            <button onClick={() => setSel({ kind: 'themeSettings' })}
              className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
              <Settings2 className="h-4 w-4" /> Theme settings
            </button>
          )}
        </div>

        {/* ── Preview ── */}
        <div className="flex-1 min-w-0 grid place-items-center p-4 overflow-auto">
          {previewError ? (
            <div className="bg-white rounded-xl border border-red-200 text-red-700 text-sm px-5 py-4 max-w-md text-center">
              <p className="font-semibold m-0">{previewError}</p>
              <button onClick={() => setIframeRev((r) => r + 1)} className="mt-2 text-xs font-semibold underline">Try again</button>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              key={`${currentTemplate}`}
              srcDoc={previewDoc}
              sandbox="allow-scripts"
              title="Theme preview"
              className="bg-white rounded-xl shadow-lg border border-gray-200 h-full"
              style={{ width: DEVICE_WIDTHS[device], maxWidth: '100%', transition: 'width .2s' }}
            />
          )}
        </div>
      </div>

      {/* ── Add-section picker ── */}
      {addPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-6" onClick={() => setAddPicker(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <p className="font-bold text-gray-900 m-0">Add section</p>
              <button onClick={() => setAddPicker(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto p-3 grid grid-cols-2 gap-2">
              {payload.sectionSchemas
                .filter((s) => canAddHere(s, addPicker))
                .flatMap((s) => (s.presets || []).map((p: any, pi: number) => ({ s, p, pi })))
                .sort((a, b) => String(a.p?.name || a.s.name).localeCompare(String(b.p?.name || b.s.name)))
                .map(({ s, p, pi }) => (
                  <button key={`${s.type}-${pi}`} onClick={() => addSection(addPicker, s, pi)}
                    className="text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-400 hover:bg-indigo-50/40">
                    <span className="block text-[13.5px] font-semibold text-gray-800">{p?.name || s.name}</span>
                    <span className="block text-[11.5px] text-gray-400 mt-0.5">
                      {(s.blocks || []).length ? `Has ${(s.blocks || []).map((b: any) => (b.name || b.type).toLowerCase()).join(', ')} items` : `${(s.settings || []).filter((x: any) => x.id).length} settings`}
                    </span>
                  </button>
                ))}
              {!payload.sectionSchemas.some((s) => canAddHere(s, addPicker)) && !moreSections(payload.sectionSchemas).length && (
                <p className="col-span-2 text-[13px] text-gray-500 m-0 p-2">This theme has no sections that can be added here.</p>
              )}
              {moreSections(payload.sectionSchemas).length > 0 && (
                <>
                  <p className="col-span-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-2 mb-0 px-1">More sections</p>
                  <p className="col-span-2 text-[11.5px] text-gray-500 m-0 px-1 -mt-1">The theme did not make these to be added, so they start empty: fill in their settings after adding.</p>
                  {moreSections(payload.sectionSchemas).map((s) => (
                    <button key={s.type} onClick={() => addSection(addPicker, s)}
                      className="text-left border border-dashed border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-400 hover:bg-indigo-50/40">
                      <span className="block text-[13.5px] font-semibold text-gray-700">{s.name}</span>
                      <span className="block text-[11.5px] text-gray-400 mt-0.5">{s.type}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sortable rows (sections and blocks) ───────────────────────────────────

/** One row that can be dragged by its handle; the actions stay visible (faded until hover) so they work on touch too. */
function SortableRow({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: 'relative' };
  const handle = (
    <button type="button" {...attributes} {...listeners} className="p-1 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 touch-none" aria-label="Drag to reorder" title="Drag to reorder">
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
  return <div ref={setNodeRef} style={style} className={isDragging ? 'bg-indigo-50 rounded-lg shadow-sm' : ''}>{children(handle)}</div>;
}

function useListSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

// ── Section tree group (Header / Template / Footer) ───────────────────────

function SectionTreeGroup({ label, scope, container, schemaByType, onSelect, onMove, onReorder, onToggle, onRemove, onAdd, canAdd, emptyNote }: {
  label: string;
  scope: string;
  container: any | null;
  schemaByType: Map<string, SectionSchema>;
  onSelect: (sectionId: string) => void;
  onMove: (scope: string, sectionId: string, dir: -1 | 1) => void;
  onReorder: (scope: string, fromId: string, toId: string) => void;
  onToggle: (scope: string, sectionId: string) => void;
  onRemove: (scope: string, sectionId: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  emptyNote?: string;
}) {
  const sensors = useListSensors();
  const order: string[] = (container?.order || Object.keys(container?.sections || {})).filter((sid: string) => container?.sections?.[sid]);
  const onDragEnd = (e: DragEndEvent) => { if (e.over && e.active.id !== e.over.id) onReorder(scope, String(e.active.id), String(e.over.id)); };
  return (
    <div className="border-b border-gray-100 py-2">
      <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 m-0">{label}</p>
      {order.length === 0 && <p className="px-4 py-1 text-[12px] text-gray-400 m-0">{emptyNote || 'No sections.'}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {order.map((sid, i) => {
            const s = container.sections[sid];
            const name = schemaByType.get(s.type)?.name || s.type;
            const sub = itemSubtitle(s.settings, name);
            return (
              <SortableRow key={sid} id={sid}>
                {(handle) => (
                  <div className="group flex items-center gap-0.5 px-2 py-0.5">
                    {handle}
                    <button onClick={() => onSelect(sid)} title={sub ? `${name}: ${sub}` : name}
                      className={`flex-1 min-w-0 text-left px-2 py-1.5 rounded-lg hover:bg-gray-100 ${s.disabled ? 'text-gray-400' : 'text-gray-700'}`}>
                      <span className={`block text-[13px] font-medium truncate ${s.disabled ? 'line-through' : ''}`}>{name}</span>
                      {sub && <span className="block text-[11px] text-gray-400 truncate">{sub}</span>}
                    </button>
                    <div className="flex items-center opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => onMove(scope, sid, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" title="Move up" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onMove(scope, sid, 1)} disabled={i === order.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" title="Move down" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onToggle(scope, sid)} className="p-1 rounded hover:bg-gray-100" title={s.disabled ? 'Show on the website' : 'Hide from the website'} aria-label={s.disabled ? 'Show' : 'Hide'}>
                        {s.disabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => onRemove(scope, sid)} className="p-1 rounded hover:bg-red-50 text-red-500" title="Remove" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )}
              </SortableRow>
            );
          })}
        </SortableContext>
      </DndContext>
      {container && canAdd && (
        <button onClick={onAdd} className="mx-4 mt-1.5 mb-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800">
          <Plus className="h-3.5 w-3.5" /> Add section
        </button>
      )}
    </div>
  );
}

// ── Per-section settings panel (schema-driven) ────────────────────────────

function SectionSettingsPanel({ sel, container, schemaByType, onBack, onChange, onAddBlock, onRemoveBlock, onMoveBlock, onReorderBlocks, onSelectBlock, lookups }: {
  sel: { kind: 'section'; scope: string; sectionId: string; blockId?: string };
  container: any | null;
  schemaByType: Map<string, SectionSchema>;
  onBack: () => void;
  onChange: (scope: string, sectionId: string, key: string, value: any, blockId?: string) => void;
  onAddBlock: (scope: string, sectionId: string, blockSchema: any) => void;
  onRemoveBlock: (scope: string, sectionId: string, blockId: string) => void;
  onMoveBlock: (scope: string, sectionId: string, blockId: string, dir: -1 | 1) => void;
  onReorderBlocks: (scope: string, sectionId: string, fromId: string, toId: string) => void;
  onSelectBlock: (blockId: string | undefined) => void;
  lookups: ThemeLookups;
}) {
  const sensors = useListSensors();
  const section = container?.sections?.[sel.sectionId];
  const schema = section ? schemaByType.get(section.type) : undefined;
  if (!section || !schema) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-[13px] font-semibold text-gray-500 hover:text-gray-800"><ChevronLeft className="h-4 w-4" /> Back</button>
        <p className="text-[13px] text-gray-500 mt-3">Section not found.</p>
      </div>
    );
  }

  const blockOrder: string[] = (section.block_order || Object.keys(section.blocks || {})).filter((bid: string) => section.blocks?.[bid]);
  const selectedBlock = sel.blockId ? section.blocks?.[sel.blockId] : null;
  const selectedBlockSchema = selectedBlock ? schema.blocks?.find((b: any) => b.type === selectedBlock.type) : null;
  const countOf = (type: string) => blockOrder.filter((bid) => section.blocks[bid]?.type === type).length;
  const roomLeft = schema.max_blocks === undefined || blockOrder.length < schema.max_blocks;
  const sectionSub = itemSubtitle(section.settings, schema.name);
  const onDragEnd = (e: DragEndEvent) => { if (e.over && e.active.id !== e.over.id) onReorderBlocks(sel.scope, sel.sectionId, String(e.active.id), String(e.over.id)); };

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-2 z-10">
        <button onClick={() => (sel.blockId ? onSelectBlock(undefined) : onBack())} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Back"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-[13.5px] m-0 truncate">
            {sel.blockId ? (selectedBlockSchema?.name || selectedBlock?.type || 'Item') : schema.name}
          </p>
          <p className="text-[11px] text-gray-400 m-0 truncate">{sel.blockId ? `in ${schema.name}${sectionSub ? `: ${sectionSub}` : ''}` : sectionSub}</p>
        </div>
      </div>

      {sel.blockId && selectedBlock ? (
        <div className="p-4 space-y-4">
          {(selectedBlockSchema?.settings || []).map((st: any, i: number) => (
            <ThemeSettingField key={st.id ?? i} setting={st} lookups={lookups}
              value={selectedBlock.settings?.[st.id] ?? schemaDefaults([st])[st.id]}
              onChange={(v) => onChange(sel.scope, sel.sectionId, st.id, v, sel.blockId)} />
          ))}
          {(selectedBlockSchema?.settings || []).length === 0 && <p className="text-[12.5px] text-gray-400">This item has no settings.</p>}
          <button onClick={() => { onRemoveBlock(sel.scope, sel.sectionId, sel.blockId!); onSelectBlock(undefined); }}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-red-600 hover:text-red-700 pt-2">
            <Trash2 className="h-3.5 w-3.5" /> Remove this item
          </button>
        </div>
      ) : (
        <>
          {(schema.blocks || []).length > 0 && (
            <div className="border-b border-gray-100 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Items ({blockOrder.length})</p>
              {blockOrder.length === 0 && <p className="text-[12px] text-gray-400 mb-1">No items yet.</p>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={blockOrder} strategy={verticalListSortingStrategy}>
                  {blockOrder.map((bid, i) => {
                    const b = section.blocks[bid];
                    const bSchema = schema.blocks?.find((x: any) => x.type === b.type);
                    const sub = itemSubtitle(b.settings, bSchema?.name || b.type);
                    return (
                      <SortableRow key={bid} id={bid}>
                        {(handle) => (
                          <div className="group flex items-center gap-0.5 py-0.5">
                            {handle}
                            <button onClick={() => onSelectBlock(bid)} className="flex-1 min-w-0 text-left px-2 py-1.5 rounded-lg hover:bg-gray-100">
                              <span className="block text-[13px] font-medium text-gray-700 truncate">{sub || bSchema?.name || b.type}</span>
                              {sub && <span className="block text-[11px] text-gray-400 truncate">{bSchema?.name || b.type}</span>}
                            </button>
                            <div className="flex items-center opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button onClick={() => onMoveBlock(sel.scope, sel.sectionId, bid, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" aria-label="Move up" title="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                              <button onClick={() => onMoveBlock(sel.scope, sel.sectionId, bid, 1)} disabled={i === blockOrder.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" aria-label="Move down" title="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                              <button onClick={() => onRemoveBlock(sel.scope, sel.sectionId, bid)} className="p-1 rounded hover:bg-red-50 text-red-500" aria-label="Remove" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        )}
                      </SortableRow>
                    );
                  })}
                </SortableContext>
              </DndContext>
              {roomLeft ? (
                <div className="mt-2 space-y-1">
                  {(schema.blocks || []).map((b: any) => {
                    const full = b.limit !== undefined && countOf(b.type) >= b.limit;
                    return (
                      <button key={b.type} onClick={() => onAddBlock(sel.scope, sel.sectionId, b)} disabled={full}
                        title={full ? `This section holds at most ${b.limit}` : undefined}
                        className="w-full text-left inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 disabled:text-gray-400 disabled:cursor-not-allowed">
                        <Plus className="h-3.5 w-3.5" /> Add {(b.name || b.type).toLowerCase()}{full ? ` (at most ${b.limit})` : ''}
                      </button>
                    );
                  })}
                </div>
              ) : <p className="text-[11px] text-gray-500 mt-2 mb-0">This section holds at most {schema.max_blocks} items.</p>}
            </div>
          )}

          <div className="p-4 space-y-4">
            {(schema.settings || []).map((st: any, i: number) => (
              <ThemeSettingField key={st.id ?? i} setting={st} lookups={lookups}
                value={section.settings?.[st.id] ?? schemaDefaults([st])[st.id]}
                onChange={(v) => onChange(sel.scope, sel.sectionId, st.id, v)} />
            ))}
            {(schema.settings || []).length === 0 && <p className="text-[12.5px] text-gray-400">This section has no settings.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Theme settings (settings_schema.json) ─────────────────────────────────

function ThemeSettingsPanel({ schema, values, onBack, onChange, lookups }: {
  schema: any[];
  values: Record<string, any>;
  onBack: () => void;
  onChange: (key: string, value: any) => void;
  lookups: ThemeLookups;
}) {
  const groups = (schema || []).filter((g) => g?.name !== 'theme_info' && Array.isArray(g?.settings) && g.settings.length);
  const [open, setOpen] = useState<string | null>(groups[0]?.name ?? null);
  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-2 z-10">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Back"><ChevronLeft className="h-4 w-4" /></button>
        <p className="font-bold text-gray-900 text-[13.5px] m-0">Theme settings</p>
      </div>
      {groups.map((g) => (
        <div key={g.name} className="border-b border-gray-100">
          <button onClick={() => setOpen(open === g.name ? null : g.name)}
            className="w-full flex items-center justify-between px-4 py-3 text-[13px] font-semibold text-gray-800 hover:bg-gray-50">
            {g.name}
            <ChevronDown className={`h-4 w-4 transition-transform ${open === g.name ? 'rotate-180' : ''}`} />
          </button>
          {open === g.name && (
            <div className="px-4 pb-4 space-y-4">
              {g.settings.map((st: any, i: number) => (
                <ThemeSettingField key={st.id ?? i} setting={st} lookups={lookups}
                  value={values[st.id] ?? st.default}
                  onChange={(v) => onChange(st.id, v)} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
