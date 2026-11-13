import React, { useEffect, useMemo, useState } from 'react';
import { Plus, ReceiptText, Save, Trash2, Undo2 } from 'lucide-react';
import { Btn, Field, Page, PageHeader, SectionCard, SelectInput, TextInput } from '@/components/erp';
import { ErrorNote, Loading, Notice, OnOff, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { codeLabel, getCustomerOrders, putCustomerOrders, type CancelReason, type CustomerOrdersDoc } from '@/lib/v2/appSettings';

/**
 * CUSTOMER ORDERS (HMAPP-T4c section 3; design 40 OR03, 90 "NEW shopper orders"): until when a
 * customer may ask to cancel, the reasons they pick from, and the words the app shows for each order
 * status and step. Store data, setting `customerOrders`; the server answers what it holds and what
 * customers read now (`saved`, `effective`).
 *
 * The statuses and steps listed are the ones the server answers in `effective` (every status, every
 * step), never a list kept here. The window choices are the server's codes (it answers no list of
 * them yet); the words beside each say what the code means in the server's rule
 * (`customer_progress::cancel_verdict`).
 *
 * Server: `GET/PUT /api/v2/commerce/settings/customer-orders` (`settings.read`, save
 * `settings.manage` and a person). Not on the live server until the app routes are on.
 */

/** The window codes `cancelUntil` takes, with what each means. */
const WINDOWS: Array<{ code: string; words: string }> = [
  { code: 'off', words: 'Customers cannot ask to cancel' },
  { code: 'confirmed', words: 'Until the store confirms the order' },
  { code: 'packing', words: 'Until the store starts packing it' },
  { code: 'booked', words: 'Until a parcel is booked with a courier' },
  { code: 'picked_up', words: 'Until the courier picks a parcel up' },
];

const CODE = /^[a-z0-9_]{1,40}$/;

const CustomerOrdersSettings: React.FC = () => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm('settings.manage');
  const data = useLoad(getCustomerOrders, []);
  const [doc, setDoc] = useState<CustomerOrdersDoc>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const effective = data.data?.effective ?? {};
  useEffect(() => { if (data.data) { setDoc(data.data.saved ?? {}); setDirty(false); } }, [data.data]);

  const change = (patch: Partial<CustomerOrdersDoc>) => { setDoc((d) => ({ ...d, ...patch })); setDirty(true); setSaved(false); };
  const statuses = useMemo(() => Object.keys(effective.statusWords ?? {}), [effective.statusWords]);
  const steps = useMemo(() => Object.keys(effective.stepWords ?? {}), [effective.stepWords]);
  const reasons: CancelReason[] = doc.cancelReasons ?? [];

  const setWords = (key: 'statusWords' | 'stepWords', code: string, words: string) => {
    const next = { ...(doc[key] ?? {}) };
    if (words.trim()) next[code] = words; else delete next[code];
    change({ [key]: Object.keys(next).length ? next : undefined });
  };

  const badReason = reasons.find((r) => !CODE.test(r.code) || !r.words.trim());
  const off = whyDisabled(canSave, [
    !dirty && 'Nothing has changed.',
    badReason && 'Each reason needs a code (lower case letters, digits and _) and words.',
    reasons.length > 12 && 'At most 12 reasons.',
  ]);

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    const clean: CustomerOrdersDoc = {};
    if (doc.cancelUntil) clean.cancelUntil = doc.cancelUntil;
    if (doc.cancelOnWebsite !== undefined) clean.cancelOnWebsite = doc.cancelOnWebsite;
    if (doc.cancelReasons && doc.cancelReasons.length) clean.cancelReasons = doc.cancelReasons.map((r) => ({ code: r.code.trim(), words: r.words.trim() }));
    for (const k of ['statusWords', 'stepWords'] as const) {
      const m = Object.fromEntries(Object.entries(doc[k] ?? {}).map(([c, w]) => [c, w.trim()]).filter(([, w]) => w));
      if (Object.keys(m).length) clean[k] = m;
    }
    try { await putCustomerOrders(clean); setSaved(true); await data.reload(); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Page width="narrow">
      <PageHeader icon={ReceiptText} title="Customer orders"
        description="Until when a customer may ask to cancel, the reasons they pick, and the words the app shows for each order status and step." />
      {data.loading && !data.data ? <Loading label="Reading the order words" /> : data.error ? (
        <ErrorNote error={data.error} what="The customer order settings" onRetry={() => void data.reload()} />
      ) : (
        <>
          {!data.data?.saved && <Notice tone="info">Nothing saved: customers see the defaults shown in grey.</Notice>}

          <SectionCard title="Asking to cancel" description="Outside the window the app refuses with the reason. Orders already shipped or finished can never be cancelled by the customer.">
            <div className="space-y-4">
              <Field label="Customers may ask to cancel">
                <SelectInput value={doc.cancelUntil ?? ''} disabled={!canSave} onChange={(e) => change({ cancelUntil: e.target.value || undefined })}>
                  <option value="">Default ({(WINDOWS.find((w) => w.code === effective.cancelUntil)?.words ?? codeLabel(effective.cancelUntil)).toLowerCase()})</option>
                  {WINDOWS.map((w) => <option key={w.code} value={w.code}>{w.words}</option>)}
                </SelectInput>
              </Field>
              <div className="flex items-center gap-3">
                <OnOff on={(doc.cancelOnWebsite ?? effective.cancelOnWebsite) === true} label="The window binds the website too" disabled={!canSave}
                  onToggle={() => change({ cancelOnWebsite: !((doc.cancelOnWebsite ?? effective.cancelOnWebsite) === true) })} />
                <span className="text-sm text-gray-700">The same window binds cancels asked on the website</span>
              </div>
              <p className="text-xs text-gray-500">Off: only the apps are held to the window; the website keeps its own rule.</p>
            </div>
          </SectionCard>

          <SectionCard
            title="Reasons to pick"
            description="Shown when a customer cancels. Empty: the defaults below."
            action={<Btn size="sm" variant="outline" disabled={!canSave || reasons.length >= 12} onClick={() => change({ cancelReasons: [...reasons, { code: '', words: '' }] })}><Plus className="h-4 w-4" />Add reason</Btn>}
          >
            {reasons.length === 0 ? (
              <ul className="list-disc pl-5 text-sm text-gray-500">{(effective.cancelReasons ?? []).map((r) => <li key={r.code}>{r.words}</li>)}</ul>
            ) : (
              <div className="space-y-2">
                {reasons.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-3">
                    <Field label="Code">
                      <TextInput value={r.code} maxLength={40} disabled={!canSave} className="w-44 font-mono text-xs"
                        onChange={(e) => change({ cancelReasons: reasons.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)) })} />
                    </Field>
                    <Field label="Words the customer reads" className="min-w-[14rem] flex-1">
                      <TextInput value={r.words} maxLength={80} disabled={!canSave}
                        onChange={(e) => change({ cancelReasons: reasons.map((x, j) => (j === i ? { ...x, words: e.target.value } : x)) })} />
                    </Field>
                    <button type="button" disabled={!canSave} onClick={() => change({ cancelReasons: reasons.filter((_, j) => j !== i) })}
                      className="mb-1 rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-30" aria-label="Remove reason">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Words for each step" description="The steps of an order's progress in the app, in order.">
            <div className="grid gap-3 sm:grid-cols-2">
              {steps.map((s) => (
                <Field key={s} label={codeLabel(s)}>
                  <TextInput value={doc.stepWords?.[s] ?? ''} maxLength={40} disabled={!canSave} placeholder={effective.stepWords?.[s]}
                    onChange={(e) => setWords('stepWords', s, e.target.value)} />
                </Field>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Words for each order status" description="What the app says an order is doing. Empty: the words the store's messages use.">
            <div className="grid gap-3 sm:grid-cols-2">
              {statuses.map((s) => (
                <Field key={s} label={codeLabel(s)}>
                  <TextInput value={doc.statusWords?.[s] ?? ''} maxLength={40} disabled={!canSave} placeholder={effective.statusWords?.[s]}
                    onChange={(e) => setWords('statusWords', s, e.target.value)} />
                </Field>
              ))}
            </div>
          </SectionCard>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white/95 py-3 backdrop-blur">
            <Btn onClick={() => void save()} disabled={!!off || busy} title={off ?? undefined}><Save className="h-4 w-4" />{busy ? 'Saving' : 'Save'}</Btn>
            <Btn variant="ghost" disabled={!dirty || busy} onClick={() => { setDoc(data.data?.saved ?? {}); setDirty(false); }}><Undo2 className="h-4 w-4" />Undo changes</Btn>
            {off && dirty && <span className="text-xs text-amber-700">{off}</span>}
            {saved && <span className="text-sm text-emerald-700" role="status">Saved.</span>}
          </div>
          {error ? <ErrorNote error={error} /> : null}
        </>
      )}
    </Page>
  );
};

export default CustomerOrdersSettings;
