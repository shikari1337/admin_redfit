import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Save } from 'lucide-react';
import {
  Btn, EmptyRow, Field, MoneyInput, RateInput, SectionCard, TableShell, TBody, Td, Th, THead, TextInput, Tr, rateText,
} from '@/components/erp';
import { CatalogItemPicker } from '@/components/common/CatalogItemPicker';
import { ConfirmDialog, ErrorNote, Loading, Notice, ReasonDialog, whyDisabled, type Loaded } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { todayIso } from '@/utils/date';
import { minorToMajor, type Money } from '@/lib/v2/money';
import {
  PARTNER_PERMS, putTerms, type KindDoc, type PartnerTermsView, type RateRule, type TermsDoc, type TermsVersion,
} from '@/lib/v2/partners';
import { day, shortId, ValueRows, when } from './common';

/**
 * AD02 Store partner terms (HMAPP design 60): the store's own terms inside the platform's limits.
 * Each field may be left to the platform's default (left out of the document). A save is a NEW
 * VERSION from its first day (today or later), with a reason; commissions keep the version in
 * force on their order's day, so a change never reprices a past order.
 *
 * Server: `GET/PUT /api/v2/retain/partners/terms` (read `marketing.read`, save `settings.manage`);
 * a document outside the limits is refused `retain.terms_invalid` with `details.problems`.
 */

type Draft = {
  commission_milli: number | null;
  hold_days: string;
  attribution_days: string;
  min_payout: number | null;
  payout_day: string;
  ad_label: string;
  share_rules: string;
  kinds: Record<string, string>;
  category_rates: RateRule[];
  brand_rates: RateRule[];
};
type FieldKey = 'commission_milli' | 'hold_days' | 'attribution_days' | 'min_payout' | 'payout_day' | 'ad_label' | 'share_rules' | 'eligible_kinds' | 'category_rates' | 'brand_rates';

const FIELDS: FieldKey[] = ['commission_milli', 'hold_days', 'attribution_days', 'min_payout', 'payout_day', 'eligible_kinds', 'ad_label', 'share_rules', 'category_rates', 'brand_rates'];

function draftOf(t: TermsDoc | null | undefined): { draft: Draft; own: Set<FieldKey> } {
  const own = new Set<FieldKey>();
  for (const f of FIELDS) if (t && t[f] !== undefined && t[f] !== null) own.add(f);
  const kinds: Record<string, string> = {};
  for (const k of t?.eligible_kinds ?? []) kinds[k.code] = k.label;
  return {
    own,
    draft: {
      commission_milli: t?.commission_milli ?? null,
      hold_days: t?.hold_days != null ? String(t.hold_days) : '',
      attribution_days: t?.attribution_days != null ? String(t.attribution_days) : '',
      min_payout: t?.min_payout ? Number(t.min_payout.minor) : null,
      payout_day: t?.payout_day != null ? String(t.payout_day) : '',
      ad_label: t?.ad_label ?? '',
      share_rules: t?.share_rules ?? '',
      kinds,
      category_rates: t?.category_rates ?? [],
      brand_rates: t?.brand_rates ?? [],
    },
  };
}

const int = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

const moneyText = (m: Money | null | undefined) => {
  if (!m) return 'not set';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: m.currency }).format(minorToMajor(m.minor, m.currency));
  } catch { return `${minorToMajor(m.minor, m.currency)} ${m.currency}`; }
};

const PartnerTerms: React.FC<{ terms: Loaded<PartnerTermsView> }> = ({ terms }) => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm(PARTNER_PERMS.terms);
  const t = terms.data;
  const [{ draft, own }, setForm] = useState(() => draftOf(null));
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<TermsVersion | null>(null);

  useEffect(() => { if (t) setForm(draftOf(t.in_force?.terms)); }, [t]);

  const limits = t?.platform_limits ?? null;
  const defaults = t?.platform_defaults ?? null;
  const currency = t?.effective?.min_payout?.currency ?? limits?.min_payout_floor?.currency ?? defaults?.min_payout?.currency ?? 'INR';
  const allowedKinds = limits?.allowed_kinds ?? [];

  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, draft: { ...f.draft, ...patch } }));
  const toggleOwn = (k: FieldKey, on: boolean) => setForm((f) => {
    const next = new Set(f.own);
    if (on) next.add(k); else next.delete(k);
    return { ...f, own: next };
  });

  /** The document to save: only the fields the store sets itself. */
  const doc = useMemo((): { doc: TermsDoc; local: string[] } => {
    const d: TermsDoc = {};
    const local: string[] = [];
    if (own.has('commission_milli')) {
      if (draft.commission_milli === null) local.push('Overall rate: type a percent, or use the platform default.');
      else d.commission_milli = draft.commission_milli;
    }
    const nums: Array<['hold_days' | 'attribution_days' | 'payout_day', string]> = [
      ['hold_days', 'Hold days'], ['attribution_days', 'Link counts for'], ['payout_day', 'Payout day'],
    ];
    for (const [k, words] of nums) {
      if (!own.has(k)) continue;
      const n = int(draft[k]);
      if (n === null) local.push(`${words}: a whole number.`); else d[k] = n;
    }
    if (own.has('min_payout')) {
      if (draft.min_payout === null) local.push('Minimum payout: type an amount, or use the platform default.');
      else d.min_payout = { minor: draft.min_payout, currency };
    }
    if (own.has('eligible_kinds')) {
      const kinds: KindDoc[] = Object.entries(draft.kinds).map(([code, label]) => ({ code, label: label.trim() }));
      if (kinds.length === 0) local.push('Who can join: pick at least one kind.');
      if (kinds.some((k) => !k.label)) local.push('Who can join: each kind needs the words the app shows.');
      d.eligible_kinds = kinds;
    }
    if (own.has('ad_label')) d.ad_label = draft.ad_label.trim();
    if (own.has('share_rules')) d.share_rules = draft.share_rules.trim();
    if (own.has('category_rates')) d.category_rates = draft.category_rates;
    if (own.has('brand_rates')) d.brand_rates = draft.brand_rates;
    return { doc: d, local };
  }, [draft, own, currency]);

  if (terms.loading && !t) return <Loading label="Reading the partner terms" />;
  if (terms.error) return <ErrorNote error={terms.error} what="The partner terms" onRetry={() => void terms.reload()} />;
  if (!t) return null;

  const off = whyDisabled(canSave, [
    !limits && 'Growcord has not set the platform limits yet.',
    doc.local[0],
    effectiveFrom < todayIso() && 'The first day is today or later.',
  ]);

  const save = async (reason: string) => {
    setBusy(true); setError(null);
    try {
      const res = await putTerms({ terms: doc.doc, effective_from: effectiveFrom || null, reason });
      setAsking(false);
      setSavedId(res?.in_force?.id ?? res?.versions?.[0]?.id ?? null);
      await terms.reload();
    } catch (e) {
      setError(e);
    } finally { setBusy(false); }
  };

  const fieldHead = (k: FieldKey, label: string, platform: React.ReactNode, limit?: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <label className="inline-flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={!own.has(k)} disabled={!canSave} onChange={(e) => toggleOwn(k, !e.target.checked)} />
        Use the platform default ({platform})
      </label>
      {limit ? <span className="w-full text-xs text-gray-500">{limit}</span> : null}
    </div>
  );

  const rateRows = (k: 'category_rates' | 'brand_rates', kind: 'category' | 'brand', label: string) => {
    const rules = draft[k];
    const ids = rules.map((r) => r.id);
    const rateOf = new Map(rules.map((r) => [r.id, r.rate_milli]));
    return (
      <div className="space-y-2 border-t border-gray-100 pt-4">
        {fieldHead(k, label, `${(defaults?.[k] ?? []).length} rules`, limits?.max_commission_milli != null ? `Each rate at most ${rateText(limits.max_commission_milli)}. A rate of 0 leaves that ${kind} out.` : undefined)}
        {own.has(k) && (
          <CatalogItemPicker
            kind={kind}
            value={ids}
            ordered={false}
            max={500}
            disabled={!canSave}
            onChange={(next) => set({ [k]: next.map((id) => ({ id, rate_milli: rateOf.get(id) ?? 0 })) } as Partial<Draft>)}
            renderExtra={(id) => (
              <RateInput
                value={rateOf.get(id) ?? 0}
                max={limits?.max_commission_milli ?? null}
                disabled={!canSave}
                aria-label={`Rate for this ${kind}`}
                onChange={(milli) => set({ [k]: rules.map((r) => (r.id === id ? { ...r, rate_milli: milli ?? 0 } : r)) } as Partial<Draft>)}
              />
            )}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {t.problems.length > 0 && (
        <Notice tone="warn" title="The terms in force break the platform's limits">
          <ul className="list-disc space-y-0.5 pl-5">{t.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </Notice>
      )}

      <SectionCard
        title="The store's terms"
        description={t.in_force ? `Version ${t.in_force.version}, in force since ${day(t.in_force.effective_from)}.` : 'No store terms saved yet: the programme stays off until they are.'}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            {fieldHead('commission_milli', 'Overall rate', rateText(defaults?.commission_milli) || 'not set',
              limits?.max_commission_milli != null ? `The platform allows at most ${rateText(limits.max_commission_milli)}.` : 'The platform has not set a highest rate.')}
            {own.has('commission_milli') && (
              <RateInput value={draft.commission_milli} max={limits?.max_commission_milli ?? null} disabled={!canSave}
                aria-label="Overall rate" onChange={(milli) => set({ commission_milli: milli })} />
            )}
          </div>

          <div className="grid gap-5 border-t border-gray-100 pt-4 md:grid-cols-3">
            <div className="space-y-2">
              {fieldHead('hold_days', 'Hold days after delivery', String(defaults?.hold_days ?? 'not set'),
                limits?.min_hold_days != null ? `At least ${limits.min_hold_days} days. The order's return window still has to close.` : 'The order\'s return window still has to close.')}
              {own.has('hold_days') && (
                <TextInput inputMode="numeric" value={draft.hold_days} disabled={!canSave} aria-label="Hold days"
                  onChange={(e) => set({ hold_days: e.target.value })} className="w-28" />
              )}
            </div>
            <div className="space-y-2">
              {fieldHead('attribution_days', 'A link click counts for', `${defaults?.attribution_days ?? 'not set'} days`,
                limits?.max_attribution_days != null ? `At most ${limits.max_attribution_days} days.` : undefined)}
              {own.has('attribution_days') && (
                <TextInput inputMode="numeric" value={draft.attribution_days} disabled={!canSave} aria-label="Days a link click counts"
                  onChange={(e) => set({ attribution_days: e.target.value })} className="w-28" />
              )}
            </div>
            <div className="space-y-2">
              {fieldHead('payout_day', 'Payout day of the month', String(defaults?.payout_day ?? 'not set'), 'Day 1 to 28.')}
              {own.has('payout_day') && (
                <TextInput inputMode="numeric" value={draft.payout_day} disabled={!canSave} aria-label="Payout day"
                  onChange={(e) => set({ payout_day: e.target.value })} className="w-28" />
              )}
            </div>
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-4">
            {fieldHead('min_payout', 'Minimum payout', moneyText(defaults?.min_payout),
              limits?.min_payout_floor ? `At least ${moneyText(limits.min_payout_floor)}.` : undefined)}
            {own.has('min_payout') && (
              <MoneyInput value={draft.min_payout} currency={currency} disabled={!canSave} aria-label="Minimum payout"
                min={limits?.min_payout_floor ? Number(limits.min_payout_floor.minor) : null}
                onChange={(minor) => set({ min_payout: minor })} />
            )}
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-4">
            {fieldHead('eligible_kinds', 'Who can join', (defaults?.eligible_kinds ?? []).map((k) => k.label).join(', ') || 'not set',
              'Only the kinds the platform allows. Doctors and store staff can never be partners.')}
            {own.has('eligible_kinds') && (
              allowedKinds.length === 0 ? (
                <Notice tone="warn">The platform has not listed the kinds a store may admit.</Notice>
              ) : (
                <div className="space-y-2">
                  {allowedKinds.map((code) => {
                    const on = code in draft.kinds;
                    return (
                      <div key={code} className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex w-40 items-center gap-2 text-sm">
                          <input type="checkbox" checked={on} disabled={!canSave} onChange={(e) => {
                            const kinds = { ...draft.kinds };
                            if (e.target.checked) kinds[code] = (defaults?.eligible_kinds ?? []).find((k) => k.code === code)?.label ?? '';
                            else delete kinds[code];
                            set({ kinds });
                          }} />
                          <span className="font-mono text-xs">{code}</span>
                        </label>
                        {on && (
                          <TextInput value={draft.kinds[code]} maxLength={80} disabled={!canSave} aria-label={`Words the app shows for ${code}`}
                            placeholder="Words the app shows" onChange={(e) => set({ kinds: { ...draft.kinds, [code]: e.target.value } })} className="min-w-[16rem] flex-1" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          <div className="grid gap-5 border-t border-gray-100 pt-4 md:grid-cols-[16rem_1fr]">
            <div className="space-y-2">
              {fieldHead('ad_label', 'Ad label on every share', defaults?.ad_label ?? 'not set', '1 to 40 characters, shown on every share.')}
              {own.has('ad_label') && (
                <TextInput value={draft.ad_label} maxLength={40} disabled={!canSave} aria-label="Ad label" onChange={(e) => set({ ad_label: e.target.value })} />
              )}
            </div>
            <div className="space-y-2">
              {fieldHead('share_rules', 'Share rules partners read', defaults?.share_rules ? 'set' : 'not set', 'Up to 2000 characters. Never claim a cure.')}
              {own.has('share_rules') && (
                <textarea value={draft.share_rules} maxLength={2000} rows={4} disabled={!canSave} aria-label="Share rules"
                  onChange={(e) => set({ share_rules: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 p-2 text-sm" />
              )}
            </div>
          </div>

          {rateRows('category_rates', 'category', 'Rates for some categories')}
          {rateRows('brand_rates', 'brand', 'Rates for some brands')}

          <div className="flex flex-wrap items-end gap-4 border-t border-gray-100 pt-4">
            <Field label="First day these terms apply">
              <TextInput type="date" value={effectiveFrom} min={todayIso()} disabled={!canSave} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </Field>
            <Btn onClick={() => { setError(null); setAsking(true); }} disabled={!!off} title={off ?? undefined}>
              <Save className="h-4 w-4" />Save as a new version
            </Btn>
            {off && <span className="text-xs text-gray-500">{off}</span>}
          </div>
          {doc.local.length > 1 && (
            <Notice tone="warn"><ul className="list-disc pl-5">{doc.local.map((p, i) => <li key={i}>{p}</li>)}</ul></Notice>
          )}
          {error && !asking ? <ErrorNote error={error} /> : null}
          <p className="text-xs text-gray-500">
            A new version starts on its first day. Each commission keeps the version in force on its order's day, so no past order is repriced.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Versions" description="The last 20 versions, newest first." flush>
        <TableShell className="rounded-none border-0 shadow-none">
          <table className="w-full text-sm">
            <THead><Th>Version</Th><Th>First day</Th><Th>Reason</Th><Th>By</Th><Th>Saved</Th><Th><span className="sr-only">Open</span></Th></THead>
            <TBody>
              {t.versions.length === 0 && <EmptyRow colSpan={6}>No version saved yet.</EmptyRow>}
              {t.versions.map((v) => (
                <Tr key={v.id} className={v.id === savedId ? 'bg-emerald-50' : undefined}>
                  <Td className="tabular-nums">
                    {v.version}{t.in_force?.id === v.id ? <span className="ml-2 text-xs text-emerald-700">in force</span> : null}
                  </Td>
                  <Td>{day(v.effective_from)}</Td>
                  <Td className="max-w-md break-words">{v.reason}</Td>
                  <Td title={v.created_by ?? undefined} className="font-mono text-xs">{shortId(v.created_by)}</Td>
                  <Td muted>{when(v.created_at)}</Td>
                  <Td><Btn variant="ghost" size="sm" onClick={() => setViewing(v)} aria-label={`Open version ${v.version}`}><Eye className="h-4 w-4" />Open</Btn></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>

      <ReasonDialog
        open={asking}
        title="Save the partner terms"
        confirmLabel="Save version"
        busy={busy}
        error={error}
        onClose={() => setAsking(false)}
        onConfirm={(reason) => void save(reason)}
      >
        <p>From {day(effectiveFrom)}, new orders earn under these terms. Orders before keep the terms of their day.</p>
      </ReasonDialog>

      <ConfirmDialog open={!!viewing} title={viewing ? `Version ${viewing.version}` : ''} confirmLabel="Close"
        onClose={() => setViewing(null)} onConfirm={() => setViewing(null)}>
        {viewing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-500">This version</div>
              <ValueRows value={viewing.terms} empty="Every field from the platform default." />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-500">In force now</div>
              <ValueRows value={t.in_force?.terms ?? null} empty="No store terms in force." />
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
};

export default PartnerTerms;
