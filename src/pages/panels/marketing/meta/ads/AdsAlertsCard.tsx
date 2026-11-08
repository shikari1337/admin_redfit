/**
 * Meta ad alerts on Marketing home (contract META-W2 section C, `GET /meta/alerts`): spend without sales, return
 * below the store's target, cost per purchase spikes, people seeing an ad too often, rejections, account and token
 * problems. Each line links to where it is fixed. Shown only to people who may read ads, on stores with ads, and
 * only when there is something to say: a store without Meta sees nothing here.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { metaAdsApi } from '@/lib/v2/areas/meta';
import { ago, linkCls, plural, useLoad } from '../common';
import { ADS_ROUTES, metaHref } from '../routes';
import { alertLink, toneOfAlert } from './shared';

const Alerts: React.FC = () => {
  const q = useLoad(() => metaAdsApi.alerts(), []);
  const list = q.data ?? [];
  if (!list.length) return null;
  const bad = list.filter((a) => toneOfAlert(a.kind) === 'bad').length;
  return (
    <div role="status" className={`rounded-lg border p-4 ${bad ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50/70'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`flex items-center gap-2 text-sm font-semibold ${bad ? 'text-red-900' : 'text-amber-900'}`}>
          <AlertTriangle className="h-4 w-4" strokeWidth={2.25} /> Meta ads: {plural(list.length, 'thing')} to act on
        </p>
        <Link className={`${linkCls} text-sm`} to={metaHref(ADS_ROUTES.manager)}>Ads Manager</Link>
      </div>
      <ul className="mt-2 space-y-1.5 text-sm text-gray-800">
        {list.map((a, i) => {
          const w = alertLink(a);
          return (
            <li key={`${a.kind}-${a.id ?? i}`} className="flex flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 flex-1">{a.text}{a.since ? <span className="text-xs text-gray-500"> ({ago(a.since)})</span> : null}</span>
              <Link className={`${linkCls} text-xs`} to={w.to}>{w.label}</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Renders nothing for people who may not read ads or stores without the ads modules. */
const AdsAlertsCard: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  if (!hasPerm('ads.read') || !canAccess('ads_management') || !canAccess('marketing')) return null;
  return <Alerts />;
};

export default AdsAlertsCard;
