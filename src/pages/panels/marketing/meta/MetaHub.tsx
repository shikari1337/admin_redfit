/**
 * Marketing > Social > Facebook and Instagram (`/panel/marketing/meta`). Wave 1 (META-5) built this as one page with
 * five tabs; the redesigned Marketing menu (META-MASTER section 1) made each tab its own menu item: Setup stays
 * here, Catalog, Instagram and Events moved to their own paths, and Campaigns became the Ads Manager. An old link
 * with `?tab=` lands on the page that tab became, keeping the rest of the query.
 */
import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { SetupPage } from './SetupTab';
import { TAB_ROUTE } from './routes';
import type { MetaTab } from './useMetaCtx';

export type { MetaCtx, MetaTab } from './useMetaCtx';

const MetaHub: React.FC = () => {
  const [sp] = useSearchParams();
  const tab = sp.get('tab') as MetaTab | null;
  if (tab && tab !== 'setup' && TAB_ROUTE[tab]) {
    const rest = new URLSearchParams(sp);
    rest.delete('tab');
    const q = rest.toString();
    return <Navigate to={`${TAB_ROUTE[tab]}${q ? `?${q}` : ''}`} replace />;
  }
  return <SetupPage />;
};

export default MetaHub;
