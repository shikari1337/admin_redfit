import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2, X, Check, ChevronRight, ChevronLeft, Upload, LayoutGrid, Wand2, Settings2, Trash2, ImageIcon } from 'lucide-react';
import { uploadAPI } from '../../../services/api';
import MediaPicker from '../../common/MediaPicker';
import { aiStudioAPI, useAiStatus, aiErrorMessage, type PlannerQuestion } from '../../../lib/ai';
import type { ContentBlock } from './types';

/**
 * "Make me a product page" — the whole-page generator.
 *
 *   1. Inputs    the merchant adds photos (the product's own are preselected),
 *                notes/USPs, audience and tone, and ticks which parts to write.
 *   2. Questions the AI says what it understood from the photos + context and
 *                asks only what would change the page (skipped when it has enough).
 *   3. Review    every part of the proposal is shown with an "apply" tick; image
 *                slots can be generated on the spot (at the slot's exact size) or
 *                filled from the assets. Apply merges into the form — nothing is
 *                saved until the merchant clicks Save.
 */
export interface AiPageApplyPayload {
  fields: { name?: string; title?: string; description?: string; richDescription?: string; dosage?: string; importantInfo?: string; specifications?: any[] };
  seo?: { title?: string; description?: string; keywords?: string; ogTitle?: string; ogDescription?: string };
  faqs?: Array<{ question: string; answer: string }>;
  tags?: string[];
  blocks?: ContentBlock[];
}

export interface AiPageWizardProps {
  open: boolean;
  onClose: () => void;
  productId?: string | null;
  draft: () => Record<string, any> | null | undefined;
  productImages: string[];
  isMedical: boolean;
  onApply: (payload: AiPageApplyPayload) => void;
}

const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400';

type Asset = { url: string; note: string };

const AiPageWizard: React.FC<AiPageWizardProps> = ({ open, onClose, productId, draft, productImages, isMedical, onApply }) => {
  const ai = useAiStatus();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [notes, setNotes] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [include, setInclude] = useState({ specifications: true, faqs: true, dosage: isMedical, importantInfo: isMedical, seo: true, tags: true, aplus: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState('');
  const [questions, setQuestions] = useState<PlannerQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [page, setPage] = useState<any>(null);
  const [apply, setApply] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const [pickerFor, setPickerFor] = useState<number | 'assets' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [describing, setDescribing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1); setError(null); setPage(null); setQuestions([]); setAnswers({}); setUnderstood('');
    setAssets(productImages.slice(0, 6).map((u) => ({ url: u, note: '' })));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && pickerFor === null) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pickerFor, onClose]);

  const body = useMemo(() => ({
    entityId: productId || undefined, draft: draft() ?? undefined, notes: notes || undefined, audience: audience || undefined, tone: tone || undefined,
    assets: assets.map((a) => ({ url: a.url, note: a.note || undefined })), include,
  }), [productId, draft, notes, audience, tone, assets, include]);

  if (!open) return null;

  const askQuestions = async () => {
    setBusy(true); setError(null);
    try {
      const out = await aiStudioAPI.pageQuestions(body);
      setUnderstood(out.understood); setQuestions(out.questions);
      if (out.questions.length === 0) await generate();
      else setStep(2);
    } catch (e: any) { setError(aiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const out = await aiStudioAPI.pageGenerate({ ...body, answers });
      setPage(out.page);
      const a: Record<string, boolean> = { title: true, shortDescription: true, description: true, specifications: include.specifications, faqs: include.faqs, dosage: include.dosage, importantInfo: include.importantInfo, seo: include.seo, tags: include.tags, aplus: include.aplus };
      // Don't overwrite an existing name silently.
      a.name = !(draft()?.name);
      setApply(a);
      setStep(3);
    } catch (e: any) { setError(aiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const uploadAssets = async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setUploading(true);
    try {
      const res: any = await uploadAPI.uploadMultiple(imgs, 'products/gallery');
      const urls: string[] = (res?.files || res?.data?.files || []).map((f: any) => f?.url || f).filter(Boolean);
      setAssets((prev) => [...prev, ...urls.map((u) => ({ url: u, note: '' }))].slice(0, 8));
    } catch (e: any) { setError(aiErrorMessage(e)); }
    finally { setUploading(false); }
  };

  const describe = async (url: string) => {
    setDescribing(url);
    try { const d = await aiStudioAPI.describeImage(url); setAssets((prev) => prev.map((a) => (a.url === url ? { ...a, note: d } : a))); }
    catch (e: any) { setError(aiErrorMessage(e)); }
    finally { setDescribing(null); }
  };

  const generateImageFor = async (idx: number) => {
    const blk = page?.aplusContent?.[idx]; if (!blk?.image) return;
    setGenerating((g) => ({ ...g, [idx]: true }));
    try {
      const out = await aiStudioAPI.image({
        slot: blk.type === 'image' ? 'product.aplus.banner' : 'product.aplus.image_text', entity: 'product', entityId: productId || undefined, draft: draft() ?? undefined,
        prompt: blk.image.generatePrompt || undefined, referenceImages: assets.map((a) => a.url).slice(0, 3), local: { heading: blk.heading, alt: blk.image.alt }, folder: 'product',
      });
      const url = out.images[0]?.url;
      if (url) setPage((p: any) => ({ ...p, aplusContent: p.aplusContent.map((b: any, i: number) => (i === idx ? { ...b, image: { ...b.image, url } } : b)) }));
    } catch (e: any) { setError(aiErrorMessage(e)); }
    finally { setGenerating((g) => ({ ...g, [idx]: false })); }
  };

  const toBlocks = (): ContentBlock[] => (page?.aplusContent || []).map((b: any): ContentBlock | null => {
    switch (b.type) {
      case 'image': return { type: 'image', data: { heading: b.heading || '', imageUrl: b.image?.url || '', alt: b.image?.alt || '' } } as any;
      case 'image_text': return { type: 'image_text', data: { heading: b.heading || '', body: b.body || '', imageUrl: b.image?.url || '', imagePosition: b.imagePosition === 'right' ? 'right' : 'left' } } as any;
      case 'text': return { type: 'text', data: { heading: b.heading || '', body: b.body || '' } } as any;
      case 'highlight_strip': return { type: 'highlight_strip', items: (b.items || []).map((i: any) => ({ icon: i.icon || 'lucide:Star', title: i.title || '', text: i.text || '' })) } as any;
      case 'icon_box': return { type: 'icon_box', items: (b.items || []).map((i: any) => ({ icon: i.icon || 'lucide:Check', title: i.title || '', desc: i.text || '' })) } as any;
      case 'faq': return { type: 'faq', items: (b.items || []).map((i: any) => ({ q: i.q || '', a: i.a || '' })) } as any;
      case 'comparison_table': return { type: 'comparison_table', data: { heading: b.heading || '', headers: b.headers || [], rows: b.rows || [] } } as any;
      default: return null;
    }
  }).filter(Boolean) as ContentBlock[];

  const doApply = () => {
    if (!page) return;
    const fields: AiPageApplyPayload['fields'] = {};
    if (apply.name && page.name) fields.name = page.name;
    if (apply.title && page.title) fields.title = page.title;
    if (apply.shortDescription && page.shortDescription) fields.description = page.shortDescription;
    if (apply.description && page.description) fields.richDescription = page.description;
    if (apply.dosage && page.dosage) fields.dosage = page.dosage;
    if (apply.importantInfo && page.importantInfo) fields.importantInfo = page.importantInfo;
    if (apply.specifications && page.specifications?.length) fields.specifications = page.specifications;
    onApply({
      fields,
      seo: apply.seo && page.seo ? { title: page.seo.metaTitle, description: page.seo.metaDescription, keywords: (page.seo.keywords || []).join(', '), ogTitle: page.title, ogDescription: page.seo.metaDescription } : undefined,
      faqs: apply.faqs ? page.faqs : undefined,
      tags: apply.tags ? page.tags : undefined,
      blocks: apply.aplus ? toBlocks() : undefined,
    });
    onClose();
  };

  const Tick: React.FC<{ k: string; label: string; count?: number }> = ({ k, label, count }) => (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-brand-600" checked={!!apply[k]} onChange={(e) => setApply((a) => ({ ...a, [k]: e.target.checked }))} /> {label}{count != null ? <span className="text-gray-400 text-xs">({count})</span> : null}</label>
  );

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget && pickerFor === null) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-brand-50 text-brand-700"><Wand2 size={16} /></span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Generate the product page with AI</h3>
              <p className="text-[11px] text-gray-500">{ai.status?.text ? `${ai.status.providers.find((p) => p.id === ai.status!.text!.provider)?.label} · ${ai.status.text.model}` : 'AI'} · nothing is saved until you click Save on the form</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ol className="hidden md:flex items-center gap-2 text-[11px]">
              {['Photos & notes', 'Questions', 'Review & apply'].map((l, i) => (
                <li key={l} className={`inline-flex items-center gap-1 ${step === i + 1 ? 'text-brand-700 font-semibold' : step > i + 1 ? 'text-gray-500' : 'text-gray-300'}`}><span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] ${step === i + 1 ? 'bg-brand-600 text-white' : step > i + 1 ? 'bg-gray-300 text-white' : 'bg-gray-100'}`}>{i + 1}</span>{l}{i < 2 && <ChevronRight size={12} className="text-gray-300" />}</li>
              ))}
            </ol>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5">
          {!ai.canText && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 mb-4">
              <p className="font-medium">AI is not available for this store yet.</p>
              <p className="mt-1 text-amber-800">{ai.textReason || ai.status?.reason}</p>
              {ai.status && ai.status.modules?.ai_content && <Link to={ai.setupPath} className="inline-flex items-center gap-1 mt-2 text-brand-700 font-medium hover:underline"><Settings2 size={14} /> Open API &amp; Integrations</Link>}
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{error}</p>}

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-700">Photos the AI may look at and use on the page</span>
                    <span className="text-[11px] text-gray-400">{assets.length}/8</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {assets.map((a) => (
                      <div key={a.url} className="relative group rounded-md border border-gray-200 overflow-hidden bg-gray-50">
                        <img src={a.url} alt="" className="w-full aspect-square object-cover" />
                        <button type="button" onClick={() => setAssets((p) => p.filter((x) => x.url !== a.url))} className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-gray-600 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 size={11} /></button>
                        <input value={a.note} onChange={(e) => setAssets((p) => p.map((x) => (x.url === a.url ? { ...x, note: e.target.value } : x)))} placeholder="what is it?" className="w-full text-[10px] px-1.5 py-1 border-t border-gray-200 focus:outline-none" />
                        <button type="button" onClick={() => describe(a.url)} disabled={describing === a.url} className="absolute bottom-6 right-1 text-[10px] bg-white/90 border border-gray-200 rounded px-1 opacity-0 group-hover:opacity-100">{describing === a.url ? '…' : '✨ describe'}</button>
                      </div>
                    ))}
                    <label className="flex flex-col items-center justify-center aspect-square rounded-md border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-400 cursor-pointer text-[11px]">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadAssets(e.target.files); e.currentTarget.value = ''; }} />
                      {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}<span className="mt-1">Upload</span>
                    </label>
                    <button type="button" onClick={() => setPickerFor('assets')} className="flex flex-col items-center justify-center aspect-square rounded-md border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-400 text-[11px]"><LayoutGrid size={16} /><span className="mt-1">Library</span></button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">A general photo is enough; a photo of the actual product lets the AI keep the packaging faithful in generated images.</p>
                </div>
              </div>
              <div className="space-y-3">
                <label className="block"><span className="text-xs font-medium text-gray-700">What should the page say? (notes, USPs, pack sizes, anything)</span>
                  <textarea rows={5} className={`${inputCls} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 30 ml and 100 ml packs; alcohol-based; popular for bruises and muscle soreness; ships in 2 days; mention our 100% genuine guarantee" /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-xs font-medium text-gray-700">Audience</span><input className={`${inputCls} mt-1`} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. first-time buyers, parents" /></label>
                  <label className="block"><span className="text-xs font-medium text-gray-700">Tone</span><input className={`${inputCls} mt-1`} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. warm and reassuring" /></label>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-700">Write</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
                    {([['aplus', 'Highlights (A+ blocks)'], ['specifications', 'Specifications'], ['faqs', 'FAQs'], ['seo', 'SEO title & description'], ['tags', 'Tags'], ['dosage', 'Dosage'], ['importantInfo', 'Important information']] as const).map(([k, l]) => (
                      <label key={k} className="inline-flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" className="accent-brand-600" checked={(include as any)[k]} onChange={(e) => setInclude((i) => ({ ...i, [k]: e.target.checked }))} /> {l}</label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Name, title, short and full description are always drafted; you choose what to apply at the end.</p>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="max-w-2xl space-y-4">
              {understood && <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-sm text-gray-800"><p className="text-[11px] uppercase tracking-wider text-brand-700 mb-1">What the AI understood</p>{understood}</div>}
              <p className="text-sm text-gray-700">A few questions to get the page right (skip any you do not know):</p>
              {questions.map((q) => (
                <div key={q.id} className="rounded-md border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-900">{q.question}</p>
                  {q.why && <p className="text-[11px] text-gray-400 mt-0.5">{q.why}</p>}
                  {q.type === 'choice' && q.options?.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {q.options.map((o) => <button key={o} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] === o ? '' : o }))} className={`px-2.5 h-7 text-xs rounded-md border ${answers[q.id] === o ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 hover:border-gray-400'}`}>{o}</button>)}
                      <input className={`${inputCls} mt-1`} value={q.options.includes(answers[q.id]) ? '' : (answers[q.id] || '')} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="or type your own" />
                    </div>
                  ) : (
                    <input className={`${inputCls} mt-2`} value={answers[q.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder={q.placeholder || 'Your answer'} />
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 3 && page && (
            <div className="space-y-5">
              {page.rationale && <p className="text-xs text-gray-500 italic">{page.rationale}</p>}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex flex-wrap gap-3"><Tick k="name" label="Name" /><Tick k="title" label="Storefront title" /><Tick k="shortDescription" label="Short description" /><Tick k="description" label="Full description" /></div>
                  <p className="text-sm font-semibold text-gray-900">{page.name}</p>
                  <p className="text-sm text-gray-700">{page.title}</p>
                  <p className="text-sm text-gray-600">{page.shortDescription}</p>
                  <div className="prose prose-sm max-w-none text-gray-800 border-t border-gray-100 pt-2 max-h-60 overflow-auto" dangerouslySetInnerHTML={{ __html: page.description }} />
                </section>
                <section className="rounded-lg border border-gray-200 p-3 space-y-3">
                  {page.seo && <div><Tick k="seo" label="SEO" /><p className="text-sm text-gray-800 mt-1">{page.seo.metaTitle}</p><p className="text-xs text-gray-600">{page.seo.metaDescription}</p><p className="text-[11px] text-gray-400 mt-1">{(page.seo.keywords || []).join(' · ')}</p></div>}
                  {page.tags?.length > 0 && <div><Tick k="tags" label="Tags" count={page.tags.length} /><p className="text-xs text-gray-600 mt-1">{page.tags.join(', ')} <span className="text-gray-400">(added as suggestions in the Tags panel)</span></p></div>}
                  {page.specifications?.length > 0 && <div><Tick k="specifications" label="Specifications" count={page.specifications.reduce((n: number, s: any) => n + s.items.length, 0)} /><ul className="text-xs text-gray-600 mt-1 space-y-0.5">{page.specifications.map((s: any) => <li key={s.heading}><b>{s.heading}:</b> {s.items.map((i: any) => `${i.key} — ${i.value}`).join('; ')}</li>)}</ul></div>}
                  {page.faqs?.length > 0 && <div><Tick k="faqs" label="FAQs" count={page.faqs.length} /><ul className="text-xs text-gray-600 mt-1 space-y-1">{page.faqs.map((f: any) => <li key={f.question}><b>{f.question}</b> {f.answer}</li>)}</ul></div>}
                  {page.dosage && <div><Tick k="dosage" label="Dosage" /><div className="prose prose-xs max-w-none text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: page.dosage }} /></div>}
                  {page.importantInfo && <div><Tick k="importantInfo" label="Important information" /><div className="prose prose-xs max-w-none text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: page.importantInfo }} /></div>}
                </section>
              </div>
              {page.aplusContent?.length > 0 && (
                <section className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2"><Tick k="aplus" label="Highlights (A+ blocks)" count={page.aplusContent.length} /><span className="text-[11px] text-gray-400">Images: generate now at the exact slot size, or pick from your photos. Blocks without an image still apply — add one later.</span></div>
                  <div className="space-y-2">
                    {page.aplusContent.map((b: any, i: number) => (
                      <div key={i} className="flex gap-3 rounded-md border border-gray-100 bg-gray-50/60 p-2">
                        {b.image && (
                          <div className="w-40 shrink-0">
                            {b.image.url ? <img src={b.image.url} alt="" className="w-full rounded border border-gray-200 object-cover" style={{ aspectRatio: b.type === 'image' ? '8 / 3' : '4 / 3' }} />
                              : <div className="w-full rounded border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300" style={{ aspectRatio: b.type === 'image' ? '8 / 3' : '4 / 3' }}><ImageIcon size={18} /></div>}
                            <div className="flex gap-1 mt-1">
                              <button type="button" disabled={!ai.canImage || generating[i]} onClick={() => generateImageFor(i)} className="flex-1 inline-flex items-center justify-center gap-1 h-6 text-[11px] rounded border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40" title={ai.canImage ? b.image.generatePrompt : (ai.imageReason || '')}>{generating[i] ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} {b.image.url ? 'Redo' : 'Generate'}</button>
                              <button type="button" onClick={() => setPickerFor(i)} className="h-6 px-1.5 text-[11px] rounded border border-gray-300 bg-white hover:bg-gray-50"><LayoutGrid size={11} /></button>
                            </div>
                          </div>
                        )}
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400">{b.type.replace('_', ' ')}</p>
                          {b.heading && <p className="text-sm font-medium text-gray-900">{b.heading}</p>}
                          {b.body && <div className="prose prose-xs max-w-none text-gray-600" dangerouslySetInnerHTML={{ __html: b.body }} />}
                          {b.items && <ul className="text-gray-600 space-y-0.5">{b.items.map((it: any, j: number) => <li key={j}>{it.title || it.q ? <b>{it.title || it.q}</b> : null} {it.text || it.a}</li>)}</ul>}
                          {b.headers && <p className="text-gray-500">{b.headers.join(' | ')} · {b.rows?.length} rows</p>}
                          {b.image?.generatePrompt && !b.image.url && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">Prompt: {b.image.generatePrompt}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <div className="text-[11px] text-gray-500">{step === 3 ? 'Untick anything you want to keep as it is. Applying updates the form; Save writes it to the product.' : 'The AI writes a proposal; you review every part before it touches the product.'}</div>
          <div className="flex items-center gap-2">
            {step > 1 && <button type="button" onClick={() => setStep((s) => (s === 3 ? (questions.length ? 2 : 1) : 1))} className="inline-flex items-center gap-1 px-3 h-8 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"><ChevronLeft size={14} /> Back</button>}
            <button type="button" onClick={onClose} className="px-3 h-8 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50">Cancel</button>
            {step === 1 && <button type="button" disabled={!ai.canText || busy} onClick={askQuestions} className="inline-flex items-center gap-1.5 px-4 h-8 text-sm rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy ? 'Reading…' : 'Continue'}</button>}
            {step === 2 && <button type="button" disabled={busy} onClick={generate} className="inline-flex items-center gap-1.5 px-4 h-8 text-sm rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} {busy ? 'Writing the page…' : 'Write the page'}</button>}
            {step === 3 && <button type="button" onClick={doApply} className="inline-flex items-center gap-1.5 px-4 h-8 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800"><Check size={14} /> Apply to the form</button>}
          </div>
        </div>
      </div>

      <MediaPicker open={pickerFor !== null} onClose={() => setPickerFor(null)} folder="products/gallery" spec={pickerFor === 'assets' ? 'product.gallery' : page?.aplusContent?.[pickerFor as number]?.type === 'image' ? 'product.aplus.banner' : 'product.aplus.image_text'}
        entity="product" entityId={productId} draft={draft} referenceImages={assets.map((a) => a.url)}
        onSelect={(url) => {
          if (pickerFor === 'assets') setAssets((p) => (p.some((a) => a.url === url) ? p : [...p, { url, note: '' }].slice(0, 8)));
          else if (typeof pickerFor === 'number') setPage((p: any) => ({ ...p, aplusContent: p.aplusContent.map((b: any, i: number) => (i === pickerFor ? { ...b, image: { ...(b.image || {}), url } } : b)) }));
        }} />
    </div>
  );
};

export default AiPageWizard;
