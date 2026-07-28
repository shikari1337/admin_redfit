import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronDown, ChevronUp, Eye, EyeOff, GripVertical,
  Loader2, Monitor, Plus, Settings2, Smartphone, Tablet, Trash2, X, LayoutTemplate,
} from 'lucide-react';
import { themeEngineAPI, EditorPayload, SectionSchema } from '../services/themeEngine';

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

  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable state (the draft)
  const [settingsData, setSettingsData] = useState<Record<string, any>>({});
  const [templates, setTemplates] = useState<Record<string, any>>({});
  const [groups, setGroups] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);

  const [currentTemplate, setCurrentTemplate] = useState('index');
  const [sel, setSel] = useState<PanelSel>({ kind: 'tree' });
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeRev, setIframeRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addPicker, setAddPicker] = useState<string | null>(null); // scope to add into
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

  // ── Draft sync (debounced) → reload preview ─────────────────────────────
  const syncTimer = useRef<ReturnType<typeof setTimeout>>();
  const pushDraft = useCallback((s: any, t: any, g: any) => {
    if (!themeId) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        await themeEngineAPI.saveDraft(themeId, { settingsData: s, templates: t, groups: g });
        setIframeRev((r) => r + 1);
      } catch { /* preview just stays stale */ }
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
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, groups, currentTemplate]);

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

  const addSection = (scope: string, schema: SectionSchema) => {
    const preset = schema.presets?.[0];
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
  const addBlock = (scope: string, sectionId: string, blockSchema: any) => mutate((d) => {
    const c = getContainer(d, scope);
    const s = c?.sections?.[sectionId];
    if (!s) return;
    const bid = genId('block');
    s.blocks = s.blocks || {};
    s.blocks[bid] = { type: blockSchema.type, settings: schemaDefaults(blockSchema.settings) };
    s.block_order = [...(s.block_order || Object.keys(s.blocks).filter((k) => k !== bid)), bid];
  });

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
      setIframeRev((r) => r + 1);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const onDiscard = async () => {
    if (!themeId || !payload) return;
    if (dirty && !window.confirm('Discard all unsaved changes?')) return;
    await themeEngineAPI.discardDraft(themeId).catch(() => {});
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
  const previewUrl = `${themeEngineAPI.previewUrl(themeId, currentTemplate)}&rev=${iframeRev}`;

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
          {TEMPLATE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
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
          {dirty && <span className="text-[11px] font-semibold text-amber-600 hidden sm:inline">Unsaved changes</span>}
          <button onClick={onDiscard} className="px-3 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Discard</button>
          <button onClick={onPublish} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-[13px] font-bold hover:bg-indigo-700 disabled:opacity-60">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
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
              onSelectBlock={(blockId) => setSel({ ...sel, blockId })}
            />
          ) : sel.kind === 'themeSettings' ? (
            <ThemeSettingsPanel
              schema={payload.settingsSchema}
              values={settingsData}
              onBack={() => setSel({ kind: 'tree' })}
              onChange={(key, value) => mutate((d) => { d.settingsData[key] = value; })}
            />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {headerGroups.map((g) => (
                <SectionTreeGroup key={g} label="Header" scope={`group:${g}`} container={groups[g]}
                  schemaByType={sectionSchemaByType}
                  onSelect={(sid) => { setSel({ kind: 'section', scope: `group:${g}`, sectionId: sid }); scrollPreviewTo(sid); }}
                  onMove={moveSection} onToggle={toggleSection} onRemove={removeSection}
                  onAdd={() => setAddPicker(`group:${g}`)}
                />
              ))}
              <SectionTreeGroup label="Template" scope={templateScope} container={templateContainer}
                schemaByType={sectionSchemaByType}
                emptyNote={templates[currentTemplate]?.__liquid
                  ? 'This template is a .liquid file — edit it in the code editor.'
                  : 'No sections yet.'}
                onSelect={(sid) => { setSel({ kind: 'section', scope: templateScope, sectionId: sid }); scrollPreviewTo(sid); }}
                onMove={moveSection} onToggle={toggleSection} onRemove={removeSection}
                onAdd={() => setAddPicker(templateScope)}
              />
              {footerGroups.map((g) => (
                <SectionTreeGroup key={g} label="Footer" scope={`group:${g}`} container={groups[g]}
                  schemaByType={sectionSchemaByType}
                  onSelect={(sid) => { setSel({ kind: 'section', scope: `group:${g}`, sectionId: sid }); scrollPreviewTo(sid); }}
                  onMove={moveSection} onToggle={toggleSection} onRemove={removeSection}
                  onAdd={() => setAddPicker(`group:${g}`)}
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
          <iframe
            ref={iframeRef}
            key={`${currentTemplate}`}
            src={previewUrl}
            title="Theme preview"
            className="bg-white rounded-xl shadow-lg border border-gray-200 h-full"
            style={{ width: DEVICE_WIDTHS[device], maxWidth: '100%', transition: 'width .2s' }}
          />
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
                .filter((s) => !/^main-/.test(s.type) && !/-group$/.test(s.type))
                .map((s) => (
                  <button key={s.type} onClick={() => addSection(addPicker, s)}
                    className="text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-400 hover:bg-indigo-50/40">
                    <span className="block text-[13.5px] font-semibold text-gray-800">{s.name}</span>
                    <span className="block text-[11.5px] text-gray-400 mt-0.5">{s.settings?.length || 0} settings{s.blocks?.length ? ` · ${s.blocks.length} block types` : ''}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section tree group (Header / Template / Footer) ───────────────────────

function SectionTreeGroup({ label, scope, container, schemaByType, onSelect, onMove, onToggle, onRemove, onAdd, emptyNote }: {
  label: string;
  scope: string;
  container: any | null;
  schemaByType: Map<string, SectionSchema>;
  onSelect: (sectionId: string) => void;
  onMove: (scope: string, sectionId: string, dir: -1 | 1) => void;
  onToggle: (scope: string, sectionId: string) => void;
  onRemove: (scope: string, sectionId: string) => void;
  onAdd: () => void;
  emptyNote?: string;
}) {
  const order: string[] = container?.order || Object.keys(container?.sections || {});
  return (
    <div className="border-b border-gray-100 py-2">
      <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 m-0">{label}</p>
      {order.length === 0 && <p className="px-4 py-1 text-[12px] text-gray-400 m-0">{emptyNote || 'No sections.'}</p>}
      {order.map((sid, i) => {
        const s = container?.sections?.[sid];
        if (!s) return null;
        const name = schemaByType.get(s.type)?.name || s.type;
        return (
          <div key={sid} className="group flex items-center gap-1 px-2 py-0.5">
            <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
            <button onClick={() => onSelect(sid)}
              className={`flex-1 text-left px-2 py-1.5 rounded-lg text-[13px] font-medium hover:bg-gray-100 truncate ${s.disabled ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
              {name}
            </button>
            <div className="hidden group-hover:flex items-center">
              <button onClick={() => onMove(scope, sid, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" title="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button onClick={() => onMove(scope, sid, 1)} disabled={i === order.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" title="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
              <button onClick={() => onToggle(scope, sid)} className="p-1 rounded hover:bg-gray-100" title={s.disabled ? 'Show' : 'Hide'}>
                {s.disabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => onRemove(scope, sid)} className="p-1 rounded hover:bg-red-50 text-red-500" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        );
      })}
      {container && (
        <button onClick={onAdd} className="mx-4 mt-1.5 mb-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800">
          <Plus className="h-3.5 w-3.5" /> Add section
        </button>
      )}
    </div>
  );
}

// ── Per-section settings panel (schema-driven) ────────────────────────────

function SectionSettingsPanel({ sel, container, schemaByType, onBack, onChange, onAddBlock, onRemoveBlock, onMoveBlock, onSelectBlock }: {
  sel: { kind: 'section'; scope: string; sectionId: string; blockId?: string };
  container: any | null;
  schemaByType: Map<string, SectionSchema>;
  onBack: () => void;
  onChange: (scope: string, sectionId: string, key: string, value: any, blockId?: string) => void;
  onAddBlock: (scope: string, sectionId: string, blockSchema: any) => void;
  onRemoveBlock: (scope: string, sectionId: string, blockId: string) => void;
  onMoveBlock: (scope: string, sectionId: string, blockId: string, dir: -1 | 1) => void;
  onSelectBlock: (blockId: string | undefined) => void;
}) {
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

  const blockOrder: string[] = section.block_order || Object.keys(section.blocks || {});
  const selectedBlock = sel.blockId ? section.blocks?.[sel.blockId] : null;
  const selectedBlockSchema = selectedBlock ? schema.blocks?.find((b: any) => b.type === selectedBlock.type) : null;

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-2 z-10">
        <button onClick={() => (sel.blockId ? onSelectBlock(undefined) : onBack())} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
        <p className="font-bold text-gray-900 text-[13.5px] m-0 truncate">
          {sel.blockId ? (selectedBlockSchema?.name || selectedBlock?.type || 'Block') : schema.name}
        </p>
      </div>

      {sel.blockId && selectedBlock ? (
        <div className="p-4 space-y-4">
          {(selectedBlockSchema?.settings || []).map((st: any, i: number) => (
            <SettingField key={st.id ?? i} setting={st}
              value={selectedBlock.settings?.[st.id] ?? schemaDefaults([st])[st.id]}
              onChange={(v) => onChange(sel.scope, sel.sectionId, st.id, v, sel.blockId)} />
          ))}
        </div>
      ) : (
        <>
          <div className="p-4 space-y-4">
            {(schema.settings || []).map((st: any, i: number) => (
              <SettingField key={st.id ?? i} setting={st}
                value={section.settings?.[st.id] ?? schemaDefaults([st])[st.id]}
                onChange={(v) => onChange(sel.scope, sel.sectionId, st.id, v)} />
            ))}
            {(schema.settings || []).length === 0 && <p className="text-[12.5px] text-gray-400">This section has no settings.</p>}
          </div>

          {(schema.blocks || []).length > 0 && (
            <div className="border-t border-gray-100 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Blocks</p>
              {blockOrder.map((bid, i) => {
                const b = section.blocks?.[bid];
                if (!b) return null;
                const bSchema = schema.blocks?.find((x: any) => x.type === b.type);
                return (
                  <div key={bid} className="group flex items-center gap-1 py-0.5">
                    <button onClick={() => onSelectBlock(bid)} className="flex-1 text-left px-2 py-1.5 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-100 truncate">
                      {bSchema?.name || b.type}
                    </button>
                    <div className="hidden group-hover:flex items-center">
                      <button onClick={() => onMoveBlock(sel.scope, sel.sectionId, bid, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onMoveBlock(sel.scope, sel.sectionId, bid, 1)} disabled={i === blockOrder.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onRemoveBlock(sel.scope, sel.sectionId, bid)} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                );
              })}
              {(schema.max_blocks === undefined || blockOrder.length < schema.max_blocks) && (
                <div className="mt-2 space-y-1">
                  {(schema.blocks || []).map((b: any) => (
                    <button key={b.type} onClick={() => onAddBlock(sel.scope, sel.sectionId, b)}
                      className="w-full text-left inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1">
                      <Plus className="h-3.5 w-3.5" /> Add {b.name || b.type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Theme settings (settings_schema.json) ─────────────────────────────────

function ThemeSettingsPanel({ schema, values, onBack, onChange }: {
  schema: any[];
  values: Record<string, any>;
  onBack: () => void;
  onChange: (key: string, value: any) => void;
}) {
  const groups = (schema || []).filter((g) => g?.name !== 'theme_info' && Array.isArray(g?.settings) && g.settings.length);
  const [open, setOpen] = useState<string | null>(groups[0]?.name ?? null);
  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-2 z-10">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
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
                <SettingField key={st.id ?? i} setting={st}
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

// ── One schema setting → input control ────────────────────────────────────

function SettingField({ setting, value, onChange }: { setting: any; value: any; onChange: (v: any) => void }) {
  const t = setting.type;
  const label = setting.label || setting.id;

  if (t === 'header') return <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 pt-2 mb-0">{setting.content}</p>;
  if (t === 'paragraph') return <p className="text-[12px] text-gray-500 m-0">{setting.content}</p>;

  const labelEl = <label className="block text-[12.5px] font-semibold text-gray-700 mb-1">{label}</label>;
  const inputCls = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400';

  switch (t) {
    case 'checkbox':
      return (
        <label className="flex items-center justify-between gap-2 text-[13px] font-semibold text-gray-700 cursor-pointer">
          {label}
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
        </label>
      );
    case 'range':
      return (
        <div>
          {labelEl}
          <div className="flex items-center gap-2">
            <input type="range" min={setting.min ?? 0} max={setting.max ?? 100} step={setting.step ?? 1}
              value={Number(value ?? setting.default ?? setting.min ?? 0)}
              onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-indigo-600" />
            <span className="text-[12px] text-gray-500 w-14 text-right">{value ?? setting.default}{setting.unit || ''}</span>
          </div>
        </div>
      );
    case 'select':
    case 'radio':
      return (
        <div>
          {labelEl}
          <select value={value ?? setting.default ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
            {(setting.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      );
    case 'color':
    case 'color_background':
      return (
        <div>
          {labelEl}
          <div className="flex items-center gap-2">
            <input type="color" value={/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(String(value)) ? value : '#000000'}
              onChange={(e) => onChange(e.target.value)} className="h-8 w-10 rounded border border-gray-300 p-0.5 bg-white" />
            <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="#000000" />
          </div>
        </div>
      );
    case 'textarea':
    case 'richtext':
    case 'inline_richtext':
    case 'html':
    case 'liquid':
      return (
        <div>
          {labelEl}
          <textarea rows={t === 'textarea' ? 3 : 4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
          {(t === 'richtext' || t === 'html') && <p className="text-[11px] text-gray-400 mt-1 mb-0">HTML supported (e.g. &lt;p&gt;…&lt;/p&gt;)</p>}
        </div>
      );
    case 'image_picker':
      return (
        <div>
          {labelEl}
          {value ? (
            <div className="relative mb-1.5">
              <img src={value} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200" />
              <button onClick={() => onChange('')} className="absolute top-1.5 right-1.5 bg-white/90 rounded-full p-1 shadow" title="Remove image">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="Paste image URL (media library / upload URL)" />
        </div>
      );
    case 'number':
      return (
        <div>
          {labelEl}
          <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls} />
        </div>
      );
    default:
      // text, url, link_list, collection, product, blog, page, font_picker, video_url…
      return (
        <div>
          {labelEl}
          <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls}
            placeholder={t === 'collection' ? 'collection handle (slug)' : t === 'product' ? 'product handle (slug)' : t === 'link_list' ? 'menu handle (e.g. main-menu)' : setting.placeholder || ''} />
          {['collection', 'product', 'link_list', 'url', 'font_picker'].includes(t) && (
            <p className="text-[11px] text-gray-400 mt-1 mb-0">
              {t === 'collection' && 'Category slug from Catalog → Categories.'}
              {t === 'product' && 'Product slug from Catalog → Products.'}
              {t === 'link_list' && 'Menu handle from Appearance → Menus.'}
              {t === 'url' && 'Any path (/collections/x) or full URL.'}
              {t === 'font_picker' && 'Font stack name (theme-defined).'}
            </p>
          )}
        </div>
      );
  }
}
