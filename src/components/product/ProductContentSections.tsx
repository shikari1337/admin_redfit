import React, { useState, createContext, useContext } from 'react';
import IconPicker from '../IconPicker';
import RichTextEditor from '../common/RichTextEditor';
import ImageField from '../common/ImageField';
import { productsAPI } from '../../services/api';

// Product id is needed by the AI text endpoint (it loads the product for context).
// Provided via context so we don't prop-drill through every block editor.
const AplusAiContext = createContext<string | undefined>(undefined);

/** Inline "✨ AI" button that generates text for a field. Disabled until the product is saved. */
const AiTextButton: React.FC<{ hint: string; onResult: (text: string) => void }> = ({ hint, onResult }) => {
  const productId = useContext(AplusAiContext);
  const [busy, setBusy] = useState(false);
  const disabled = !productId || busy;
  const run = async () => {
    if (!productId) return;
    setBusy(true);
    try {
      const res: any = await productsAPI.generateField(productId, `aplus:${hint}`, 'text', hint);
      const text = res?.data?.value ?? res?.value ?? '';
      if (text) onResult(String(text));
    } catch (e) {
      console.error('AI generate failed', e);
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={run} disabled={disabled}
      title={productId ? 'Generate with AI' : 'Save the product first to use AI'}
      className="text-xs px-2 py-0.5 rounded border border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
      {busy ? '✨ …' : '✨ AI'}
    </button>
  );
};

export type ContentBlock =
  | { type: 'text'; data: { heading?: string; body: string } }
  | { type: 'image_text'; data: { heading?: string; body: string; imageUrl: string; imagePosition: 'left' | 'right' } }
  | { type: 'icon_box'; items: Array<{ icon: string; title: string; desc: string }> }
  | { type: 'faq'; items: Array<{ q: string; a: string }> }
  | { type: 'video'; url: string; caption?: string }
  | { type: 'highlight_strip'; items: Array<{ icon: string; title?: string; text: string }> };

interface ProductContentSectionsProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  /** Saved product id — enables inline AI text generation. Undefined for unsaved products. */
  productId?: string;
}

const blockLabels: Record<string, string> = {
  text: 'Text Block',
  image: 'Full-width Image / Banner',
  image_text: 'Image + Text',
  icon_box: 'Icon Feature Box',
  highlight_strip: 'Highlight Strip',
  comparison_table: 'Comparison Table',
  faq: 'FAQ Accordion',
  video: 'Embedded Video',
};

const blockDefaults: Record<string, ContentBlock> = {
  text: { type: 'text', data: { heading: '', body: '' } },
  // `image` (and its `banner` alias) is what imported/seeded A+ content uses for
  // a full-width lifestyle shot. It had no editor, so those blocks showed as
  // "Unknown block type" and could not be edited even though they were live.
  image: { type: 'image', data: { heading: '', imageUrl: '', alt: '' } } as any,
  image_text: { type: 'image_text', data: { heading: '', body: '', imageUrl: '', imagePosition: 'left' } },
  icon_box: { type: 'icon_box', items: [{ icon: 'lucide:Check', title: '', desc: '' }] },
  highlight_strip: { type: 'highlight_strip', items: [{ icon: 'lucide:Star', text: '' }] },
  comparison_table: { type: 'comparison_table', data: { heading: '', headers: ['', ''], rows: [['', '']] } } as any,
  faq: { type: 'faq', items: [{ q: '', a: '' }] },
  video: { type: 'video', url: '', caption: '' },
};

const inputCls = 'w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

const TextEditor: React.FC<{ block: Extract<ContentBlock, { type: 'text' }>; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => (
  <div className="space-y-2">
    <div><label className={labelCls}>Heading (optional)</label>
      <input className={inputCls} value={block.data.heading || ''} placeholder="Section heading"
        onChange={e => onChange({ ...block, data: { ...block.data, heading: e.target.value } })} /></div>
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={labelCls + ' mb-0'}>Body</label>
        <AiTextButton hint={`A+ content body${block.data.heading ? ' for "' + block.data.heading + '"' : ''}`}
          onResult={text => onChange({ ...block, data: { ...block.data, body: text } })} />
      </div>
      <RichTextEditor value={block.data.body} minHeight={140}
        onChange={html => onChange({ ...block, data: { ...block.data, body: html } })} /></div>
  </div>
);

const ImageTextEditor: React.FC<{ block: Extract<ContentBlock, { type: 'image_text' }>; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => (
  <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelCls}>Image</label>
        <ImageField value={block.data.imageUrl} folder="products/aplus"
          aiPrompt={block.data.heading ? `Product A+ content image for "${block.data.heading}"` : 'Product A+ content image'}
          onChange={url => onChange({ ...block, data: { ...block.data, imageUrl: url } })} />
      </div>
      <div><label className={labelCls}>Image Position</label>
        <select className={inputCls} value={block.data.imagePosition}
          onChange={e => onChange({ ...block, data: { ...block.data, imagePosition: e.target.value as 'left' | 'right' } })}>
          <option value="left">Left</option><option value="right">Right</option>
        </select></div>
    </div>
    <div><label className={labelCls}>Heading</label>
      <input className={inputCls} value={block.data.heading || ''} placeholder="Heading"
        onChange={e => onChange({ ...block, data: { ...block.data, heading: e.target.value } })} /></div>
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={labelCls + ' mb-0'}>Body</label>
        <AiTextButton hint={`A+ image section body${block.data.heading ? ' for "' + block.data.heading + '"' : ''}`}
          onResult={text => onChange({ ...block, data: { ...block.data, body: text } })} />
      </div>
      <RichTextEditor value={block.data.body} minHeight={120}
        onChange={html => onChange({ ...block, data: { ...block.data, body: html } })} /></div>
  </div>
);

const IconBoxEditor: React.FC<{ block: Extract<ContentBlock, { type: 'icon_box' }>; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => (
  <div className="space-y-2">
    {block.items.map((item, i) => (
      <div key={i} className="flex gap-2 items-start p-2 bg-gray-50 rounded border">
        <div className="shrink-0">
          <IconPicker value={item.icon} label=""
            onChange={icon => { const items = [...block.items]; items[i] = { ...item, icon }; onChange({ ...block, items }); }} />
        </div>
        <div className="flex-1 space-y-1">
          <input className={inputCls} value={item.title} placeholder="Feature title"
            onChange={e => { const items = [...block.items]; items[i] = { ...item, title: e.target.value }; onChange({ ...block, items }); }} />
          <input className={inputCls} value={item.desc} placeholder="Short description"
            onChange={e => { const items = [...block.items]; items[i] = { ...item, desc: e.target.value }; onChange({ ...block, items }); }} />
        </div>
        <button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
          className="text-red-400 hover:text-red-600 text-sm mt-1">✕</button>
      </div>
    ))}
    <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { icon: 'lucide:Check', title: '', desc: '' }] })}
      className="text-xs text-blue-600 hover:text-blue-800">+ Add Item</button>
  </div>
);

const FAQEditor: React.FC<{ block: Extract<ContentBlock, { type: 'faq' }>; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => (
  <div className="space-y-2">
    {block.items.map((item, i) => (
      <div key={i} className="p-2 bg-gray-50 rounded border space-y-1.5">
        <div className="flex gap-2">
          <div className="flex-1"><label className={labelCls}>Question</label>
            <input className={inputCls} value={item.q}
              onChange={e => { const items = [...block.items]; items[i] = { ...item, q: e.target.value }; onChange({ ...block, items }); }} /></div>
          <button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
            className="text-red-400 hover:text-red-600 text-sm mt-4 shrink-0">✕</button>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls + ' mb-0'}>Answer</label>
            {item.q && <AiTextButton hint={`FAQ answer to: ${item.q}`}
              onResult={text => { const items = [...block.items]; items[i] = { ...item, a: text }; onChange({ ...block, items }); }} />}
          </div>
          <textarea rows={2} className={inputCls} value={item.a}
            onChange={e => { const items = [...block.items]; items[i] = { ...item, a: e.target.value }; onChange({ ...block, items }); }} /></div>
      </div>
    ))}
    <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { q: '', a: '' }] })}
      className="text-xs text-blue-600 hover:text-blue-800">+ Add Q&A</button>
  </div>
);

const VideoEditor: React.FC<{ block: Extract<ContentBlock, { type: 'video' }>; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => (
  <div className="space-y-2">
    <div><label className={labelCls}>Video URL (YouTube / Vimeo / direct)</label>
      <input className={inputCls} value={block.url} placeholder="https://youtube.com/watch?v=…"
        onChange={e => onChange({ ...block, url: e.target.value })} /></div>
    <div><label className={labelCls}>Caption (optional)</label>
      <input className={inputCls} value={block.caption || ''} placeholder="Video caption"
        onChange={e => onChange({ ...block, caption: e.target.value })} /></div>
  </div>
);

const HighlightEditor: React.FC<{ block: Extract<ContentBlock, { type: 'highlight_strip' }>; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => (
  <div className="space-y-2">
    {block.items.map((item, i) => (
      <div key={i} className="flex gap-2 items-start p-2 bg-gray-50 rounded border">
        <div className="shrink-0">
          <IconPicker value={item.icon} label=""
            onChange={icon => { const items = [...block.items]; items[i] = { ...item, icon }; onChange({ ...block, items }); }} />
        </div>
        {/* Each highlight has a HEADING and body text — editing only the text
            silently dropped every heading on save. */}
        <div className="flex-1 space-y-1">
          <input className={inputCls} value={item.title ?? ''} placeholder="Heading (e.g. Water-Resistant)"
            onChange={e => { const items = [...block.items]; items[i] = { ...item, title: e.target.value }; onChange({ ...block, items }); }} />
          <input className={inputCls} value={item.text} placeholder="Supporting text"
            onChange={e => { const items = [...block.items]; items[i] = { ...item, text: e.target.value }; onChange({ ...block, items }); }} />
        </div>
        <button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
          className="text-red-400 hover:text-red-600 text-sm mt-1">✕</button>
      </div>
    ))}
    <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { icon: 'lucide:Star', title: '', text: '' }] })}
      className="text-xs text-blue-600 hover:text-blue-800">+ Add Item</button>
  </div>
);

/** Full-width image / banner (`image`, and the `banner` alias). */
const ImageOnlyEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => (
  <div className="space-y-2">
    <div><label className={labelCls}>Heading (optional)</label>
      <input className={inputCls} value={block.data.heading || ''} placeholder="Shown above the image"
        onChange={e => onChange({ ...block, data: { ...block.data, heading: e.target.value } })} /></div>
    <div><label className={labelCls}>Image</label>
      <ImageField value={block.data.imageUrl} folder="products/aplus"
        aiPrompt={block.data.heading ? `Product A+ banner for "${block.data.heading}"` : 'Product A+ banner image'}
        onChange={url => onChange({ ...block, data: { ...block.data, imageUrl: url } })} /></div>
    <div><label className={labelCls}>Alt text</label>
      <input className={inputCls} value={block.data.alt || ''} placeholder="Describes the image for accessibility/SEO"
        onChange={e => onChange({ ...block, data: { ...block.data, alt: e.target.value } })} /></div>
  </div>
);

/** Comparison table — headers + a grid of rows, both fully editable. */
const ComparisonTableEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => {
  const headers: string[] = Array.isArray(block.data.headers) ? block.data.headers : [];
  const rows: string[][] = Array.isArray(block.data.rows) ? block.data.rows.map((r: any) => Array.isArray(r) ? r : [r]) : [];
  const cols = Math.max(headers.length, ...rows.map(r => r.length), 1);
  const patch = (d: any) => onChange({ ...block, data: { ...block.data, ...d } });
  const setHeader = (i: number, v: string) => { const h = [...headers]; h[i] = v; patch({ headers: h }); };
  const setCell = (r: number, c: number, v: string) => {
    const next = rows.map(row => [...row]);
    while (next[r].length < cols) next[r].push('');
    next[r][c] = v; patch({ rows: next });
  };
  const addColumn = () => patch({
    headers: [...Array.from({ length: cols }, (_, i) => headers[i] ?? ''), ''],
    rows: rows.map(r => [...Array.from({ length: cols }, (_, i) => r[i] ?? ''), '']),
  });
  const removeColumn = (c: number) => patch({
    headers: headers.filter((_, i) => i !== c),
    rows: rows.map(r => r.filter((_, i) => i !== c)),
  });

  return (
    <div className="space-y-2">
      <div><label className={labelCls}>Heading (optional)</label>
        <input className={inputCls} value={block.data.heading || ''} placeholder="e.g. How we compare"
          onChange={e => patch({ heading: e.target.value })} /></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded">
          <thead>
            <tr className="bg-gray-50">
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="p-1 border-b border-gray-200">
                  <div className="flex gap-1 items-center">
                    <input className={inputCls} value={headers[c] ?? ''} placeholder={`Column ${c + 1}`}
                      onChange={e => setHeader(c, e.target.value)} />
                    {cols > 1 && (
                      <button type="button" onClick={() => removeColumn(c)} title="Remove column"
                        className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="p-1 border-b border-gray-100">
                    <input className={inputCls} value={row[c] ?? ''} placeholder="—"
                      onChange={e => setCell(r, c, e.target.value)} />
                  </td>
                ))}
                <td className="p-1 w-8">
                  <button type="button" onClick={() => patch({ rows: rows.filter((_, i) => i !== r) })}
                    className="text-red-400 hover:text-red-600 text-sm" title="Remove row">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ rows: [...rows, Array.from({ length: cols }, () => '')] })}
          className="text-xs text-blue-600 hover:text-blue-800">+ Add Row</button>
        <button type="button" onClick={addColumn}
          className="text-xs text-blue-600 hover:text-blue-800">+ Add Column</button>
      </div>
    </div>
  );
};

const BlockEditor: React.FC<{ block: ContentBlock; onChange: (b: ContentBlock) => void }> = ({ block, onChange }) => {
  // Blocks arrive from imports/older schemas that may omit `data`/`items` —
  // coerce to the canonical shape so the editors never index into undefined.
  const b: any = block || {};
  switch (b.type) {
    case 'text':
      return <TextEditor block={{ ...b, data: { heading: '', body: '', ...(b.data || {}) } }} onChange={onChange} />;
    case 'image_text':
      return <ImageTextEditor block={{ ...b, data: { heading: '', body: '', imageUrl: '', imagePosition: 'left', ...(b.data || {}) } }} onChange={onChange} />;
    case 'icon_box':
      return <IconBoxEditor block={{ ...b, items: Array.isArray(b.items) ? b.items : [] }} onChange={onChange} />;
    case 'faq':
      return <FAQEditor block={{ ...b, items: Array.isArray(b.items) ? b.items : [] }} onChange={onChange} />;
    case 'video':
      return <VideoEditor block={{ ...b, url: b.url ?? '', caption: b.caption ?? '' }} onChange={onChange} />;
    case 'highlight_strip':
      return <HighlightEditor block={{ ...b, items: Array.isArray(b.items) ? b.items : [] }} onChange={onChange} />;
    case 'image':
    case 'banner':
      return <ImageOnlyEditor block={{ ...b, data: { heading: '', imageUrl: '', alt: '', ...(b.data || {}) } }} onChange={onChange} />;
    case 'comparison_table':
      return <ComparisonTableEditor block={{ ...b, data: { heading: '', headers: [], rows: [], ...(b.data || {}) } }} onChange={onChange} />;
    default:
      return (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
          This block type (<b>{String(b.type ?? 'unknown')}</b>) has no editor yet. It stays on the
          product exactly as it is — nothing is lost when you save.
        </p>
      );
  }
};

const ProductContentSections: React.FC<ProductContentSectionsProps> = ({ blocks, onChange, productId }) => {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const [addOpen, setAddOpen] = useState(false);

  const toggle = (i: number) => setExpanded(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  const addBlock = (type: string) => {
    onChange([...blocks, blockDefaults[type] as ContentBlock]);
    setExpanded(prev => new Set([...prev, blocks.length]));
    setAddOpen(false);
  };

  const removeBlock = (idx: number) => {
    onChange(blocks.filter((_, i) => i !== idx));
    setExpanded(prev => { const s = new Set(prev); s.delete(idx); return s; });
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const newBlocks = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= newBlocks.length) return;
    [newBlocks[idx], newBlocks[target]] = [newBlocks[target], newBlocks[idx]];
    onChange(newBlocks);
  };

  return (
    <AplusAiContext.Provider value={productId}>
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Product Content (A+ Sections)</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Enhanced content blocks shown on the product page below the fold
            {!productId && <span className="text-amber-600"> · save the product to enable ✨ AI generation</span>}
          </p>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setAddOpen(v => !v)}
            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded hover:bg-gray-700">
            + Add Block
          </button>
          {addOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-52 py-1">
              {Object.entries(blockLabels).map(([type, label]) => (
                <button key={type} type="button"
                  onClick={() => addBlock(type)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                  {label}
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button type="button" onClick={() => setAddOpen(false)}
                  className="w-full text-left px-4 py-2 text-xs text-gray-400 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {blocks.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500">No content blocks yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add rich A+ content sections that appear below the product description on your storefront.</p>
        </div>
      )}

      <div className="space-y-3">
        {blocks.map((block, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <button type="button" onClick={() => toggle(idx)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                <span className="text-gray-400 text-xs">{expanded.has(idx) ? '▾' : '▸'}</span>
                <span className="text-xs text-gray-400 font-normal">{idx + 1}.</span>
                {blockLabels[block.type] || block.type}
              </button>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveBlock(idx, -1)} disabled={idx === 0}
                  className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30">↑</button>
                <button type="button" onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1}
                  className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30">↓</button>
                <button type="button" onClick={() => removeBlock(idx)}
                  className="ml-1 px-1.5 py-0.5 text-xs text-red-400 hover:text-red-600">✕</button>
              </div>
            </div>
            {expanded.has(idx) && (
              <div className="p-4">
                <BlockEditor block={block} onChange={updated => {
                  const newBlocks = [...blocks];
                  newBlocks[idx] = updated;
                  onChange(newBlocks);
                }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    </AplusAiContext.Provider>
  );
};

export default ProductContentSections;
