import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Plus, Sparkles, ExternalLink, Settings2, Trash2, Eye, EyeOff, ChevronRight, LayoutTemplate, Layers, Info, SlidersHorizontal, FileText, Copy,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import InfoTip from '../../common/InfoTip';
import { useAiStatus } from '../../../lib/ai';
import { ALL_BUILTIN, BUILTIN_BY_ID, BLOCK_DEFS, BLOCK_BY_TYPE, FRONTEND_LABELS, defaultOrderFor, blockLabel, type SectionDef } from './catalog';
import { BlockEditor } from './BlockEditors';
import { SectionEditor } from './SectionEditors';
import DisplayPanel from './DisplayPanel';
import { APLUS_SECTION_ID, type ContentBlock, type PageSection, type StudioRowId, type DisplaySettings, type Frontend } from './types';

/**
 * PRODUCT PAGE STUDIO — the one place a product's page is composed.
 *
 * Replaces two overlapping editors (the A+ "Content" tab and the separate
 * gear-icon Sections Manager) with ONE ordered list of everything the page
 * renders below the buy box. Left: the page in order — sections, the
 * highlights group with its blocks nested, template-only sections, custom
 * sections — each with an on/off switch and drag handle. Right: the selected
 * item's Content and Display tabs.
 *
 * It edits state the form owns (`blocks` = aplus_content, `sections` =
 * page_sections); the form saves both in one PUT. Nothing here talks to the
 * server except the ✨ buttons, which only ever propose.
 */
export interface ProductDataRow { id: string; name: string; description: string; render: () => React.ReactNode }

export interface ProductPageStudioProps {
  blocks: ContentBlock[];
  onBlocksChange: (blocks: ContentBlock[]) => void;
  sections: PageSection[];
  onSectionsChange: (sections: PageSection[]) => void;
  productId?: string | null;
  draft: () => Record<string, any> | null | undefined;
  productName?: string;
  productImages?: string[];
  storefrontUrl?: string;
  onGenerateWithAi?: () => void;
  /** Product-owned data the sections render (specifications, care instructions) — edited in place. */
  productDataRows?: ProductDataRow[];
}

const FRONTEND_BADGE: Record<Frontend, string> = { storefront: 'Storefront', ecom: 'Template', template: 'Theme' };

function customDef(sec: PageSection): SectionDef {
  return { id: sec.sectionId, name: sec.name || sec.sectionId, description: 'Custom section (rendered by your own theme code).', frontends: ['storefront', 'ecom', 'template'], group: 'template', editor: 'custom', display: ['heading', 'hideOn', 'frontends', 'anchor'] };
}

const SortableRow: React.FC<{ id: string; children: (handle: React.ReactNode) => React.ReactNode; className?: string }> = ({ id, children, className = '' }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const handle = (
    <button type="button" {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none shrink-0" aria-label="Drag to reorder" tabIndex={-1}>
      <GripVertical size={14} />
    </button>
  );
  return <div ref={setNodeRef} style={style} className={className}>{children(handle)}</div>;
};

const ProductPageStudio: React.FC<ProductPageStudioProps> = ({
  blocks, onBlocksChange, sections, onSectionsChange, productId, draft, productName, productImages, storefrontUrl, onGenerateWithAi, productDataRows = [],
}) => {
  const ai = useAiStatus();
  const [selected, setSelected] = useState<StudioRowId | null>(null);
  const [editorTab, setEditorTab] = useState<'content' | 'display'>('content');
  const [addOpen, setAddOpen] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [customName, setCustomName] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const ctx = useMemo(() => ({ productId, draft, productImages }), [productId, draft, productImages]);

  // ── the ordered page ────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const saved = new Map(sections.map((s) => [s.sectionId, s]));
    const hasSaved = sections.length > 0;
    const builtin = ALL_BUILTIN.map((def, i) => ({
      def,
      sec: saved.get(def.id) ?? { sectionId: def.id, enabled: true, order: hasSaved ? 1000 + i : defaultOrderFor(def.id) },
    }));
    const custom = sections.filter((s) => !BUILTIN_BY_ID[s.sectionId]).map((sec) => ({ def: customDef(sec), sec }));
    return [...builtin, ...custom].sort((a, b) => a.sec.order - b.sec.order);
  }, [sections]);

  // Template-only rows are listed only when expanded OR when the product has saved content for them (see the render loop).

  const writeSections = useCallback((next: Array<{ def: SectionDef; sec: PageSection }>) => {
    // Persist EVERY row with its explicit order so the frontends and the studio agree.
    onSectionsChange(next.map((r, i) => ({ ...r.sec, order: i, ...(r.def.editor === 'custom' ? { name: r.def.name } : {}) })));
  }, [onSectionsChange]);

  const patchSection = (sectionId: string, patch: Partial<PageSection>) => {
    const next = rows.map((r) => (r.def.id === sectionId ? { ...r, sec: { ...r.sec, ...patch } } : r));
    writeSections(next);
  };

  const patchBlock = (index: number, block: ContentBlock) => {
    const next = [...blocks]; next[index] = block; onBlocksChange(next);
  };

  const addBlock = (type: string) => {
    const def = BLOCK_BY_TYPE[type]; if (!def) return;
    onBlocksChange([...blocks, def.make()]);
    setSelected({ kind: 'block', index: blocks.length }); setEditorTab('content'); setAddOpen(false);
  };

  const removeBlock = (index: number) => {
    onBlocksChange(blocks.filter((_, i) => i !== index));
    setSelected(null);
  };

  const duplicateBlock = (index: number) => {
    const copy = JSON.parse(JSON.stringify(blocks[index]));
    const next = [...blocks]; next.splice(index + 1, 0, copy); onBlocksChange(next);
    setSelected({ kind: 'block', index: index + 1 });
  };

  const addCustom = () => {
    const name = customName.trim(); if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!id || rows.some((r) => r.def.id === id)) return;
    writeSections([...rows, { def: customDef({ sectionId: id, enabled: true, order: 999, name }), sec: { sectionId: id, enabled: true, order: 999, customData: {}, name } }]);
    setCustomName(''); setAddOpen(false); setSelected({ kind: 'section', sectionId: id });
  };

  const removeCustom = (sectionId: string) => {
    writeSections(rows.filter((r) => r.def.id !== sectionId));
    setSelected(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = String(active.id), o = String(over.id);
    if (a.startsWith('b:') && o.startsWith('b:')) {
      const from = Number(a.slice(2)), to = Number(o.slice(2));
      onBlocksChange(arrayMove(blocks, from, to));
      if (selected?.kind === 'block') setSelected({ kind: 'block', index: to });
      return;
    }
    if (a.startsWith('s:') && o.startsWith('s:')) {
      const ids = rows.map((r) => `s:${r.def.id}`);
      const from = ids.indexOf(a), to = ids.indexOf(o);
      if (from === -1 || to === -1) return;
      writeSections(arrayMove(rows, from, to));
    }
  };

  // ── selected item ───────────────────────────────────────────────────────
  const selRow = selected?.kind === 'section' ? rows.find((r) => r.def.id === selected.sectionId) : null;
  const selBlock = selected?.kind === 'block' ? blocks[selected.index] : null;
  const selData = selected?.kind === 'product' ? productDataRows.find((p) => p.id === selected.id) : null;

  const enabledCount = rows.filter((r) => r.sec.enabled !== false).length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50/70">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5"><LayoutTemplate size={15} className="text-brand-600" /> Product page</h2>
          <p className="text-xs text-gray-500 mt-0.5">Everything below the buy box, in order. Switch sections on or off, drag to reorder, and set how each one looks.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`hidden md:inline-flex items-center gap-1 px-2 h-6 rounded-full text-[11px] ${ai.canText ? 'bg-brand-50 text-brand-800 border border-brand-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
            title={ai.canText ? `Text: ${ai.status?.text?.provider} · Images: ${ai.status?.image ? ai.status.image.provider : 'off'}` : ai.textReason || ''}>
            <Sparkles size={11} /> {ai.loading ? 'AI…' : ai.canText ? `AI ready · ${ai.status?.text?.provider}` : 'AI off'}
          </span>
          {onGenerateWithAi && (
            <button type="button" onClick={onGenerateWithAi} className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700">
              <Sparkles size={13} /> Generate page with AI
            </button>
          )}
          {storefrontUrl && (
            <a href={storefrontUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 h-8 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-gray-700">
              <ExternalLink size={12} /> View page
            </a>
          )}
          <Link to="/appearance/products" className="inline-flex items-center gap-1 px-2.5 h-8 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-gray-700" title="Store-wide product page switches">
            <Settings2 size={12} /> Store defaults
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        {/* Left: the page in order */}
        <div className="border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-50/40">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 inline-flex items-center gap-1">Page order <InfoTip text="The single-product template renders sections in this order. The storefront keeps its fixed layout (tabs → highlights → FAQs → reviews → related) and honours the on/off switches and display options." /></span>
            <div className="relative">
              <button type="button" onClick={() => setAddOpen((v) => !v)} className="inline-flex items-center gap-1 px-2 h-7 text-xs rounded-md bg-gray-900 text-white hover:bg-gray-800"><Plus size={12} /> Add</button>
              {addOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-1">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400">Highlight block</div>
                  {BLOCK_DEFS.map((b) => (
                    <button key={b.type} type="button" onClick={() => addBlock(b.type)} className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50">
                      <span className="block text-sm text-gray-800">{b.label}</span>
                      <span className="block text-[11px] text-gray-400">{b.description}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-100 mt-1 pt-1 px-2 py-1">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Custom section</div>
                    <div className="flex gap-1">
                      <input value={customName} onChange={(e) => setCustomName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="Section name" className="flex-1 h-7 px-2 text-xs border border-gray-300 rounded" />
                      <button type="button" onClick={addCustom} className="h-7 px-2 text-xs rounded bg-gray-100 hover:bg-gray-200">Add</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => `s:${r.def.id}`)} strategy={verticalListSortingStrategy}>
              <div className="p-2 space-y-1 max-h-[70vh] overflow-auto">
                {rows.map((r) => {
                  const isTemplate = r.def.group === 'template' && r.def.editor !== 'custom';
                  const hasContent = !!(r.sec.customData && Object.keys(r.sec.customData).length);
                  if (isTemplate && !showTemplate && !hasContent) return null;
                  const active = selected?.kind === 'section' && selected.sectionId === r.def.id;
                  const isAplus = r.def.id === APLUS_SECTION_ID;
                  return (
                    <SortableRow key={r.def.id} id={`s:${r.def.id}`}>
                      {(handle) => (
                        <div className={`rounded-md border ${active ? 'border-brand-300 bg-brand-50/50' : 'border-gray-200 bg-white hover:border-gray-300'} ${r.sec.enabled === false ? 'opacity-60' : ''}`}>
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            {handle}
                            <button type="button" onClick={() => { setSelected({ kind: 'section', sectionId: r.def.id }); setEditorTab('content'); }} className="flex-1 min-w-0 text-left">
                              <span className="flex items-center gap-1.5">
                                {isAplus ? <Layers size={13} className="text-brand-600 shrink-0" /> : <FileText size={13} className="text-gray-400 shrink-0" />}
                                <span className="text-[13px] text-gray-800 truncate">{r.sec.display?.heading || r.def.name}</span>
                                {hasContent && !isAplus && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" title="Has custom content" />}
                              </span>
                              <span className="flex items-center gap-1 mt-0.5">
                                {r.def.frontends.map((f) => <span key={f} className={`text-[9px] uppercase tracking-wide px-1 rounded ${f === 'ecom' && r.def.group === 'template' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{FRONTEND_BADGE[f]}</span>)}
                                {r.def.editor === 'custom' && <span className="text-[9px] uppercase tracking-wide px-1 rounded bg-purple-50 text-purple-700">Custom</span>}
                              </span>
                            </button>
                            <Switch checked={r.sec.enabled !== false} onCheckedChange={(v) => patchSection(r.def.id, { enabled: v })} className="data-[state=checked]:bg-brand-600 scale-90" aria-label={`Show ${r.def.name}`} />
                          </div>
                          {isAplus && (
                            <div className="border-t border-gray-100 bg-gray-50/60 px-2 py-1.5">
                              <SortableContext items={blocks.map((_, i) => `b:${i}`)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1">
                                  {blocks.length === 0 && <p className="text-[11px] text-gray-400 px-1 py-1">No blocks yet — use <b>Add</b> above.</p>}
                                  {blocks.map((b, i) => {
                                    const bActive = selected?.kind === 'block' && selected.index === i;
                                    const off = (b as any).display?.enabled === false;
                                    return (
                                      <SortableRow key={`b:${i}`} id={`b:${i}`}>
                                        {(h) => (
                                          <div className={`flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded border ${bActive ? 'border-brand-300 bg-white' : 'border-transparent hover:bg-white hover:border-gray-200'} ${off ? 'opacity-50' : ''}`}>
                                            {h}
                                            <button type="button" onClick={() => { setSelected({ kind: 'block', index: i }); setEditorTab('content'); }} className="flex-1 min-w-0 text-left text-xs text-gray-700 truncate">
                                              <span className="text-gray-400 mr-1">{i + 1}.</span>{blockLabel(b)}
                                            </button>
                                            <button type="button" onClick={() => patchBlock(i, { ...b, display: { ...((b as any).display || {}), ...(off ? { enabled: undefined } : { enabled: false }) } } as any)} className="text-gray-400 hover:text-gray-700" title={off ? 'Show block' : 'Hide block'}>{off ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                                          </div>
                                        )}
                                      </SortableRow>
                                    );
                                  })}
                                </div>
                              </SortableContext>
                            </div>
                          )}
                        </div>
                      )}
                    </SortableRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          <div className="px-3 py-2 border-t border-gray-200 space-y-1.5">
            <button type="button" onClick={() => setShowTemplate((v) => !v)} className="w-full text-left text-[11px] text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
              <ChevronRight size={12} className={`transition-transform ${showTemplate ? 'rotate-90' : ''}`} /> {showTemplate ? 'Hide' : 'Show'} single-product template sections
            </button>
            {productDataRows.length > 0 && (
              <div className="pt-1">
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Product data used by sections</div>
                {productDataRows.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setSelected({ kind: 'product', id: p.id }); setEditorTab('content'); }}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-[13px] ${selected?.kind === 'product' && selected.id === p.id ? 'bg-brand-50 text-brand-900 border border-brand-200' : 'text-gray-700 hover:bg-white border border-transparent'}`}>
                    <span className="flex items-center gap-1.5"><SlidersHorizontal size={12} className="text-gray-400" /> {p.name}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-400">{enabledCount} of {rows.length} sections on · {blocks.length} highlight block{blocks.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {/* Right: editor */}
        <div className="min-w-0 p-4 lg:p-5">
          {!selected && (
            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-gray-400">
              <LayoutTemplate size={36} className="mb-3 text-gray-300" />
              <p className="text-sm text-gray-600 font-medium">Pick a section or block on the left</p>
              <p className="text-xs mt-1 max-w-sm">Edit its content, then open <b>Display</b> to choose the heading, width, background, columns and which devices show it.</p>
              {onGenerateWithAi && <button type="button" onClick={onGenerateWithAi} className="mt-4 inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md border border-brand-300 text-brand-700 bg-brand-50 hover:bg-brand-100"><Sparkles size={13} /> Or let AI draft the whole page</button>}
            </div>
          )}

          {selRow && (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900">{selRow.def.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selRow.def.description}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Shown on: {selRow.def.frontends.map((f) => FRONTEND_LABELS[f]).join(', ')}{selRow.def.editedIn ? ` · content from ${selRow.def.editedIn}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-600"><Switch checked={selRow.sec.enabled !== false} onCheckedChange={(v) => patchSection(selRow.def.id, { enabled: v })} className="data-[state=checked]:bg-brand-600" /> {selRow.sec.enabled !== false ? 'Shown' : 'Hidden'}</label>
                  {selRow.def.editor === 'custom' && <button type="button" onClick={() => removeCustom(selRow.def.id)} className="inline-flex items-center gap-1 px-2 h-7 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"><Trash2 size={12} /> Remove</button>}
                </div>
              </div>
              <EditorTabs tab={editorTab} onTab={setEditorTab} hasDisplay={selRow.def.display.length > 0} />
              {editorTab === 'content' ? (
                selRow.def.id === APLUS_SECTION_ID ? (
                  <div className="text-sm text-gray-600 space-y-2">
                    <p>The highlight blocks are listed under this row on the left — click one to edit it, drag to reorder, or use <b>Add</b> to insert a new block.</p>
                    <p className="text-xs text-gray-400 inline-flex items-center gap-1"><Info size={12} /> Switching this row off hides every block without deleting them.</p>
                  </div>
                ) : (
                  <SectionEditor kind={selRow.def.editor} sectionId={selRow.def.id} sectionName={selRow.def.name}
                    data={selRow.sec.customData ?? selRow.def.defaults?.() ?? {}} onChange={(d) => patchSection(selRow.def.id, { customData: d })} ctx={ctx} />
                )
              ) : (
                <DisplayPanel value={selRow.sec.display} onChange={(d) => patchSection(selRow.def.id, { display: d })} options={selRow.def.display}
                  ai={{ entityId: productId, draft, sectionName: selRow.def.name }} defaultHeading={selRow.def.id === APLUS_SECTION_ID ? 'Product Highlights' : selRow.def.name} />
              )}
            </div>
          )}

          {selBlock && selected?.kind === 'block' && (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900">Block {selected.index + 1} · {BLOCK_BY_TYPE[selBlock.type]?.label || selBlock.type}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{BLOCK_BY_TYPE[selBlock.type]?.description || 'A content block in the product highlights.'}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => duplicateBlock(selected.index)} className="inline-flex items-center gap-1 px-2 h-7 text-xs border border-gray-300 rounded hover:bg-gray-50"><Copy size={12} /> Duplicate</button>
                  <button type="button" onClick={() => removeBlock(selected.index)} className="inline-flex items-center gap-1 px-2 h-7 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"><Trash2 size={12} /> Remove</button>
                </div>
              </div>
              <EditorTabs tab={editorTab} onTab={setEditorTab} hasDisplay />
              {editorTab === 'content' ? (
                <BlockEditor block={selBlock} onChange={(b) => patchBlock(selected.index, { ...b, display: (selBlock as any).display } as any)} ctx={ctx} />
              ) : (
                <DisplayPanel value={(selBlock as any).display as DisplaySettings | undefined}
                  onChange={(d) => patchBlock(selected.index, { ...selBlock, display: d } as any)}
                  options={BLOCK_BY_TYPE[selBlock.type]?.display || ['hideOn', 'frontends']}
                  ai={{ entityId: productId, draft, sectionName: BLOCK_BY_TYPE[selBlock.type]?.label || 'block' }} />
              )}
            </div>
          )}

          {selData && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{selData.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">{selData.description}</p>
              {selData.render()}
            </div>
          )}
        </div>
      </div>
      {productName ? null : null}
    </div>
  );
};

const EditorTabs: React.FC<{ tab: 'content' | 'display'; onTab: (t: 'content' | 'display') => void; hasDisplay: boolean }> = ({ tab, onTab, hasDisplay }) => (
  <div className="inline-flex rounded-md border border-gray-200 bg-gray-100 p-0.5 mb-4">
    <button type="button" onClick={() => onTab('content')} className={`px-3 h-7 text-xs rounded ${tab === 'content' ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500'}`}>Content</button>
    <button type="button" disabled={!hasDisplay} onClick={() => onTab('display')} className={`px-3 h-7 text-xs rounded ${tab === 'display' ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500'} disabled:opacity-40`}>Display</button>
  </div>
);

export default ProductPageStudio;
