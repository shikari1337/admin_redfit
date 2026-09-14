import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2, Check, X, Settings2, Wand2, RefreshCw, ImageIcon } from 'lucide-react';
import { aiStudioAPI, useAiStatus, aiErrorMessage, STYLE_LABELS, type AiEntity, type AiImageStyle, type AiImageResult } from '../../lib/ai';
import { useImageSpec, specHint } from '../../lib/imageSpecs';

/**
 * ✨ image generation for ONE image slot.
 *
 * The size is never a free choice: it comes from the slot's resolved spec
 * (what this store's frontend actually renders), so a hero comes back
 * 1920×600 and an icon 128×128 — "exactly according to size and quality
 * required". The prompt is contextual (entity facts + the block's own
 * heading) and the merchant can steer it, pick a style, use the product's
 * real photos as references (the model keeps the packaging faithful), then
 * MODIFY a result ("warmer light", "remove the leaves") which regenerates
 * with that result as the reference. Nothing is placed until "Use".
 */
export interface AiImageDialogProps {
  open: boolean;
  onClose: () => void;
  onUse: (url: string, meta?: { width: number; height: number }) => void;
  slot?: string;
  entity?: AiEntity;
  entityId?: string | null;
  draft?: () => Record<string, any> | null | undefined;
  /** The image currently in the field — offered as a reference for "modify". */
  currentUrl?: string;
  /** Product photos etc. the model may look at (only our own media is accepted server-side). */
  referenceImages?: string[];
  local?: Record<string, string | undefined>;
  folder?: string;
  title?: string;
}

const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400';

const AiImageDialog: React.FC<AiImageDialogProps> = ({
  open, onClose, onUse, slot, entity = 'generic', entityId, draft, currentUrl, referenceImages = [], local, folder, title,
}) => {
  const ai = useAiStatus();
  const spec = useImageSpec(slot);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<AiImageStyle>('auto');
  const [useRefs, setUseRefs] = useState(true);
  const [count, setCount] = useState<1 | 2>(1);
  const [provider, setProvider] = useState<'auto' | 'gemini' | 'openai'>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AiImageResult['images']>([]);
  const [picked, setPicked] = useState<string>('');
  const [modifyOf, setModifyOf] = useState<string>('');
  const [modifyText, setModifyText] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');

  const refs = useMemo(() => Array.from(new Set([...(referenceImages || []), ...(currentUrl ? [currentUrl] : [])])).filter(Boolean).slice(0, 4), [referenceImages, currentUrl]);

  useEffect(() => {
    if (!open) return;
    setResults([]); setPicked(''); setModifyOf(''); setModifyText(''); setError(null);
    const seed = [local?.heading, local?.title, local?.itemTitle].filter(Boolean).join(' — ');
    setPrompt(seed ? `Image for: ${seed}` : '');
  }, [open, local?.heading, local?.title, local?.itemTitle]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const run = async (opts: { instruction?: string; referenceImages?: string[] } = {}) => {
    setBusy(true); setError(null);
    try {
      const out = await aiStudioAPI.image({
        slot: spec.key === 'generic' ? undefined : spec.key,
        entity, entityId: entityId || undefined, draft: draft?.() ?? undefined,
        prompt: prompt || undefined, instruction: opts.instruction, style,
        referenceImages: opts.referenceImages ?? (useRefs ? refs : []),
        local, count, folder, provider: provider === 'auto' ? undefined : provider,
      });
      setResults((prev) => [...out.images, ...prev].slice(0, 8));
      setPicked(out.images[0]?.url || '');
      setLastPrompt(out.prompt);
      setModifyOf(''); setModifyText('');
    } catch (e: any) {
      setError(aiErrorMessage(e));
    } finally { setBusy(false); }
  };

  const providers = ai.status?.providers.filter((p) => p.configured) || [];
  const imageProvider = ai.status?.image;

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-brand-50 text-brand-700"><Wand2 size={15} /></span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{title || `Generate ${spec.label.toLowerCase()}`}</h3>
              <p className="text-[11px] text-gray-500 truncate">
                Output <span className="font-medium text-gray-700">{spec.width} × {spec.height} px ({spec.aspect})</span>
                {spec.uses ? ` · ${spec.uses}` : ''}
                {imageProvider ? ` · ${ai.status?.providers.find((p) => p.id === imageProvider.provider)?.label} ${imageProvider.model}` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close"><X size={18} /></button>
        </div>

        {!ai.canImage ? (
          <div className="p-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">AI images are not available for this store yet.</p>
              <p className="mt-1 text-amber-800">{ai.imageReason || ai.status?.reason || 'No provider is configured.'}</p>
              {ai.status && !ai.status.modules?.ai_images ? null : (
                <Link to={ai.setupPath} className="inline-flex items-center gap-1 mt-3 text-brand-700 font-medium hover:underline">
                  <Settings2 size={14} /> Open API &amp; Integrations
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] overflow-hidden">
            {/* Controls */}
            <div className="overflow-auto p-5 space-y-4 border-b md:border-b-0 md:border-r border-gray-200">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Describe the image (optional — the product, section and store are already known)</span>
                <textarea rows={4} className={`${inputCls} mt-1`} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. the bottle on a wooden table with fresh arnica flowers, morning light" />
              </label>
              <div>
                <span className="text-xs font-medium text-gray-600">Style</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(Object.keys(STYLE_LABELS) as AiImageStyle[]).map((s) => (
                    <button key={s} type="button" onClick={() => setStyle(s)}
                      className={`px-2.5 h-7 rounded-md text-xs border transition-colors ${style === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                      {STYLE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              {refs.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={useRefs} onChange={(e) => setUseRefs(e.target.checked)} className="accent-brand-600" />
                    Use these photos as reference (keeps the real product faithful)
                  </label>
                  <div className="flex gap-1.5 mt-2">
                    {refs.map((u) => <img key={u} src={u} alt="" className={`w-12 h-12 rounded object-cover border ${useRefs ? 'border-brand-300' : 'border-gray-200 opacity-50'}`} />)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">How many</span>
                  <select className={`${inputCls} mt-1`} value={count} onChange={(e) => setCount(Number(e.target.value) as 1 | 2)}>
                    <option value={1}>1 image</option><option value={2}>2 options</option>
                  </select>
                </label>
                {providers.length > 1 && (
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Provider</span>
                    <select className={`${inputCls} mt-1`} value={provider} onChange={(e) => setProvider(e.target.value as any)}>
                      <option value="auto">Automatic</option>
                      {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="text-[11px] text-gray-500 rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
                Needs {specHint(spec)}. The image is generated at exactly this size and saved to your media library under <code className="font-mono">ai/</code>.
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
              <button type="button" onClick={() => run()} disabled={busy}
                className="w-full inline-flex items-center justify-center gap-1.5 h-9 text-sm rounded-md border border-brand-600 bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : results.length ? <RefreshCw size={15} /> : <Sparkles size={15} />}
                {busy ? 'Generating…' : results.length ? 'Generate again' : 'Generate'}
              </button>
            </div>

            {/* Results */}
            <div className="overflow-auto p-5">
              {results.length === 0 ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                  <ImageIcon size={34} className="mb-2" />
                  <p className="text-sm">Your generated images appear here.</p>
                  <p className="text-xs mt-1">Shape: {spec.aspect} · {spec.fit === 'cover' ? 'edges may be cropped on the page' : 'shown whole'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={`grid gap-3 ${spec.width >= spec.height * 1.6 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {results.map((img) => (
                      <button key={img.url} type="button" onClick={() => setPicked(img.url)}
                        className={`relative rounded-lg overflow-hidden border-2 text-left ${picked === img.url ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-400'}`}>
                        <img src={img.url} alt="" className="w-full h-auto block bg-gray-50" style={{ aspectRatio: `${img.width} / ${img.height}` }} />
                        <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">{img.width}×{img.height} · {Math.round(img.bytes / 1024)} KB</span>
                        {picked === img.url && <span className="absolute top-1 right-1 bg-brand-600 text-white rounded-full p-1"><Check size={12} /></span>}
                      </button>
                    ))}
                  </div>
                  {picked && (
                    <div className="rounded-md border border-gray-200 p-3">
                      {modifyOf === picked ? (
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-gray-600">What should change?</label>
                          <input className={inputCls} value={modifyText} onChange={(e) => setModifyText(e.target.value)} placeholder="e.g. warmer light, plain white background, move the bottle to the right" autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter' && modifyText.trim()) run({ instruction: modifyText, referenceImages: [picked] }); }} />
                          <div className="flex gap-2">
                            <button type="button" disabled={busy || !modifyText.trim()} onClick={() => run({ instruction: modifyText, referenceImages: [picked] })}
                              className="inline-flex items-center gap-1 px-3 h-8 text-xs rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50">
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Apply change
                            </button>
                            <button type="button" onClick={() => setModifyOf('')} className="px-3 h-8 text-xs border border-gray-300 rounded-md">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-500 truncate">Selected — use it, or ask for a change to this exact image.</p>
                          <button type="button" onClick={() => setModifyOf(picked)} className="inline-flex items-center gap-1 px-2.5 h-7 text-xs border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap">
                            <Wand2 size={12} /> Modify this
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {lastPrompt && (
                    <details className="text-[11px] text-gray-500">
                      <summary className="cursor-pointer">Prompt the AI received</summary>
                      <pre className="mt-1 whitespace-pre-wrap font-sans bg-gray-50 border border-gray-200 rounded p-2 max-h-40 overflow-auto">{lastPrompt}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-[11px] text-gray-500">Generated files stay in the media library even if you do not use them here.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 h-8 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50">Cancel</button>
            <button type="button" disabled={!picked} onClick={() => { const r = results.find((x) => x.url === picked); onUse(picked, r ? { width: r.width, height: r.height } : undefined); onClose(); }}
              className="inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40">
              <Check size={14} /> Use selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiImageDialog;
