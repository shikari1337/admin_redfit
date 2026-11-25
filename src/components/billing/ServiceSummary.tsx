/**
 * Product services, the summary (PSVC-1): how many products carry A+ content, and one tile per kind
 * of work with the store's rate (from its proposal), what was asked, what is in progress, what was
 * delivered and what it comes to. Every figure is the server's; all before GST.
 */
import { SectionCard } from '@/components/erp';
import { fmtCurrencyMinor, fmtNumber } from '@/lib/money';
import { KINDS, type ProductServicesSummary } from '@/lib/productServices';

const money = (minor: number | null | undefined, currency?: string | null) => fmtCurrencyMinor(minor ?? 0, currency || 'INR', 'en-IN');

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-md bg-gray-50 px-2 py-1.5 text-center">
      <div className="text-base font-semibold tabular-nums text-gray-900">{fmtNumber(value)}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}

export default function ServiceSummary({ summary }: { summary: ProductServicesSummary }) {
  const { active_products: active, with_a_plus: aplus } = summary.catalogue;
  const share = active > 0 ? Math.round((aplus / active) * 100) : 0;
  const proposals = Array.from(new Set(summary.rates.map((r) => (r.proposal_ref ?? '').trim()).filter(Boolean)));

  return (
    <div className="space-y-4" data-service-summary>
      <SectionCard>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-gray-600">A+ content on your store</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums text-gray-900" data-a-plus-count>
              {fmtNumber(aplus)} <span className="text-base font-normal text-gray-600">of {fmtNumber(active)} products</span>
            </div>
          </div>
          {active > 0 && <div className="text-sm text-gray-500">{share}% of your active products</div>}
        </div>
        {active > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, share)}%` }} />
          </div>
        )}
        {proposals.length > 0 && (
          <p className="mt-3 text-sm text-gray-600" data-proposal-ref>
            Your rates come from {proposals.length === 1 ? 'the proposal' : 'the proposals'} {proposals.join(', ')}.
          </p>
        )}
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {KINDS.map((k) => {
          const rate = summary.rates.find((r) => r.kind === k.value);
          const t = summary.totals.find((x) => x.kind === k.value);
          const currency = rate?.currency || 'INR';
          const priced = rate?.rate_minor != null;
          const showList = rate?.list_rate_minor != null && rate.list_rate_minor !== rate.rate_minor;
          return (
            <div key={k.value} className="flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-service-tile={k.value}>
              <div className="font-semibold text-gray-900">{k.label}</div>
              {k.detail && <div className="text-xs text-gray-500">{k.detail}</div>}
              <div className="mt-2">
                {priced ? (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-semibold tabular-nums text-gray-900">{money(rate!.rate_minor, currency)}</span>
                    <span className="text-xs text-gray-500">a product</span>
                    {showList && <s className="text-sm tabular-nums text-gray-400" title="List rate">{money(rate!.list_rate_minor, currency)}</s>}
                  </div>
                ) : (
                  <div className="text-sm font-medium text-gray-700">Price to be agreed</div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Count label="Asked" value={t?.requested ?? 0} />
                <Count label="In progress" value={t?.in_progress ?? 0} />
                <Count label="Delivered" value={t?.delivered ?? 0} />
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-600">Open work</dt>
                  <dd className="tabular-nums text-gray-900">{money(t?.open_value_minor, currency)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-600">Delivered work</dt>
                  <dd className="font-medium tabular-nums text-gray-900">{money(t?.delivered_value_minor, currency)}</dd>
                </div>
              </dl>
              {(t?.unpriced ?? 0) > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  {fmtNumber(t!.unpriced)} {t!.unpriced === 1 ? 'product has' : 'products have'} no price yet; Growcord prices it at your rate when it is delivered.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">All amounts are before GST. GST is added on the invoice.</p>
    </div>
  );
}
