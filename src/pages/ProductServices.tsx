/**
 * Settings, Billing, Product services (PSVC-1, owner 25 Nov 2026: "product cost according to proposal,
 * what we give in proposal, so its easy for us and them to see how many products have a+ content, on
 * what they want custom made image, or ai images or ai content or human content").
 *
 * billing.read sees everything; billing.manage (the store's admin) also asks and cancels. The summary
 * is read when the page opens; the products and the requests only when they scroll into view. After
 * the person's own ask or cancel, and when they come back to this browser tab (at most every 30
 * seconds), the figures are read again; never on a timer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, PackageCheck } from 'lucide-react';
import { BlockSkeleton, Page, PageHeader } from '@/components/erp';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI, errorText } from '@/services/api';
import { useRefetchOnReturn } from '@/lib/pageActive';
import { asSummary, type ProductServicesSummary } from '@/lib/productServices';
import ServiceSummary from '@/components/billing/ServiceSummary';
import ServiceProducts from '@/components/billing/ServiceProducts';
import ServiceRequests from '@/components/billing/ServiceRequests';

export default function ProductServices() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('billing.manage');
  const [summary, setSummary] = useState<ProductServicesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const ask = useRef(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const n = (ask.current += 1);
    billingAPI.getProductServices()
      .then((d) => {
        if (n !== ask.current) return;
        const s = asSummary(d);
        if (!s) throw new Error('The product services could not be read.');
        setSummary(s);
        setError(null);
      })
      .catch((e) => { if (n === ask.current) setError(errorText(e, 'The product services could not be loaded.')); });
  }, [version]);

  useRefetchOnReturn(refresh);

  return (
    <Page>
      <Link to="/settings/billing" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="size-4" /> Billing
      </Link>
      <PageHeader
        icon={PackageCheck}
        title="Product services"
        description="Work Growcord does on your products, such as A+ content, pictures and written content, at the rates in your proposal. Prices are before GST; GST is added on the invoice."
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
      {summary ? <ServiceSummary summary={summary} /> : !error && (
        <div className="rounded-xl border border-gray-200 bg-white p-5"><BlockSkeleton lines={4} /></div>
      )}

      <ServiceProducts summary={summary} canManage={canManage} version={version} onAsked={refresh} />
      <ServiceRequests canManage={canManage} version={version} onChanged={refresh} />
    </Page>
  );
}
