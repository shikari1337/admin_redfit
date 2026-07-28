import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import { Page, PageHeader } from '../../components/erp';

/** Accounting configuration: GL auto-posting flag + document-series counters + statutory registry. */
const AccountingSettings: React.FC = () => {
  const { hasPerm } = useAuth();
  const [glAutoPosting, setGl] = useState(false);
  const [series, setSeries] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const canPost = hasPerm('accounting.post');

  useEffect(() => {
    api.get('/accounting/config').then((r) => setGl(payload<any>(r)?.glAutoPosting === true)).catch(() => {});
    api.get('/accounting/series').then((r) => setSeries(payload(r) ?? [])).catch(() => {});
    api.get('/accounting/statutory-rules').then((r) => setRules(payload(r) ?? [])).catch(() => {});
  }, []);

  const toggle = async () => {
    setSaving(true);
    try {
      const next = !glAutoPosting;
      await api.put('/accounting/config', { glAutoPosting: next });
      setGl(next);
    } finally { setSaving(false); }
  };

  return (
    <Page>
      <PageHeader
        title="Accounting Settings"
        description="Configuration, series counters and the statutory rules this store runs on."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-900">GL auto-posting</div>
            <div className="text-sm text-gray-500">
              Posts sale, COGS, GRN and bill journals automatically. Keep OFF until the account
              mapping has been reviewed by your CA — books are immutable once posted.
            </div>
          </div>
          <button onClick={toggle} disabled={!canPost || saving}
            className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${glAutoPosting ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            {glAutoPosting ? 'ON — posting to books' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">Document series (gapless, per financial year)</div>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <tr><th className="px-4 py-2">Type</th><th className="px-4 py-2">Series</th><th className="px-4 py-2">FY</th>
                <th className="px-4 py-2">Prefix</th><th className="px-4 py-2 text-right">Next number</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {series.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500">No series allocated yet — the first document of each type creates its own.</td></tr>}
            {series.map((s: any) => (
              <tr key={`${s.doc_type}-${s.series_code}-${s.fy}`}>
                <td className="px-4 py-1.5 capitalize">{String(s.doc_type).replace('_', ' ')}</td>
                <td className="px-4 py-1.5 font-mono">{s.series_code}</td>
                <td className="px-4 py-1.5 font-mono">{s.fy}</td>
                <td className="px-4 py-1.5 font-mono">{s.prefix}</td>
                <td className="px-4 py-1.5 text-right font-mono">{s.next_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">
          Statutory rules registry <span className="ml-2 text-xs font-normal text-gray-500">every tax value is dated + cited; nothing hardcoded</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr><th className="px-4 py-2">Rule</th><th className="px-4 py-2">Value</th><th className="px-4 py-2">Effective</th>
                  <th className="px-4 py-2">Source</th><th className="px-4 py-2">Verified</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((r: any, i: number) => (
                <tr key={i} className={r.effective_to ? 'text-gray-400' : ''}>
                  <td className="px-4 py-1.5 font-mono text-xs">{r.rule_code}</td>
                  <td className="px-4 py-1.5 font-mono text-xs max-w-[260px] truncate" title={JSON.stringify(r.value_json)}>{JSON.stringify(r.value_json)}</td>
                  <td className="px-4 py-1.5 whitespace-nowrap">{r.effective_from} → {r.effective_to ?? 'open'}</td>
                  <td className="px-4 py-1.5 max-w-[280px] truncate" title={r.source_reference}>{r.source_reference}</td>
                  <td className="px-4 py-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.verification_state === 'T1' ? 'bg-emerald-100 text-emerald-800' : r.verification_state === 'T2' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                      {r.verification_state}{r.verified_by ? ' · CA' : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  );
};

export default AccountingSettings;
