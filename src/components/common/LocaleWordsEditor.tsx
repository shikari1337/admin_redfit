import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { localeName } from '@/lib/v2/appSettings';

/**
 * LocaleWordsEditor (HMAPP design 60, request A3): the words of one entry per language, a label
 * and (optionally) a hint under it. The languages offered are the ones the document already
 * uses (`suggest`) plus any tag the person adds; names come from the browser
 * (`Intl.DisplayNames`), never a list kept here. The server checks every tag again.
 */

export interface LocaleWords { label: string; hint?: string | null }

/** `en`, `hi`, `en-SG`, `hi-IN`: a language and optional region or script parts. */
const TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

export const LocaleWordsEditor: React.FC<{
  value: Record<string, LocaleWords>;
  onChange: (next: Record<string, LocaleWords>) => void;
  /** Languages to offer with one click (those used elsewhere in the document). */
  suggest?: string[];
  withHint?: boolean;
  maxLabel?: number;
  maxHint?: number;
  /** At least one language must stay (the server refuses an entry with none). */
  required?: boolean;
  disabled?: boolean;
  idPrefix: string;
}> = ({ value, onChange, suggest = [], withHint = true, maxLabel = 80, maxHint = 200, required = true, disabled, idPrefix }) => {
  const [tag, setTag] = useState('');
  const [bad, setBad] = useState<string | null>(null);
  const tags = Object.keys(value);
  const offer = [...new Set(suggest)].filter((t) => !tags.includes(t));

  const add = (t: string) => {
    const clean = t.trim();
    if (!TAG.test(clean)) { setBad('A language tag such as en, hi or en-SG.'); return; }
    if (tags.includes(clean)) { setBad('That language is already here.'); return; }
    setBad(null);
    setTag('');
    onChange({ ...value, [clean]: { label: '', hint: null } });
  };
  const set = (t: string, patch: Partial<LocaleWords>) => onChange({ ...value, [t]: { ...value[t], ...patch } });
  const drop = (t: string) => { const next = { ...value }; delete next[t]; onChange(next); };

  return (
    <div className="space-y-2">
      {tags.map((t) => {
        const w = value[t];
        const labelLen = (w.label ?? '').trim().length;
        return (
          <div key={t} className="grid gap-2 rounded-lg border border-gray-200 p-2 sm:grid-cols-[7rem_1fr_auto]">
            <div className="text-xs">
              <div className="font-mono text-gray-800">{t}</div>
              <div className="text-gray-500">{localeName(t)}</div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs text-gray-600" htmlFor={`${idPrefix}-${t}-label`}>Label</label>
              <input
                id={`${idPrefix}-${t}-label`}
                value={w.label ?? ''}
                maxLength={maxLabel}
                disabled={disabled}
                onChange={(e) => set(t, { label: e.target.value })}
                className={cn('h-9 w-full rounded-lg border bg-white px-3 text-sm', labelLen === 0 ? 'border-amber-300' : 'border-gray-200')}
              />
              {withHint && (
                <>
                  <label className="block text-xs text-gray-600" htmlFor={`${idPrefix}-${t}-hint`}>Line under it (optional)</label>
                  <input
                    id={`${idPrefix}-${t}-hint`}
                    value={w.hint ?? ''}
                    maxLength={maxHint}
                    disabled={disabled}
                    onChange={(e) => set(t, { hint: e.target.value })}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
                  />
                </>
              )}
            </div>
            <button
              type="button"
              disabled={disabled || (required && tags.length <= 1)}
              onClick={() => drop(t)}
              className="self-start rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-30"
              aria-label={`Remove the ${localeName(t)} words`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        {offer.map((t) => (
          <button key={t} type="button" disabled={disabled} onClick={() => add(t)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Plus className="h-3 w-3" aria-hidden />{localeName(t)}
          </button>
        ))}
        <input
          value={tag}
          disabled={disabled}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(tag); } }}
          placeholder="Language tag, for example ta"
          aria-label="Language tag to add"
          className="h-8 w-48 rounded-lg border border-gray-200 bg-white px-2 text-xs"
        />
        <button type="button" disabled={disabled || !tag.trim()} onClick={() => add(tag)}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <Plus className="h-3 w-3" aria-hidden />Add language
        </button>
      </div>
      {bad && <p className="text-xs text-red-700">{bad}</p>}
    </div>
  );
};

export default LocaleWordsEditor;
