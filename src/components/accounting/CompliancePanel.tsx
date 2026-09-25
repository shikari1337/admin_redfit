import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, ShieldCheck } from 'lucide-react';
import { invoicesAPI } from '@/services/api';
import InfoTip from '@/components/common/InfoTip';
import { SectionCard, Chip } from '@/components/erp';

/**
 * WHAT YOU TRADE UNDER — the licences and registrations printed on every
 * document, with the ones about to stop being valid called out first.
 *
 * Whether a licence has expired is a question about the STORE's calendar, not
 * the viewer's browser, so the countdown (`days_left`) is the SERVER's — this
 * component only decides the colour (CLAUDE.md rule 8, WS-G G.5.9). Anything
 * the server did not flag is shown with its plain expiry date and no colour,
 * because a green badge on a licence nobody checked is worse than no badge.
 */

const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? '';

const CompliancePanel: React.FC = () => {
  const [cfg, setCfg] = useState<any>(null);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [types, setTypes] = useState<Array<{ value: string; label: string }>>([]);
  /** The store's own warning window (Settings 4.4) — the SAME number the server flagged with. */
  const [warnDays, setWarnDays] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res: any = await invoicesAPI.getConfig();
        const d = res?.data ?? res;
        if (!alive) return;
        setCfg(d?.config ?? null);
        setExpiring(d?.expiring_licences ?? []);
        setTypes(d?.licence_types ?? []);
        setWarnDays(typeof d?.licence_warning_days === 'number' ? d.licence_warning_days : null);
      } catch (e: any) { if (alive) setErr(errText(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || err) return null;

  const seller = cfg?.seller ?? {};
  const licences: any[] = seller.licences ?? [];
  const labelFor = (t: string) => types.find((x) => x.value === t)?.label ?? 'Licence';
  const warnFor = (l: any) => expiring.find((x) => x.number && x.number === l.number);
  const expired = expiring.filter((l) => l.days_left < 0);

  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-gray-500" />
          What you trade under
          <InfoTip
            text={`The registrations and licences printed on every invoice, proforma and credit note you issue.${warnDays ? ` A licence turns amber ${warnDays} days before it expires.` : ''}`}
            where="Edit them, and the warning window, under Settings ▸ Invoice settings."
          />
        </span>
      }
      action={<Link to="/settings/invoice" className="text-sm font-medium text-gray-900 hover:underline">Edit →</Link>}
    >
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span><span className="text-gray-500">GSTIN </span><span className="font-mono">{seller.gstin || <em className="not-italic text-amber-700">not set</em>}</span></span>
        <span><span className="text-gray-500">PAN </span><span className="font-mono">{seller.pan || <em className="not-italic text-gray-400">—</em>}</span></span>
        <span>
          <span className="text-gray-500">CIN </span>
          <span className="font-mono">{seller.cin || <em className="not-italic text-gray-400">—</em>}</span>
          {!seller.cin && <InfoTip className="ml-1" text="Only a company or an LLP has one. A proprietorship or partnership leaves it blank and nothing prints." />}
        </span>
      </div>

      {expired.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {expired.length === 1 ? 'A licence printed on your invoices has expired' : `${expired.length} licences printed on your invoices have expired`}.
            Renew and update the date, or switch it off until you do.
          </span>
        </div>
      )}

      <div className="mt-3 divide-y divide-gray-100">
        {licences.length === 0 && (
          <p className="py-3 text-sm text-gray-500">
            No licences recorded, so nothing extra prints on your documents.{' '}
            <Link to="/settings/invoice" className="underline">Add your drug licence, FSSAI and any other registration.</Link>
          </p>
        )}
        {licences.map((l: any) => {
          const w = warnFor(l);
          return (
            <div key={l.id ?? l.number} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-[10rem] font-medium text-gray-900">{l.label || labelFor(l.type)}</span>
              <span className="font-mono text-xs text-gray-600">{l.number}</span>
              {l.jurisdiction && <span className="text-xs text-gray-500">{l.jurisdiction}</span>}
              {w && w.days_left < 0 && <Chip tone="red">expired {-w.days_left} day(s) ago</Chip>}
              {w && w.days_left >= 0 && <Chip tone="amber">{w.days_left === 0 ? 'expires today' : `${w.days_left} day(s) left`}</Chip>}
              {!w && l.valid_till && <span className="text-xs text-gray-500">valid to {l.valid_till}</span>}
              {!l.valid_till && <span className="text-xs text-gray-400">no expiry</span>}
              {l.show_on_documents === false
                ? <span className="ml-auto text-xs text-gray-400">kept on file only</span>
                : <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500"><BadgeCheck className="h-3.5 w-3.5" /> printed</span>}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

export default CompliancePanel;
