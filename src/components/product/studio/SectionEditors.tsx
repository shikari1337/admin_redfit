import React, { useMemo, useState } from 'react';
import IconPicker from '../../IconPicker';
import RichTextEditor from '../../common/RichTextEditor';
import ImageField from '../../common/ImageField';
import { AiTextButton } from '../../common/AiTextButton';
import InfoTip from '../../common/InfoTip';
import type { SectionEditorKind } from './catalog';

/**
 * Editors for page SECTIONS (products.page_sections[].customData) — the six
 * storefront text/FAQ/per-form overrides, the single-product-template
 * sections, and a key/value editor for custom sections. Ported from the
 * retired Sections Manager; every text gained a contextual ✨ and every
 * image its slot.
 */
export interface SectionEditorCtx {
  productId?: string | null;
  draft?: () => Record<string, any> | null | undefined;
  productImages?: string[];
}

const inputCls = 'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400';
const labelCls = 'text-xs font-medium text-gray-600';

const Row: React.FC<{ label: string; info?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ label, info, right, children }) => (
  <div>
    <div className="flex items-center justify-between gap-2 mb-1">
      <span className={`${labelCls} inline-flex items-center gap-1`}>{label}{info && <InfoTip text={info} />}</span>
      {right}
    </div>
    {children}
  </div>
);

const HeadingSubtitle: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx; sectionName: string }> = ({ data, onChange, ctx, sectionName }) => (
  <>
    <Row label="Heading" right={<AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="section.heading" label={`${sectionName} heading`} value={data.heading} local={{ section: sectionName }} onResult={(v) => onChange({ ...data, heading: String(v) })} />}>
      <input className={inputCls} value={data.heading || ''} onChange={(e) => onChange({ ...data, heading: e.target.value })} />
    </Row>
    <Row label="Subtitle" right={<AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="section.subtitle" label={`${sectionName} subtitle`} value={data.subtitle} local={{ section: sectionName, heading: data.heading }} onResult={(v) => onChange({ ...data, subtitle: String(v) })} />}>
      <textarea rows={2} className={inputCls} value={data.subtitle || ''} onChange={(e) => onChange({ ...data, subtitle: e.target.value })} />
    </Row>
  </>
);

/** short-description / description / dosage / important-info → customData.content */
export const HtmlContentEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx; field: string; label: string }> = ({ data, onChange, ctx, field, label }) => {
  const [rawMode, setRawMode] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`${labelCls} inline-flex items-center gap-1`}>{label}<InfoTip text="Overrides the product’s own text for this section on the storefront. Leave empty to keep the product default." /></span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRawMode((m) => !m)} className="text-xs text-gray-500 hover:text-gray-800">{rawMode ? 'Visual editor' : 'Edit HTML'}</button>
          <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field={field} label={label} format="html" value={data?.content} onResult={(v) => onChange({ ...data, content: String(v) })} />
        </div>
      </div>
      {rawMode ? (
        <textarea value={data?.content || ''} onChange={(e) => onChange({ ...data, content: e.target.value })} className={`${inputCls} font-mono resize-y`} rows={12} placeholder="<p>Your content…</p>" />
      ) : (
        <RichTextEditor value={data?.content || ''} onChange={(html) => onChange({ ...data, content: html })} placeholder="Section content — headings, lists, links…" minHeight={200} />
      )}
      <p className="text-[11px] text-gray-400">Scripts and inline event handlers are stripped on save.</p>
    </div>
  );
};

/** faqs → customData.items = [{ question, answer }] */
export const FaqItemsEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = ({ data, onChange, ctx }) => {
  const items: Array<{ question?: string; answer?: string }> = data?.items || [];
  const set = (next: any[]) => onChange({ ...data, items: next });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={labelCls}>Questions &amp; answers</span>
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="product.faqs" label="FAQs" format="json"
          onResult={(v: any) => { const list = Array.isArray(v?.items) ? v.items : []; if (list.length) set([...items.filter((i) => i.question), ...list.map((i: any) => ({ question: String(i.question ?? ''), answer: String(i.answer ?? '') }))]); }} />
      </div>
      {items.map((item, i) => (
        <div key={i} className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
          <div className="flex gap-2">
            <input className={inputCls} value={item.question || ''} placeholder="e.g. How should I store this medicine?" onChange={(e) => { const n = [...items]; n[i] = { ...n[i], question: e.target.value }; set(n); }} />
            <button type="button" onClick={() => set(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label="Remove">✕</button>
          </div>
          <div className="flex gap-1 items-start">
            <textarea rows={3} className={inputCls} value={item.answer || ''} placeholder="Answer" onChange={(e) => { const n = [...items]; n[i] = { ...n[i], answer: e.target.value }; set(n); }} />
            <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="product.faq_answer" label="Answer" variant="icon" value={item.answer} local={{ question: item.question }} onResult={(v) => { const n = [...items]; n[i] = { ...n[i], answer: String(v) }; set(n); }} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => set([...items, { question: '', answer: '' }])} className="text-xs text-brand-700 hover:underline font-medium">+ Add question</button>
    </div>
  );
};

/** form-content → customData.forms = { [formName]: { description?, dosage?, importantInfo? } } */
export const FormContentEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = ({ data, onChange, ctx }) => {
  const [newForm, setNewForm] = useState('');
  const forms: Record<string, any> = data?.forms || {};
  const keys = Object.keys(forms);
  const update = (k: string, field: string, v: string) => onChange({ ...data, forms: { ...forms, [k]: { ...forms[k], [field]: v } } });
  const add = () => { const k = newForm.trim(); if (!k || forms[k]) return; onChange({ ...data, forms: { ...forms, [k]: { description: '', dosage: '', importantInfo: '' } } }); setNewForm(''); };
  const remove = (k: string) => { const n = { ...forms }; delete n[k]; onChange({ ...data, forms: n }); };
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">For products whose variants span several forms (Dilution, Mother Tincture…): the page shows the block matching the chosen variant’s form.</p>
      {keys.length === 0 && <p className="text-xs text-gray-400 italic">No forms yet — add one below.</p>}
      {keys.map((k) => (
        <div key={k} className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
          <div className="flex items-center justify-between"><h4 className="text-sm font-medium text-gray-900">{k}</h4><button type="button" onClick={() => remove(k)} className="text-gray-400 hover:text-red-600 text-sm">✕</button></div>
          {(['description', 'dosage', 'importantInfo'] as const).map((f) => (
            <Row key={f} label={f === 'importantInfo' ? 'Important info' : f[0].toUpperCase() + f.slice(1)} right={
              <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field={f === 'description' ? 'product.long_desc' : f === 'dosage' ? 'product.dosage' : 'product.important_info'} label={`${k} ${f}`} format="html" value={forms[k]?.[f]} local={{ form: k }} onResult={(v) => update(k, f, String(v))} />
            }>
              <textarea rows={f === 'description' ? 4 : 3} className={`${inputCls} resize-y`} value={forms[k]?.[f] || ''} onChange={(e) => update(k, f, e.target.value)} placeholder="HTML allowed" />
            </Row>
          ))}
        </div>
      ))}
      <div className="flex gap-2">
        <input className={inputCls} value={newForm} onChange={(e) => setNewForm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder='Add form (e.g. "Dilution")' />
        <button type="button" onClick={add} className="px-3 h-8 text-xs rounded-md bg-gray-900 text-white whitespace-nowrap">Add form</button>
      </div>
    </div>
  );
};

const ItemList: React.FC<{
  data: any; onChange: (d: any) => void; ctx: SectionEditorCtx; listKey: string; itemLabel: string; withImage?: string; iconTypes?: string[];
}> = ({ data, onChange, ctx, listKey, itemLabel, withImage, iconTypes }) => {
  const items: any[] = data?.[listKey] || [];
  const set = (n: any[]) => onChange({ ...data, [listKey]: n });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={labelCls}>{itemLabel}s</span>
        <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="aplus.icon_box.items" label={`${itemLabel}s`} format="json"
          onResult={(v: any) => { const list = Array.isArray(v?.items) ? v.items : []; if (list.length) set(list.map((i: any) => ({ title: String(i.title || ''), description: String(i.text ?? i.desc ?? ''), iconName: String(i.icon || ''), iconType: iconTypes?.[0] || 'check' }))); }} />
      </div>
      {items.map((item, i) => (
        <div key={i} className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
          <div className="flex items-center justify-between"><h5 className="text-xs font-medium text-gray-700">{itemLabel} {i + 1}</h5><button type="button" onClick={() => set(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 text-sm">✕</button></div>
          {iconTypes && (
            <div className="flex items-center gap-2">
              <IconPicker label="" value={item.iconName || ''} onChange={(name) => { const n = [...items]; n[i] = { ...item, iconName: name }; set(n); }} />
              {!item.iconName && <select value={item.iconType || iconTypes[0]} onChange={(e) => { const n = [...items]; n[i] = { ...item, iconType: e.target.value }; set(n); }} className="text-xs border border-gray-300 rounded px-1.5 h-7">{iconTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
            </div>
          )}
          <input className={inputCls} value={item.title || ''} placeholder="Title" onChange={(e) => { const n = [...items]; n[i] = { ...item, title: e.target.value }; set(n); }} />
          <div className="flex gap-1 items-start">
            <textarea rows={2} className={inputCls} value={item.description || ''} placeholder="Description" onChange={(e) => { const n = [...items]; n[i] = { ...item, description: e.target.value }; set(n); }} />
            <AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="section.item.description" label="Description" variant="icon" value={item.description} local={{ title: item.title }} onResult={(v) => { const n = [...items]; n[i] = { ...item, description: String(v) }; set(n); }} />
          </div>
          {withImage && (
            <ImageField value={item.image || ''} folder="products/sections" spec={withImage} entity="product" entityId={ctx.productId} draft={ctx.draft} referenceImages={ctx.productImages}
              local={{ title: item.title, description: item.description }} onChange={(url) => { const n = [...items]; n[i] = { ...item, image: url }; set(n); }} />
          )}
        </div>
      ))}
      <button type="button" onClick={() => set([...items, { title: '', description: '', iconType: iconTypes?.[0] || 'check', ...(withImage ? { image: '' } : {}) }])} className="text-xs text-brand-700 hover:underline font-medium">+ Add {itemLabel.toLowerCase()}</button>
    </div>
  );
};

export const FeaturesEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = (p) => (
  <ItemList {...p} listKey="items" itemLabel="Feature" iconTypes={['check', 'exchange', 'shipping']} />
);

export const WhySpeedsterEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = ({ data, onChange, ctx }) => (
  <div className="space-y-3">
    <HeadingSubtitle data={data} onChange={onChange} ctx={ctx} sectionName="Why choose this" />
    <Row label="Image">
      <ImageField value={data.imageUrl || ''} folder="products/sections" spec="section.why_image" entity="product" entityId={ctx.productId} draft={ctx.draft} referenceImages={ctx.productImages}
        local={{ heading: data.heading, subtitle: data.subtitle }} onChange={(url) => onChange({ ...data, imageUrl: url })} />
    </Row>
    <ItemList data={data} onChange={onChange} ctx={ctx} listKey="items" itemLabel="Item" iconTypes={['shield', 'star', 'bolt']} />
  </div>
);

export const WhyUsEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = ({ data, onChange, ctx }) => (
  <div className="space-y-3">
    <HeadingSubtitle data={data} onChange={onChange} ctx={ctx} sectionName="Why us" />
    <ItemList data={data} onChange={onChange} ctx={ctx} listKey="benefits" itemLabel="Benefit" iconTypes={['check', 'clock', 'return', 'shield', 'star', 'tag']} />
  </div>
);

export const StylingGuideEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = ({ data, onChange, ctx }) => {
  // Older rows used `tips[{imageUrl}]` — normalise once so the editor and the page agree.
  const normalized = useMemo(() => (data?.tips && !data?.items ? { ...data, items: data.tips.map((t: any) => ({ title: t.title || '', description: t.description || '', image: t.imageUrl || t.image || '' })) } : data), [data]);
  return (
    <div className="space-y-3">
      <HeadingSubtitle data={normalized} onChange={onChange} ctx={ctx} sectionName="Styling guide" />
      <ItemList data={normalized} onChange={onChange} ctx={ctx} listKey="items" itemLabel="Tip" withImage="section.styling_image" />
    </div>
  );
};

export const InstagramFeedEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = ({ data, onChange, ctx }) => {
  const posts: any[] = data?.posts || [];
  const set = (n: any[]) => onChange({ ...data, posts: n });
  return (
    <div className="space-y-3">
      <Row label="Instagram username"><input className={inputCls} value={data.username || ''} placeholder="yourstore" onChange={(e) => onChange({ ...data, username: e.target.value })} /></Row>
      <Row label="Heading" right={<AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="section.heading" label="Heading" value={data.heading} onResult={(v) => onChange({ ...data, heading: String(v) })} />}>
        <input className={inputCls} value={data.heading || ''} onChange={(e) => onChange({ ...data, heading: e.target.value })} />
      </Row>
      <span className={labelCls}>Posts</span>
      {posts.map((post, i) => (
        <div key={post.id || i} className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
          <div className="flex items-center justify-between"><h5 className="text-xs font-medium text-gray-700">Post {i + 1}</h5><button type="button" onClick={() => set(posts.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 text-sm">✕</button></div>
          <ImageField value={post.imageUrl || ''} folder="products/sections" spec="section.instagram_post" entity="product" entityId={ctx.productId} draft={ctx.draft} referenceImages={ctx.productImages}
            local={{ caption: post.caption }} onChange={(url) => { const n = [...posts]; n[i] = { ...post, imageUrl: url }; set(n); }} />
          <textarea rows={2} className={inputCls} value={post.caption || ''} placeholder="Caption" onChange={(e) => { const n = [...posts]; n[i] = { ...post, caption: e.target.value }; set(n); }} />
          <input className={inputCls} value={post.link || ''} placeholder="https://instagram.com/…" onChange={(e) => { const n = [...posts]; n[i] = { ...post, link: e.target.value }; set(n); }} />
        </div>
      ))}
      <button type="button" onClick={() => set([...posts, { id: String(Date.now()), imageUrl: '', caption: '', link: '' }])} className="text-xs text-brand-700 hover:underline font-medium">+ Add post</button>
    </div>
  );
};

export const FaqLegacyEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = ({ data, onChange, ctx }) => {
  const cats = [['general', 'General'], ['delivery', 'Delivery & Shipping'], ['quality', 'Product Quality'], ['bulk-order', 'Bulk Orders'], ['store-address', 'Store Address'], ['payment', 'Payment'], ['return', 'Returns & Exchanges']];
  const selected: string[] = data.selectedCategories || [];
  return (
    <div className="space-y-3">
      <HeadingSubtitle data={data} onChange={onChange} ctx={ctx} sectionName="FAQ" />
      <Row label="Which questions">
        <div className="flex gap-3 text-sm">
          <label className="inline-flex items-center gap-1.5"><input type="radio" checked={data.mode !== 'random'} onChange={() => onChange({ ...data, mode: 'category' })} /> From selected categories</label>
          <label className="inline-flex items-center gap-1.5"><input type="radio" checked={data.mode === 'random'} onChange={() => onChange({ ...data, mode: 'random' })} /> Random</label>
        </div>
      </Row>
      {data.mode === 'random' ? (
        <Row label="How many"><input type="number" min={1} max={20} className={inputCls} value={data.randomCount || 5} onChange={(e) => onChange({ ...data, randomCount: parseInt(e.target.value) || 5 })} /></Row>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {cats.map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={selected.includes(v)} onChange={() => onChange({ ...data, selectedCategories: selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v] })} /> {l}</label>
          ))}
        </div>
      )}
    </div>
  );
};

export const HeadingOnlyEditor: React.FC<{ data: any; onChange: (d: any) => void; ctx: SectionEditorCtx; sectionName: string; note: string; withSubtitle?: boolean; withRatingToggle?: boolean }> = ({ data, onChange, ctx, sectionName, note, withSubtitle = true, withRatingToggle }) => (
  <div className="space-y-3">
    {withSubtitle ? <HeadingSubtitle data={data} onChange={onChange} ctx={ctx} sectionName={sectionName} /> : (
      <Row label="Heading" right={<AiTextButton entity="product" entityId={ctx.productId} draft={ctx.draft} field="section.heading" label={`${sectionName} heading`} value={data.heading} onResult={(v) => onChange({ ...data, heading: String(v) })} />}>
        <input className={inputCls} value={data.heading || ''} onChange={(e) => onChange({ ...data, heading: e.target.value })} />
      </Row>
    )}
    {withRatingToggle && <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={data.showRatingFilters !== false} onChange={(e) => onChange({ ...data, showRatingFilters: e.target.checked })} /> Show rating filters</label>}
    <p className="text-xs text-gray-500">{note}</p>
  </div>
);

export const CustomSectionDataEditor: React.FC<{ data: any; onChange: (d: any) => void }> = ({ data, onChange }) => {
  const entries = Object.entries(data || {}).map(([k, v]) => ({ key: k, raw: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v) }));
  const rebuild = (rows: Array<{ key: string; raw: string }>) => {
    const obj: Record<string, any> = {};
    for (const { key, raw } of rows) {
      if (!key.trim()) continue;
      let val: any = raw;
      if (raw.startsWith('[') || raw.startsWith('{')) { try { val = JSON.parse(raw); } catch { /* keep */ } }
      else if (raw === 'true') val = true; else if (raw === 'false') val = false; else if (raw !== '' && !isNaN(Number(raw))) val = Number(raw);
      obj[key.trim()] = val;
    }
    onChange(obj);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Free-form fields for a custom section. Use JSON for lists/objects.</p>
      {entries.map((row, i) => (
        <div key={i} className="flex gap-2 items-start">
          <input className={`${inputCls} w-1/3 font-mono text-xs`} value={row.key} placeholder="key" onChange={(e) => { const n = [...entries]; n[i] = { ...n[i], key: e.target.value }; rebuild(n); }} />
          <textarea className={`${inputCls} flex-1 text-xs`} rows={row.raw.includes('\n') ? 3 : 1} value={row.raw} placeholder="value" onChange={(e) => { const n = [...entries]; n[i] = { ...n[i], raw: e.target.value }; rebuild(n); }} />
          <button type="button" onClick={() => rebuild(entries.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 mt-1">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => rebuild([...entries, { key: '', raw: '' }])} className="text-xs text-brand-700 hover:underline font-medium">+ Add field</button>
    </div>
  );
};

/** Dispatch by editor kind. */
export const SectionEditor: React.FC<{ kind: SectionEditorKind; sectionId: string; sectionName: string; data: any; onChange: (d: any) => void; ctx: SectionEditorCtx }> = ({ kind, sectionId, sectionName, data, onChange, ctx }) => {
  const d = data || {};
  switch (kind) {
    case 'html': {
      const field = sectionId === 'short-description' ? 'product.short_desc' : sectionId === 'dosage' ? 'product.dosage' : sectionId === 'important-info' ? 'product.important_info' : 'product.long_desc';
      return <HtmlContentEditor data={d} onChange={onChange} ctx={ctx} field={field} label={sectionName} />;
    }
    case 'faqItems': return <FaqItemsEditor data={d} onChange={onChange} ctx={ctx} />;
    case 'formContent': return <FormContentEditor data={d} onChange={onChange} ctx={ctx} />;
    case 'features': return <FeaturesEditor data={d} onChange={onChange} ctx={ctx} />;
    case 'whySpeedster': return <WhySpeedsterEditor data={d} onChange={onChange} ctx={ctx} />;
    case 'whyUs': return <WhyUsEditor data={d} onChange={onChange} ctx={ctx} />;
    case 'stylingGuide': return <StylingGuideEditor data={d} onChange={onChange} ctx={ctx} />;
    case 'instagram': return <InstagramFeedEditor data={d} onChange={onChange} ctx={ctx} />;
    case 'faqLegacy': return <FaqLegacyEditor data={d} onChange={onChange} ctx={ctx} />;
    case 'testimonials': return <HeadingOnlyEditor data={d} onChange={onChange} ctx={ctx} sectionName="Testimonials" note="Testimonials come from customer reviews; only the heading and subtitle are set here." withRatingToggle />;
    case 'washCare': return <HeadingOnlyEditor data={d} onChange={onChange} ctx={ctx} sectionName="Care instructions" note="The instructions themselves are edited under Product data ▸ Care instructions." withSubtitle={false} />;
    case 'gallery': return <HeadingOnlyEditor data={d} onChange={onChange} ctx={ctx} sectionName="Customer gallery" note="Customer photos are managed on the Media tab." />;
    case 'videos': return <HeadingOnlyEditor data={d} onChange={onChange} ctx={ctx} sectionName="Videos" note="Videos are managed on the Media tab." />;
    case 'toggle': return <p className="text-xs text-gray-500">This section has no text of its own here — switch it on or off for this product and set how it displays.</p>;
    default: return <CustomSectionDataEditor data={d} onChange={onChange} />;
  }
};
