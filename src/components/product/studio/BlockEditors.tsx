import React from 'react';
import IconPicker from '../../IconPicker';
import RichTextEditor from '../../common/RichTextEditor';
import ImageField from '../../common/ImageField';
import { AiTextButton } from '../../common/AiTextButton';
import InfoTip from '../../common/InfoTip';
import type { ContentBlock } from './types';

/**
 * Editors for the A+ CONTENT blocks (products.aplus_content). Every text has
 * a ✨ that knows the product AND the block (heading, item title), every image
 * names its slot so the picker / generator produce the right size.
 */
export interface BlockEditorCtx {
  productId?: string | null;
  draft?: () => Record<string, any> | null | undefined;
  productImages?: string[];
}

const inputCls = 'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400';
const labelCls = 'text-xs font-medium text-gray-600';

const LabelRow: React.FC<{ label: string; info?: string; children?: React.ReactNode }> = ({ label, info, children }) => (
  <div className="flex items-center justify-between gap-2 mb-1">
    <span className={`${labelCls} inline-flex items-center gap-1`}>{label}{info && <InfoTip text={info} />}</span>
    {children}
  </div>
);

export const TextBlockEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => (
  <div className="space-y-3">
    <div>
      <LabelRow label="Heading (optional)" info="Printed above the paragraph in the highlights.">
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.text.heading" label="Section heading" value={block.data.heading}
          local={{ body: String(block.data.body || '').slice(0, 300) }} onResult={(v) => onChange({ ...block, data: { ...block.data, heading: String(v) } })} />
      </LabelRow>
      <input className={inputCls} value={block.data.heading || ''} placeholder="e.g. Why it works" onChange={(e) => onChange({ ...block, data: { ...block.data, heading: e.target.value } })} />
    </div>
    <div>
      <LabelRow label="Body" info="Rich text: headings, lists and links are kept.">
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.text.body" label="Section body" format="html" value={block.data.body}
          local={{ heading: block.data.heading }} onResult={(v) => onChange({ ...block, data: { ...block.data, body: String(v) } })} />
      </LabelRow>
      <RichTextEditor value={block.data.body} minHeight={140} onChange={(html) => onChange({ ...block, data: { ...block.data, body: html } })} />
    </div>
  </div>
);

export const ImageTextBlockEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
      <div>
        <LabelRow label="Image" />
        <ImageField value={block.data.imageUrl} folder="products/aplus" spec="product.aplus.image_text" entity="product" entityId={ctx.productId} draft={ctx.draft}
          referenceImages={ctx.productImages} local={{ heading: block.data.heading, body: String(block.data.body || '').replace(/<[^>]*>/g, ' ').slice(0, 200) }}
          onChange={(url) => onChange({ ...block, data: { ...block.data, imageUrl: url } })} />
      </div>
      <div className="sm:w-40">
        <LabelRow label="Image side" />
        <select className={inputCls} value={block.data.imagePosition} onChange={(e) => onChange({ ...block, data: { ...block.data, imagePosition: e.target.value as 'left' | 'right' } })}>
          <option value="left">Left</option><option value="right">Right</option>
        </select>
      </div>
    </div>
    <div>
      <LabelRow label="Heading">
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.text.heading" label="Heading" value={block.data.heading}
          local={{ body: String(block.data.body || '').slice(0, 300) }} onResult={(v) => onChange({ ...block, data: { ...block.data, heading: String(v) } })} />
      </LabelRow>
      <input className={inputCls} value={block.data.heading || ''} placeholder="Heading" onChange={(e) => onChange({ ...block, data: { ...block.data, heading: e.target.value } })} />
    </div>
    <div>
      <LabelRow label="Body">
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.image_text.body" label="Body" format="html" value={block.data.body}
          local={{ heading: block.data.heading }} onResult={(v) => onChange({ ...block, data: { ...block.data, body: String(v) } })} />
      </LabelRow>
      <RichTextEditor value={block.data.body} minHeight={120} onChange={(html) => onChange({ ...block, data: { ...block.data, body: html } })} />
    </div>
  </div>
);

const ItemsEditor: React.FC<{
  items: any[]; onItems: (items: any[]) => void; ctx: BlockEditorCtx;
  titleKey: 'title'; textKey: 'desc' | 'text'; field: string; label: string; iconDefault: string;
}> = ({ items, onItems, ctx, titleKey, textKey, field, label, iconDefault }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className={labelCls}>{label}</span>
      <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field={field} label={label} format="json" variant="label"
        onResult={(v: any) => {
          const list: any[] = Array.isArray(v?.items) ? v.items : Array.isArray(v) ? v : [];
          if (!list.length) return;
          onItems(list.map((i) => ({ icon: String(i.icon || iconDefault), [titleKey]: String(i.title || ''), [textKey]: String(i.text ?? i.desc ?? '') })));
        }} />
    </div>
    {items.map((item, i) => (
      <div key={i} className="flex gap-2 items-start p-2 bg-gray-50 rounded-md border border-gray-200">
        <div className="shrink-0"><IconPicker value={item.icon} label="" onChange={(icon) => { const next = [...items]; next[i] = { ...item, icon }; onItems(next); }} /></div>
        <div className="flex-1 space-y-1">
          <input className={inputCls} value={item[titleKey] ?? ''} placeholder="Title" onChange={(e) => { const next = [...items]; next[i] = { ...item, [titleKey]: e.target.value }; onItems(next); }} />
          <div className="flex gap-1">
            <input className={inputCls} value={item[textKey] ?? ''} placeholder="Short text" onChange={(e) => { const next = [...items]; next[i] = { ...item, [textKey]: e.target.value }; onItems(next); }} />
            <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="section.item.description" label="Item text" variant="icon" value={item[textKey]}
              local={{ title: item[titleKey] }} onResult={(v) => { const next = [...items]; next[i] = { ...item, [textKey]: String(v) }; onItems(next); }} />
          </div>
        </div>
        <button type="button" onClick={() => onItems(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 text-sm mt-1" aria-label="Remove item">✕</button>
      </div>
    ))}
    <button type="button" onClick={() => onItems([...items, { icon: iconDefault, [titleKey]: '', [textKey]: '' }])} className="text-xs text-brand-700 hover:underline font-medium">+ Add item</button>
  </div>
);

export const IconBoxBlockEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => (
  <ItemsEditor items={block.items} onItems={(items) => onChange({ ...block, items })} ctx={ctx} titleKey="title" textKey="desc" field="aplus.icon_box.items" label="Feature boxes" iconDefault="lucide:Check" />
);

export const HighlightBlockEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => (
  <ItemsEditor items={block.items} onItems={(items) => onChange({ ...block, items })} ctx={ctx} titleKey="title" textKey="text" field="aplus.highlight_strip.items" label="Highlights" iconDefault="lucide:Star" />
);

export const FaqBlockEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className={labelCls}>Questions &amp; answers</span>
      <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.faq" label="FAQ block" format="json"
        onResult={(v: any) => { const list = Array.isArray(v?.items) ? v.items : []; if (list.length) onChange({ ...block, items: list.map((i: any) => ({ q: String(i.question ?? i.q ?? ''), a: String(i.answer ?? i.a ?? '') })) }); }} />
    </div>
    {block.items.map((item: any, i: number) => (
      <div key={i} className="p-2 bg-gray-50 rounded-md border border-gray-200 space-y-1.5">
        <div className="flex gap-2">
          <input className={inputCls} value={item.q} placeholder="Question" onChange={(e) => { const items = [...block.items]; items[i] = { ...item, q: e.target.value }; onChange({ ...block, items }); }} />
          <button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_: any, j: number) => j !== i) })} className="text-gray-400 hover:text-red-600 text-sm shrink-0" aria-label="Remove">✕</button>
        </div>
        <div className="flex gap-1 items-start">
          <textarea rows={2} className={inputCls} value={item.a} placeholder="Answer" onChange={(e) => { const items = [...block.items]; items[i] = { ...item, a: e.target.value }; onChange({ ...block, items }); }} />
          <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="product.faq_answer" label="Answer" variant="icon" value={item.a} local={{ question: item.q }}
            onResult={(v) => { const items = [...block.items]; items[i] = { ...item, a: String(v) }; onChange({ ...block, items }); }} />
        </div>
      </div>
    ))}
    <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { q: '', a: '' }] })} className="text-xs text-brand-700 hover:underline font-medium">+ Add question</button>
  </div>
);

export const VideoBlockEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => (
  <div className="space-y-3">
    <div>
      <LabelRow label="Video URL" info="YouTube, Vimeo or a direct .mp4 link." />
      <input className={inputCls} value={block.url} placeholder="https://youtube.com/watch?v=…" onChange={(e) => onChange({ ...block, url: e.target.value })} />
    </div>
    <div>
      <LabelRow label="Caption (optional)">
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.video.caption" label="Caption" value={block.caption} onResult={(v) => onChange({ ...block, caption: String(v) })} />
      </LabelRow>
      <input className={inputCls} value={block.caption || ''} placeholder="What the video shows" onChange={(e) => onChange({ ...block, caption: e.target.value })} />
    </div>
  </div>
);

export const ImageOnlyBlockEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => (
  <div className="space-y-3">
    <div>
      <LabelRow label="Heading (optional)" info="Shown above the banner.">
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.text.heading" label="Heading" value={block.data.heading} onResult={(v) => onChange({ ...block, data: { ...block.data, heading: String(v) } })} />
      </LabelRow>
      <input className={inputCls} value={block.data.heading || ''} placeholder="Shown above the image" onChange={(e) => onChange({ ...block, data: { ...block.data, heading: e.target.value } })} />
    </div>
    <div>
      <LabelRow label="Banner image" />
      <ImageField value={block.data.imageUrl} folder="products/aplus" spec="product.aplus.banner" entity="product" entityId={ctx.productId} draft={ctx.draft}
        referenceImages={ctx.productImages} local={{ heading: block.data.heading, alt: block.data.alt }} onChange={(url) => onChange({ ...block, data: { ...block.data, imageUrl: url } })} />
    </div>
    <div>
      <LabelRow label="Alt text" info="Describes the image for screen readers and search engines.">
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="product.alt_text" label="Alt text" value={block.data.alt} local={{ heading: block.data.heading }} onResult={(v) => onChange({ ...block, data: { ...block.data, alt: String(v) } })} />
      </LabelRow>
      <input className={inputCls} value={block.data.alt || ''} placeholder="e.g. Arnica Montana bottle beside fresh arnica flowers" onChange={(e) => onChange({ ...block, data: { ...block.data, alt: e.target.value } })} />
    </div>
  </div>
);

export const ComparisonTableBlockEditor: React.FC<{ block: any; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => {
  const headers: string[] = Array.isArray(block.data.headers) ? block.data.headers : [];
  const rows: string[][] = Array.isArray(block.data.rows) ? block.data.rows.map((r: any) => (Array.isArray(r) ? r : [r])) : [];
  const cols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const patch = (d: any) => onChange({ ...block, data: { ...block.data, ...d } });
  const setHeader = (i: number, v: string) => { const h = [...headers]; h[i] = v; patch({ headers: h }); };
  const setCell = (r: number, c: number, v: string) => { const next = rows.map((row) => [...row]); while (next[r].length < cols) next[r].push(''); next[r][c] = v; patch({ rows: next }); };
  const addColumn = () => patch({ headers: [...Array.from({ length: cols }, (_, i) => headers[i] ?? ''), ''], rows: rows.map((r) => [...Array.from({ length: cols }, (_, i) => r[i] ?? ''), '']) });
  const removeColumn = (c: number) => patch({ headers: headers.filter((_, i) => i !== c), rows: rows.map((r) => r.filter((_, i) => i !== c)) });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={labelCls}>Heading (optional)</span>
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.comparison_table" label="Comparison table" format="json"
          onResult={(v: any) => { if (v && Array.isArray(v.headers)) patch({ heading: v.heading || block.data.heading, headers: v.headers, rows: Array.isArray(v.rows) ? v.rows : rows }); }} />
      </div>
      <input className={inputCls} value={block.data.heading || ''} placeholder="e.g. How we compare" onChange={(e) => patch({ heading: e.target.value })} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded">
          <thead><tr className="bg-gray-50">
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} className="p-1 border-b border-gray-200">
                <div className="flex gap-1 items-center">
                  <input className={inputCls} value={headers[c] ?? ''} placeholder={`Column ${c + 1}`} onChange={(e) => setHeader(c, e.target.value)} />
                  {cols > 1 && <button type="button" onClick={() => removeColumn(c)} title="Remove column" className="text-gray-400 hover:text-red-600 text-xs shrink-0">✕</button>}
                </div>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => <td key={c} className="p-1 border-b border-gray-100"><input className={inputCls} value={row[c] ?? ''} placeholder="—" onChange={(e) => setCell(r, c, e.target.value)} /></td>)}
                <td className="p-1 w-8"><button type="button" onClick={() => patch({ rows: rows.filter((_, i) => i !== r) })} className="text-gray-400 hover:text-red-600 text-sm" title="Remove row">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => patch({ rows: [...rows, Array.from({ length: cols }, () => '')] })} className="text-xs text-brand-700 hover:underline font-medium">+ Add row</button>
        <button type="button" onClick={addColumn} className="text-xs text-brand-700 hover:underline font-medium">+ Add column</button>
      </div>
    </div>
  );
};

export const BlockEditor: React.FC<{ block: ContentBlock; onChange: (b: ContentBlock) => void; ctx: BlockEditorCtx }> = ({ block, onChange, ctx }) => {
  const b: any = block || {};
  switch (b.type) {
    case 'text': return <TextBlockEditor block={{ ...b, data: { heading: '', body: '', ...(b.data || {}) } }} onChange={onChange} ctx={ctx} />;
    case 'image_text': return <ImageTextBlockEditor block={{ ...b, data: { heading: '', body: '', imageUrl: '', imagePosition: 'left', ...(b.data || {}) } }} onChange={onChange} ctx={ctx} />;
    case 'icon_box': return <IconBoxBlockEditor block={{ ...b, items: Array.isArray(b.items) ? b.items : [] }} onChange={onChange} ctx={ctx} />;
    case 'highlight_strip': return <HighlightBlockEditor block={{ ...b, items: Array.isArray(b.items) ? b.items : [] }} onChange={onChange} ctx={ctx} />;
    case 'faq': return <FaqBlockEditor block={{ ...b, items: Array.isArray(b.items) ? b.items : [] }} onChange={onChange} ctx={ctx} />;
    case 'video': return <VideoBlockEditor block={{ ...b, url: b.url ?? '', caption: b.caption ?? '' }} onChange={onChange} ctx={ctx} />;
    case 'image': case 'banner': return <ImageOnlyBlockEditor block={{ ...b, data: { heading: '', imageUrl: '', alt: '', ...(b.data || {}) } }} onChange={onChange} ctx={ctx} />;
    case 'comparison_table': return <ComparisonTableBlockEditor block={{ ...b, data: { heading: '', headers: [], rows: [], ...(b.data || {}) } }} onChange={onChange} ctx={ctx} />;
    default:
      return <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">This block type (<b>{String(b.type ?? 'unknown')}</b>) has no editor yet. It stays on the product exactly as it is — nothing is lost when you save.</p>;
  }
};
