import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { Btn, Field, SelectInput, TextInput } from '@/components/erp';
import { LocaleWordsEditor, type LocaleWords } from '@/components/common/LocaleWordsEditor';
import { ErrorNote, Loading, Notice, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { B2B_PERMS, getBusinessTypes, putBusinessTypes, type BusinessType } from '@/lib/v2/business';

/**
 * Business types (HMAPP design 60, AD09; HMAPP-T6 B11): the list the business apply form offers,
 * as store data with a starter list the server answers until the store saves its own. An
 * application keeps the type it was sent under, so renaming a type never rewrites a past one.
 *
 * Server (Trade): `GET/PUT /api/v2/trade/business-types` (`b2b.read`; save `b2b.manage` and a
 * person; the PUT replaces the list whole, 1 to 30 types). The alcohol pack rule is the backend's
 * check, not a type flag; "hospital or dispensary" only marks the class that rule will read.
 * Each save carries its reason (3 to 300 characters; the server keeps who, when, why and what).
 * "Photo or PDF required" (owner, 14 Nov 2026) makes the apply wait for a picture of the drug
 * licence, its certificate or the clinic; it is on unless the store turns it off.
 */

/** What a type asks about the drug licence: the server's codes, with what each means. */
const LICENCE: Array<{ code: string; words: string }> = [
  { code: 'required', words: 'Licence number required' },
  { code: 'optional', words: 'Licence number asked, not required' },
  { code: 'none', words: 'Not asked' },
];

const KEY = /^[a-z0-9_]{2,40}$/;

/** `labels` (locale to words) as the words editor holds them, and back. */
const toWords = (labels?: Record<string, string>): Record<string, LocaleWords> =>
  Object.fromEntries(Object.entries(labels ?? {}).map(([t, w]) => [t, { label: w }]));
const fromWords = (w: Record<string, LocaleWords>): Record<string, string> =>
  Object.fromEntries(Object.entries(w).map(([t, x]) => [t, x.label.trim()]).filter(([, x]) => x));

const B2BBusinessTypes: React.FC = () => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm(B2B_PERMS.manage);
  const data = useLoad(getBusinessTypes, []);
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => { if (data.data) { setTypes(data.data.types ?? []); setDirty(false); } }, [data.data]);

  const storedKeys = useMemo(() => new Set(data.data?.source === 'store' ? (data.data.types ?? []).map((t) => t.key) : []), [data.data]);
  const locales = useMemo(() => [...new Set(types.flatMap((t) => Object.keys(t.labels ?? {})))], [types]);
  const change = (next: BusinessType[]) => { setTypes(next); setDirty(true); setSaved(false); };
  const setType = (i: number, patch: Partial<BusinessType>) => change(types.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= types.length) return;
    const next = types.slice();
    [next[i], next[to]] = [next[to], next[i]];
    change(next);
  };

  if (data.loading && !data.data) return <Loading label="Reading the business types" />;
  if (data.error) return <ErrorNote error={data.error} what="Business types" onRetry={() => void data.reload()} />;

  const bad = types.find((t) => !KEY.test(t.key) || !t.label.trim());
  const dup = types.length !== new Set(types.map((t) => t.key)).size;
  const off = whyDisabled(canSave, [
    !dirty && 'Nothing has changed.',
    types.length === 0 && 'List at least one business type.',
    types.length > 30 && 'At most 30 business types.',
    bad && 'Each type needs a key (2 to 40 lower case letters, digits or _) and words.',
    dup && 'Each key once.',
    (reason.trim().length < 3 || reason.trim().length > 300) && 'Say why you are changing the list (3 to 300 characters).',
  ], 'Manage B2B');

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await putBusinessTypes(types.map((t) => ({
        key: t.key.trim(), label: t.label.trim(),
        ...(t.labels && Object.keys(t.labels).length ? { labels: t.labels } : {}),
        licence: t.licence, hospital_or_dispensary: t.hospital_or_dispensary,
        gstin_required: !!t.gstin_required, proof_required: t.proof_required !== false,
      })), reason.trim());
      setSaved(true); setReason(''); await data.reload();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {data.data?.source !== 'store' && (
        <Notice tone="info" title="Showing the starter list">Change anything and save to make this list the store's own.</Notice>
      )}
      <p className="text-sm text-gray-600">The types a business picks when it applies, in this order. A person checks every application.</p>
      <div className="space-y-3">
        {types.map((t, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Key">
                <TextInput value={t.key} maxLength={40} disabled={!canSave || storedKeys.has(t.key)} className="w-40 font-mono text-xs"
                  title={storedKeys.has(t.key) ? 'Fixed once saved: applications carry it.' : undefined}
                  onChange={(e) => setType(i, { key: e.target.value })} />
              </Field>
              <Field label="Words shown" className="min-w-[14rem] flex-1">
                <TextInput value={t.label} maxLength={80} disabled={!canSave} onChange={(e) => setType(i, { label: e.target.value })} />
              </Field>
              <Field label="Drug licence">
                <SelectInput value={t.licence} disabled={!canSave} onChange={(e) => setType(i, { licence: e.target.value })}>
                  {LICENCE.map((l) => <option key={l.code} value={l.code}>{l.words}</option>)}
                </SelectInput>
              </Field>
              <label className="mb-2 inline-flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!canSave} checked={t.hospital_or_dispensary} onChange={(e) => setType(i, { hospital_or_dispensary: e.target.checked })} />
                Hospital or dispensary
              </label>
              <label className="mb-2 inline-flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!canSave} checked={!!t.gstin_required} onChange={(e) => setType(i, { gstin_required: e.target.checked })} />
                GSTIN required
              </label>
              <label className="mb-2 inline-flex items-center gap-2 text-sm" title="A photo or PDF of the drug licence, its certificate or the clinic">
                <input type="checkbox" disabled={!canSave} checked={t.proof_required !== false} onChange={(e) => setType(i, { proof_required: e.target.checked })} />
                Photo or PDF required
              </label>
              <span className="mb-1 ml-auto flex gap-1">
                <button type="button" disabled={!canSave || i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" disabled={!canSave || i === types.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" disabled={!canSave} onClick={() => change(types.filter((_, j) => j !== i))} aria-label={`Remove ${t.label || 'type'}`} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              </span>
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-gray-600">Words in other languages ({Object.keys(t.labels ?? {}).length})</summary>
              <div className="pt-2">
                <LocaleWordsEditor idPrefix={`btype-${i}`} withHint={false} required={false} disabled={!canSave}
                  value={toWords(t.labels)} suggest={locales} onChange={(w) => setType(i, { labels: fromWords(w) })} />
              </div>
            </details>
          </div>
        ))}
      </div>
      {dirty && canSave && (
        <Field label="Why this change" className="max-w-xl">
          <TextInput value={reason} maxLength={300} placeholder="Kept in the list's change log" onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Btn variant="outline" disabled={!canSave || types.length >= 30}
          onClick={() => change([...types, { key: '', label: '', licence: 'optional', hospital_or_dispensary: false, gstin_required: false, proof_required: true }])}>
          <Plus className="h-4 w-4" />Add type
        </Btn>
        <Btn onClick={() => void save()} disabled={!!off || busy} title={off ?? undefined}><Save className="h-4 w-4" />{busy ? 'Saving' : 'Save business types'}</Btn>
        <Btn variant="ghost" disabled={!dirty || busy} onClick={() => { setTypes(data.data?.types ?? []); setDirty(false); setReason(''); }}><Undo2 className="h-4 w-4" />Undo changes</Btn>
        {off && (dirty || !canSave) && <span className="text-xs text-gray-600">{off}</span>}
        {saved && <span className="text-sm text-emerald-700" role="status">Saved.</span>}
      </div>
      {error ? <ErrorNote error={error} /> : null}
    </div>
  );
};

export default B2BBusinessTypes;
