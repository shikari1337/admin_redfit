import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { Page, PageHeader } from '../../components/erp';
import { ShieldAlert, ShieldCheck, Info } from 'lucide-react';

const badge: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  warning: 'bg-amber-100 text-amber-800 border-amber-300',
  info: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const RateCheck: React.FC = () => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get('/accounting/gst/rate-check').then((r) => setData(payload(r))).catch(() => {});
  }, []);

  return (
    <Page>
      <PageHeader
        title="GST Rate Check"
        description={<>Store tax configuration vs the statutory rules registry{data ? ` (as of ${data.asOf})` : ''}.
          Findings are for you and your CA — nothing is changed automatically.</>}
      />

      <div className="space-y-3">
        {!data && <div className="text-sm text-gray-500">Checking…</div>}
        {data?.findings?.map((f: any) => (
          <div key={f.code + f.message.slice(0, 20)} className={`rounded-lg border p-4 ${badge[f.severity] ?? badge.info}`}>
            <div className="flex items-center gap-2 font-semibold">
              {f.severity === 'critical' ? <ShieldAlert className="h-5 w-5" />
                : f.severity === 'warning' ? <Info className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              <span className="uppercase text-xs tracking-wide">{f.severity}</span>
              <span className="font-mono text-xs">{f.code}</span>
            </div>
            <p className="mt-1 text-sm">{f.message}</p>
            {f.statutoryRef && <p className="mt-1 text-xs opacity-75">Source: {f.statutoryRef}</p>}
          </div>
        ))}
      </div>
    </Page>
  );
};

export default RateCheck;
