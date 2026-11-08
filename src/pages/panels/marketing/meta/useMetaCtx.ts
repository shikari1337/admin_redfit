/**
 * The shared state every Facebook and Instagram screen reads: the setup checklist, the store's catalog channels,
 * the catalog summary and who may change what. The tabbed page builds it once; each tab file also exports a
 * route-ready page that builds its own, so a tab can become its own menu item without being rewritten.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { metaApi, type CatalogSummary, type MetaSetup, type StoreChannel } from '@/lib/v2/areas/meta';
import { useLoad, type Failure } from './common';
import { TAB_ROUTE, metaHref } from './routes';

export type MetaTab = 'setup' | 'catalog' | 'instagram' | 'campaigns' | 'events';

/** Where the tabbed page lives; a standalone screen sends "go to Setup" there. */
export const META_HOME = '/panel/marketing/meta';

export interface MetaCtx {
  setup: MetaSetup | null;
  setupFailure: Failure | null;
  setupLoading: boolean;
  reloadSetup: () => Promise<void>;
  channels: StoreChannel[];
  channelsLoading: boolean;
  reloadChannels: () => Promise<void>;
  fbChannel: StoreChannel | null;
  waChannel: StoreChannel | null;
  summary: CatalogSummary | null;
  summaryFailure: Failure | null;
  reloadSummary: () => Promise<void>;
  goTab: (t: MetaTab) => void;
  can: { setup: boolean; catalog: boolean; ads: boolean; marketing: boolean };
}

/** `goTab` defaults to opening the page that tab became (keeping the development mock flags). */
export function useMetaCtx(goTab?: (t: MetaTab) => void): MetaCtx {
  const { hasPerm } = useAuth();
  const navigate = useNavigate();
  const setupQ = useLoad(() => metaApi.setup(), []);
  const channelsQ = useLoad(() => metaApi.channels(), []);
  const channels = channelsQ.data ?? [];
  const fbChannel = channels.find((c) => c.platform_code === 'facebook_catalog') ?? null;
  const waChannel = channels.find((c) => c.platform_code === 'whatsapp_catalog') ?? null;
  const summaryQ = useLoad(() => (fbChannel ? metaApi.catalogSummary(fbChannel.id) : Promise.resolve(null)), [fbChannel?.id]);

  const can = useMemo(() => ({
    setup: hasPerm('settings.manage'),
    catalog: hasPerm('channels.manage'),
    ads: hasPerm('ads.manage'),
    marketing: hasPerm('marketing.manage'),
  }), [hasPerm]);

  // Each former tab is its own page now (routes.ts); the development mock flags travel along.
  const openTab = useCallback((t: MetaTab) => navigate(metaHref(TAB_ROUTE[t])), [navigate]);

  return {
    setup: setupQ.data,
    setupFailure: setupQ.error,
    setupLoading: setupQ.loading && !setupQ.data,
    reloadSetup: setupQ.reload,
    channels,
    channelsLoading: channelsQ.loading && !channelsQ.data,
    reloadChannels: channelsQ.reload,
    fbChannel,
    waChannel,
    summary: summaryQ.data,
    summaryFailure: summaryQ.error,
    reloadSummary: summaryQ.reload,
    goTab: goTab ?? openTab,
    can,
  };
}
