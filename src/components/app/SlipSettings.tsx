import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Btn, Field, SectionCard, TextInput } from '@/components/erp';
import { ErrorNote, Loading, Notice, OnOff, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { getSlipSettings, putSlipSettings, type SlipsDoc } from '@/lib/v2/appSettings';

/**
 * Doctor's slips kept by the store (HMAPP-T4d section 2): how long a shopper's slip and its files are
 * kept, and whether a shopper may delete an approved one. No period is set by default: nothing is
 * purged and approved slips are kept until a person sets this (owner question 4 of design 90).
 *
 * Server: `GET/PUT /api/v2/commerce/settings/prescriptions` {retentionDays? 1 to 3650,
 * customerMayDeleteApproved?}; answers {saved, effective}. `settings.read`, save `settings.manage`.
 */
const SlipSettings: React.FC<{ canSave: boolean }> = ({ canSave }) => {
  const data = useLoad(getSlipSettings, []);
  const [days, setDays] = useState('');
  const [mayDelete, setMayDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s: SlipsDoc | null = data.data?.saved ?? null;
    setDays(s?.retentionDays != null ? String(s.retentionDays) : '');
    setMayDelete(s?.customerMayDeleteApproved === true);
  }, [data.data]);

  if (data.loading && !data.data) return <Loading label="Reading the slip settings" />;
  if (data.error) return <ErrorNote error={data.error} what="Doctor's slip settings" onRetry={() => void data.reload()} />;

  const n = days.trim() === '' ? null : Number(days);
  const daysBad = n !== null && (!Number.isInteger(n) || n < 1 || n > 3650);
  const off = whyDisabled(canSave, [daysBad && 'Keep slips 1 to 3650 days, or leave it empty.']);

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    const doc: SlipsDoc = { customerMayDeleteApproved: mayDelete };
    if (n !== null) doc.retentionDays = n;
    try { await putSlipSettings(doc); setSaved(true); await data.reload(); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <SectionCard title="Doctor's slips" description="Slips customers send from the app, only in an India store with the prescription upload switch on.">
      <div className="space-y-4">
        {!data.data?.saved && (
          <Notice tone="info">Nothing is set: slips are kept and an approved slip cannot be deleted by the customer.</Notice>
        )}
        <Field label="Delete a slip and its files after (days; empty keeps them)">
          <TextInput inputMode="numeric" value={days} disabled={!canSave} onChange={(e) => setDays(e.target.value)} className="w-32" />
        </Field>
        {daysBad && <p className="text-xs text-red-700">1 to 3650 days.</p>}
        <div className="flex items-center gap-3">
          <OnOff on={mayDelete} label="A customer may delete an approved slip" disabled={!canSave} onToggle={() => setMayDelete((v) => !v)} />
          <span className="text-sm text-gray-700">A customer may delete a slip the store already answered</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Btn onClick={() => void save()} disabled={!!off || busy} title={off ?? undefined}><Save className="h-4 w-4" />Save slip settings</Btn>
          {off && <span className="text-xs text-gray-500">{off}</span>}
          {saved && <span className="text-sm text-emerald-700" role="status">Saved.</span>}
        </div>
        {error ? <ErrorNote error={error} /> : null}
      </div>
    </SectionCard>
  );
};

export default SlipSettings;
