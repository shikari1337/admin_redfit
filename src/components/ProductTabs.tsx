/**
 * The tab strip in the header — the other Growcord products, one click away.
 *
 * The admin used to carry six in-app "workspaces" here (E-commerce · Orders &
 * Fulfilment · Inventory · Purchasing · Accounting · Marketing). Those areas
 * are now their own products on their own hosts — Books, WMS, Make, Ship,
 * CRM, Comms, Reach, Retail, Trade, People, Insights, Finance — so the strip
 * keeps its place and its look, and each tab LINKS there (owner, 2026-09-25).
 * E-commerce is this app and stays the active tab.
 *
 * WHO SEES A TAB. A product is offered when the store has one of the modules
 * its routes gate on AND this person holds a permission in one of its staff
 * areas — the same two questions the sidebar asks of a page. IDENTITY (name,
 * tagline, status, order) comes from the platform (`GET /platform/products`,
 * the public view of `backend/src/config/productRegistry.ts`) so a product
 * added there shows up without an admin release; the list below is the
 * FALLBACK when that request fails and the ONLY home of the gates, which the
 * public catalogue does not publish yet (ADMIN_MODIFICATION_PLAN.md gate G11 —
 * when it does, `modules`/`areas` below go away).
 *
 * WHERE A TAB GOES. `productUrl()` in `lib/menu.ts` — the hub's own sibling
 * rule: `admin.gc.mw` → `books.gc.mw`, `admin-acme.gc.mw` → `books-acme.gc.mw`,
 * localhost → the dev port. Never a hand-typed host. With Growcord ID silent
 * sign-in live on every gc.mw host the link is enough; nothing is minted here
 * and no token ever rides a URL.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { productUrl } from '../lib/menu';

interface ProductTab {
  code: string;
  name: string;
  tagline: string;
  /** ANY of these store modules switched on — the registry's `moduleKeys`. Empty = every store. */
  modules: string[];
  /** ANY permission in one of these areas — the registry's `staffAreas`. Empty = anyone signed in. */
  areas: string[];
  sortOrder: number;
  status: 'live' | 'beta' | 'roadmap';
}

/** Mirror of `productRegistry.ts` (suite products only). Identity is overwritten by the platform when reachable. */
const FALLBACK: ProductTab[] = [
  { code: 'books', name: 'Books', tagline: 'Invoices, bills, banking, GST and the ledger', modules: ['accounting', 'billing'], areas: ['accounting', 'gst', 'billing'], sortOrder: 10, status: 'live' },
  { code: 'ship', name: 'Ship', tagline: 'Parcels, pickups, NDR and COD payouts', modules: ['shipping'], areas: ['shipments', 'returns'], sortOrder: 11, status: 'live' },
  { code: 'comms', name: 'Comms', tagline: 'Every message, its template and its consent', modules: [], areas: ['marketing'], sortOrder: 12, status: 'live' },
  { code: 'insights', name: 'Insights', tagline: 'Profit-true analytics', modules: ['analytics'], areas: ['reports'], sortOrder: 13, status: 'live' },
  { code: 'make', name: 'Make', tagline: 'Purchase orders, vendors, kits and work orders', modules: ['inventory', 'purchasing'], areas: ['purchasing', 'inventory'], sortOrder: 14, status: 'live' },
  { code: 'wms', name: 'WMS', tagline: 'The warehouse floor: layout, picking, goods in, labels', modules: ['wms'], areas: ['inventory', 'warehouse'], sortOrder: 15, status: 'live' },
  { code: 'trade', name: 'Trade', tagline: 'Distribution: beats, schemes, credit', modules: ['orders'], areas: ['b2b', 'partner'], sortOrder: 16, status: 'live' },
  { code: 'retail', name: 'Retail', tagline: 'The counter: till, tenders, day end', modules: ['pos'], areas: ['orders'], sortOrder: 17, status: 'live' },
  { code: 'reach', name: 'Reach', tagline: 'Campaigns, audiences and ads', modules: ['marketing'], areas: ['marketing', 'ads'], sortOrder: 18, status: 'live' },
  { code: 'people', name: 'People', tagline: 'HR & payroll', modules: [], areas: ['hr', 'payroll'], sortOrder: 19, status: 'live' },
  { code: 'crm', name: 'CRM', tagline: 'Contacts, deals and follow-ups', modules: ['crm'], areas: ['marketing', 'customers'], sortOrder: 20, status: 'live' },
  { code: 'finance', name: 'Finance', tagline: 'Bank statements, expenses, personal and business', modules: ['accounting'], areas: ['accounting'], sortOrder: 21, status: 'beta' },
];

interface PublicProduct {
  key?: string;
  name?: string;
  tagline?: string;
  kind?: string;
  status?: string;
  sortOrder?: number;
}

/** One request per page load, shared by every mount. */
let catalogue: Promise<PublicProduct[]> | null = null;
function loadCatalogue(): Promise<PublicProduct[]> {
  if (!catalogue) {
    catalogue = api
      .get('/platform/products')
      .then((res: any) => {
        // The admin's interceptor unwraps `{success,data}`; a bare body survives intact — read both.
        const body = res?.data ?? res;
        const list = body?.products ?? body?.data?.products ?? [];
        return Array.isArray(list) ? (list as PublicProduct[]) : [];
      })
      .catch(() => []);
  }
  return catalogue;
}

/** How many tabs sit inline before the rest fold into "More". */
const MAX_INLINE = 7;

const TAB = 'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors';
const TAB_OFF = 'text-ink-soft hover:bg-surface-2 hover:text-ink';
const TAB_ON = 'bg-ink text-bg shadow-sm';

export const ProductTabs: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const [identity, setIdentity] = useState<PublicProduct[]>([]);
  useEffect(() => {
    let live = true;
    void loadCatalogue().then((list) => { if (live) setIdentity(list); });
    return () => { live = false; };
  }, []);

  const tabs = useMemo(() => {
    const byKey = new Map(identity.map((p) => [p.key, p]));
    return FALLBACK
      .map((t) => {
        const p = byKey.get(t.code);
        return p
          ? { ...t, name: p.name || t.name, tagline: p.tagline || t.tagline, sortOrder: p.sortOrder ?? t.sortOrder, status: (p.status as ProductTab['status']) || t.status }
          : t;
      })
      .filter((t) => t.status !== 'roadmap')
      .filter((t) => t.modules.length === 0 || t.modules.some((m) => canAccess(m)))
      .filter((t) => t.areas.length === 0 || t.areas.some((a) => hasPerm(`${a}.read`) || hasPerm(`${a}.manage`)))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [identity, hasPerm, canAccess]);

  const inline = tabs.slice(0, MAX_INLINE);
  const more = tabs.slice(MAX_INLINE);

  return (
    <nav aria-label="Growcord products" className="flex items-center gap-1 overflow-x-auto">
      <Link to="/dashboard" className={`${TAB} ${TAB_ON}`} aria-current="page">
        E-commerce
      </Link>
      {inline.map((t) => (
        <a key={t.code} href={productUrl(t.code)} className={`${TAB} ${TAB_OFF}`} title={`Growcord ${t.name} — ${t.tagline}`}>
          {t.name}
          {t.status === 'beta' && <span className="ml-1 align-super text-[9px] uppercase tracking-wider text-ink-mute">beta</span>}
        </a>
      ))}
      {more.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={`${TAB} ${TAB_OFF} inline-flex items-center gap-1`} aria-label="More Growcord products">
              More <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {more.map((t) => (
              <DropdownMenuItem key={t.code} asChild>
                <a href={productUrl(t.code)} className="flex cursor-pointer items-start gap-2">
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-ink-mute" />
                  <span className="flex flex-col">
                    <span className="font-medium">{t.name}{t.status === 'beta' ? ' · beta' : ''}</span>
                    <span className="text-xs text-ink-soft">{t.tagline}</span>
                  </span>
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
};

export default ProductTabs;
