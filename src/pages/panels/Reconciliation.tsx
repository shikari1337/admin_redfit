import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { fmtMinor } from '../../lib/money';
import { payload } from '../../lib/unwrap';
import { Page, PageHeader, Btn, Card, SectionCard } from '../../components/erp';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

/** Stock ↔ ledger ↔ GL reconciliation (invariants I3/I6 + dual-write bridge). */
const Reconciliation: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [outbox, setOutbox] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const run = async () => {
    setLoading(true);
    try {
      setData(payload(await api.get('/accounting/reconciliation/stock')));
      setOutbox(payload(await api.get('/accounting/ops/outbox')));
    } finally { setLoading(false); }
  };
  useEffect(() => { run(); }, []);

  return (
    <Page>
      <PageHeader
        title="Stock Reconciliation"
        description="Detects drift; never auto-repairs. A non-zero drift is an incident, not a cleanup task."
        actions={<Btn onClick={run}>Re-run</Btn>}
      />

      {loading && <div className="text-sm text-gray-500">Running…</div>}
      {data && !loading && (
        <>
          <div className={`flex items-center gap-2 rounded-lg border p-4 font-semibold ${data.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
            {data.ok ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            {data.ok ? 'Clean — ledger, balances and legacy columns agree.' : 'DRIFT DETECTED — investigate before any further stock operations.'}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <div className="font-semibold text-gray-900">I3 — ledger vs balances</div>
              <div className="mt-1 text-2xl font-bold">{data.i3_ledger_vs_balance.driftRows}</div>
              <div className="text-sm text-gray-500">variations where Σ(ledger) ≠ on_hand</div>
              {data.i3_ledger_vs_balance.samples.map((s: any) => (
                <div key={s.variation_id} className="mt-1 font-mono text-xs text-red-700">
                  {s.variation_id.slice(0, 8)}… ledger {s.ledger} ≠ balance {s.balance}
                </div>
              ))}
            </Card>
            <Card className="p-4">
              <div className="font-semibold text-gray-900">Dual-write bridge</div>
              <div className="mt-1 text-2xl font-bold">{data.legacy_vs_balance.driftRows}</div>
              <div className="text-sm text-gray-500">variations where balance ≠ legacy stock column</div>
              {data.legacy_vs_balance.samples.map((s: any) => (
                <div key={s.variation_id} className="mt-1 font-mono text-xs text-red-700">
                  {s.sku}: balance {s.balance} ≠ legacy {s.legacy}
                </div>
              ))}
            </Card>
            <Card className="p-4">
              <div className="font-semibold text-gray-900">I6 — valuation vs GL (informational)</div>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Valued stock (WAC)</span><span className="font-mono">{fmtMinor(data.valuation.valuedStockMinor)}</span></div>
                <div className="flex justify-between"><span>GL Inventory (1200)</span><span className="font-mono">{fmtMinor(data.valuation.glInventoryPositionMinor)}</span></div>
                <div className="flex justify-between font-semibold"><span>Delta</span><span className="font-mono">{fmtMinor(data.valuation.deltaMinor)}</span></div>
                <div className="flex justify-between text-gray-500"><span>Uncosted units</span><span className="font-mono">{data.valuation.uncostedUnits}</span></div>
              </div>
            </Card>
          </div>

          {outbox && (
            <SectionCard title="Outbox (side-effect delivery queue)">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>Pending <span className="ml-1 font-mono font-semibold">{outbox.pending}</span></div>
                <div>Failed (retrying) <span className="ml-1 font-mono font-semibold">{outbox.failed}</span></div>
                <div className={outbox.dead > 0 ? 'text-red-700 font-semibold' : ''}>Dead-letter <span className="ml-1 font-mono">{outbox.dead}</span></div>
                <div>Oldest pending <span className="ml-1 font-mono">{outbox.oldest_pending_seconds != null ? `${outbox.oldest_pending_seconds}s` : '—'}</span></div>
              </div>
              {outbox.dead > 0 && (
                <p className="mt-2 text-sm text-red-700">Dead-lettered events need a human — they exhausted their retries.</p>
              )}
            </SectionCard>
          )}
        </>
      )}
    </Page>
  );
};

export default Reconciliation;
