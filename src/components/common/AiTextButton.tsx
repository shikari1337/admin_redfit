import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2, RefreshCw, Check, Pencil, Settings2, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  aiStudioAPI, useAiStatus, aiErrorMessage,
  ACTION_LABELS, TONE_LABELS,
  type AiEntity, type AiAction, type AiTone, type AiLength, type AiFormat, type AiTextResult,
} from '../../lib/ai';

/**
 * ✨ — the contextual text generator every text field offers.
 *
 * The button never disappears: when AI is off it renders muted with the
 * reason in its tooltip, and clicking opens the same dialog with a "switch
 * AI on" link. When AI is on, the dialog offers the ACTIONS (write / improve /
 * shorten / expand / fix / simplify / translate / custom), tone and length,
 * shows the result (rendered for HTML, listed for JSON) and only writes into
 * the field when the user clicks "Use this" — the field is never overwritten
 * silently.
 *
 * `field` is the rule key the server understands (`product.long_desc`,
 * `category.description`, `aplus.faq`…); `draft()` supplies the unsaved form
 * so a brand-new record gets context before it has an id.
 */
export interface AiTextButtonProps {
  entity: AiEntity;
  entityId?: string | null;
  draft?: () => Record<string, any> | null | undefined;
  field: string;
  label?: string;
  format?: AiFormat;
  value?: string;
  onResult: (value: any) => void;
  /** Extra local facts (section heading, the question an answer is for…). */
  local?: Record<string, string | undefined>;
  size?: 'xs' | 'sm';
  /** 'icon' = just the sparkle; 'label' = sparkle + "AI". */
  variant?: 'icon' | 'label';
  className?: string;
  disabled?: boolean;
}

const btnBase = 'inline-flex items-center gap-1 rounded-md border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-40 disabled:cursor-not-allowed';

export const AiTextButton: React.FC<AiTextButtonProps> = ({
  entity, entityId, draft, field, label, format, value, onResult, local, size = 'xs', variant = 'label', className = '', disabled,
}) => {
  const [open, setOpen] = useState(false);
  const ai = useAiStatus();
  const ready = ai.canText;
  const title = ready ? `Generate ${label ? label.toLowerCase() : 'text'} with AI` : (ai.textReason || 'Checking AI…');
  const pad = size === 'xs' ? 'px-1.5 h-6 text-[11px]' : 'px-2 h-7 text-xs';
  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOpen(true)}
              aria-label={title}
              className={`${btnBase} ${pad} ${ready
                ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:border-brand-300'
                : 'border-gray-200 bg-white text-gray-400 hover:text-gray-600'} ${className}`}
            >
              <Sparkles size={size === 'xs' ? 12 : 14} />
              {variant === 'label' && <span>AI</span>}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">{title}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && (
        <AiTextDialog
          entity={entity} entityId={entityId} draft={draft} field={field} label={label} format={format}
          value={value} local={local}
          onClose={() => setOpen(false)}
          onUse={(v) => { onResult(v); setOpen(false); }}
        />
      )}
    </>
  );
};

// ─── dialog ──────────────────────────────────────────────────────────────────

const ACTIONS: AiAction[] = ['generate', 'improve', 'shorten', 'expand', 'fix', 'simplify', 'translate', 'custom'];
const LANGS = ['Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Malayalam', 'Punjabi', 'English'];

const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400';

export const AiTextDialog: React.FC<{
  entity: AiEntity; entityId?: string | null; draft?: () => Record<string, any> | null | undefined;
  field: string; label?: string; format?: AiFormat; value?: string; local?: Record<string, string | undefined>;
  onClose: () => void; onUse: (value: any) => void;
}> = ({ entity, entityId, draft, field, label, format, value, local, onClose, onUse }) => {
  const ai = useAiStatus();
  const hasValue = !!(value && String(value).replace(/<[^>]*>/g, '').trim());
  const [action, setAction] = useState<AiAction>(hasValue ? 'improve' : 'generate');
  const [tone, setTone] = useState<AiTone>('default');
  const [length, setLength] = useState<AiLength>('auto');
  const [language, setLanguage] = useState('Hindi');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiTextResult | null>(null);
  const [edited, setEdited] = useState<string>('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const out = await aiStudioAPI.text({
        entity, entityId: entityId || undefined, draft: draft?.() ?? undefined,
        field, fieldLabel: label, format, action, currentValue: value ?? '', instruction: instruction || undefined,
        tone, length, language: action === 'translate' ? language : undefined, local,
      });
      setResult(out);
      setEdited(typeof out.value === 'string' ? out.value : JSON.stringify(out.value, null, 2));
      setEditing(false);
    } catch (e: any) {
      setError(aiErrorMessage(e));
    } finally { setBusy(false); }
  };

  const useIt = () => {
    if (!result) return;
    if (result.format === 'json') {
      try { onUse(editing ? JSON.parse(edited) : result.value); } catch { setError('The edited JSON is not valid.'); }
      return;
    }
    onUse(editing ? edited : result.value);
  };

  const previewJson = useMemo(() => {
    if (!result || result.format !== 'json') return null;
    const v = result.value;
    const list: any[] = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : Array.isArray(v?.sections) ? v.sections : Array.isArray(v?.keywords) ? v.keywords : Array.isArray(v?.tags) ? v.tags : Array.isArray(v?.rows) ? v.rows : [];
    return list;
  }, [result]);

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-brand-50 text-brand-700"><Sparkles size={15} /></span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{label || 'Generate with AI'}</h3>
              <p className="text-[11px] text-gray-500 truncate">
                {ai.status?.text ? `${ai.status.providers.find((p) => p.id === ai.status!.text!.provider)?.label} · ${ai.status.text.model}` : 'AI'}
                {' · '}context: {entity}{entityId ? ' (saved)' : ' (unsaved draft)'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {!ai.canText ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">AI is not available for this store yet.</p>
              <p className="mt-1 text-amber-800">{ai.textReason || ai.status?.reason || 'No provider is configured.'}</p>
              {ai.status && !ai.status.modules?.ai_content ? null : (
                <Link to={ai.setupPath} className="inline-flex items-center gap-1 mt-3 text-brand-700 font-medium hover:underline">
                  <Settings2 size={14} /> Open API &amp; Integrations to switch on Gemini or OpenAI
                </Link>
              )}
            </div>
          ) : (
            <>
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1.5">What should the AI do?</div>
                <div className="flex flex-wrap gap-1.5">
                  {ACTIONS.filter((a) => hasValue || ['generate', 'custom'].includes(a)).map((a) => (
                    <button key={a} type="button" onClick={() => setAction(a)}
                      className={`px-2.5 h-7 rounded-md text-xs border transition-colors ${action === a ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                      {ACTION_LABELS[a]}
                    </button>
                  ))}
                </div>
                {!hasValue && <p className="text-[11px] text-gray-400 mt-1">Improve / shorten / expand appear once the field has text.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Tone</span>
                  <select className={`${inputCls} mt-1`} value={tone} onChange={(e) => setTone(e.target.value as AiTone)}>
                    {(Object.keys(TONE_LABELS) as AiTone[]).map((t) => <option key={t} value={t}>{TONE_LABELS[t]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Length</span>
                  <select className={`${inputCls} mt-1`} value={length} onChange={(e) => setLength(e.target.value as AiLength)}>
                    <option value="auto">Auto</option><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option>
                  </select>
                </label>
                {action === 'translate' ? (
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Language</span>
                    <select className={`${inputCls} mt-1`} value={language} onChange={(e) => setLanguage(e.target.value)}>
                      {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                ) : <div />}
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">{action === 'custom' ? 'Your instruction' : 'Anything specific? (optional)'}</span>
                <textarea rows={2} className={`${inputCls} mt-1`} value={instruction} onChange={(e) => setInstruction(e.target.value)}
                  placeholder={action === 'custom' ? 'e.g. Focus on children, mention the 30 ml pack, end with a call to action' : 'e.g. mention it is alcohol-free; keep it under 40 words'} />
              </label>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

              {result && (
                <div className="rounded-lg border border-brand-200 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-brand-50 text-[11px] text-brand-800">
                    <span>Result · {result.provider} · {result.model}{result.maxChars ? ` · ${(editing ? edited : String(result.value ?? '')).replace(/<[^>]*>/g, '').length}/${result.maxChars} chars` : ''}</span>
                    <button type="button" onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1 hover:underline"><Pencil size={11} /> {editing ? 'Preview' : 'Edit before using'}</button>
                  </div>
                  <div className="p-3 max-h-72 overflow-auto">
                    {editing ? (
                      <textarea rows={8} className={`${inputCls} font-mono text-xs`} value={edited} onChange={(e) => setEdited(e.target.value)} />
                    ) : result.format === 'html' ? (
                      <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: String(result.value) }} />
                    ) : result.format === 'json' ? (
                      <ul className="text-sm text-gray-800 space-y-1.5">
                        {(previewJson || []).map((it: any, i: number) => (
                          <li key={i} className="border-b border-gray-100 pb-1.5 last:border-0">
                            {typeof it === 'string' ? it
                              : it.question ? <><span className="font-medium">{it.question}</span><br /><span className="text-gray-600">{it.answer}</span></>
                              : it.q ? <><span className="font-medium">{it.q}</span><br /><span className="text-gray-600">{it.a}</span></>
                              : it.heading ? <><span className="font-medium">{it.heading}</span>{Array.isArray(it.items) && <span className="text-gray-600"> — {it.items.map((x: any) => `${x.key}: ${x.value}`).join(' · ')}</span>}</>
                              : it.title ? <><span className="font-medium">{it.title}</span>{it.text || it.desc ? <span className="text-gray-600"> — {it.text || it.desc}</span> : null}</>
                              : Array.isArray(it) ? it.join(' | ') : JSON.stringify(it)}
                          </li>
                        ))}
                        {(!previewJson || previewJson.length === 0) && <li className="text-gray-500">Structured result ready.</li>}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{String(result.value)}</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-[11px] text-gray-500">Nothing is saved until you use the result and save the form.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 h-8 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50">Cancel</button>
            {ai.canText && (
              <button type="button" onClick={run} disabled={busy || (action === 'custom' && !instruction.trim())}
                className="inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-md border border-brand-600 bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : result ? <RefreshCw size={14} /> : <Sparkles size={14} />}
                {busy ? 'Working…' : result ? 'Regenerate' : ACTION_LABELS[action]}
              </button>
            )}
            {result && (
              <button type="button" onClick={useIt} className="inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800">
                <Check size={14} /> Use this
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiTextButton;
